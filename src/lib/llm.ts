import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SeedTrack, CandidateTrack, LLMInterpretation } from './types';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GEMINI_MODEL = 'gemini-2.0-flash';

const INTERPRET_MAX_TOKENS = 500;
const EXPLAIN_MAX_TOKENS = 80;

const MAX_RETRIES = 1;
const BASE_BACKOFF_MS = 800;
const MAX_BACKOFF_MS = 4000;
const HARD_RETRY_CAP_MS = 5000; // never wait longer than this for Retry-After

// Process-wide token bucket. Free tiers sit around 30 RPM on Groq and 15 RPM on
// Gemini. We stay well below by capping total LLM requests to 25/min across the
// whole server. Serverless cold instances each get their own bucket — that's
// acceptable for the MVP; real production would need Redis.
const BUCKET_WINDOW_MS = 60_000;
const BUCKET_MAX = 25;
const bucket: number[] = [];

function tryConsume(): boolean {
  const now = Date.now();
  while (bucket.length && now - bucket[0] > BUCKET_WINDOW_MS) bucket.shift();
  if (bucket.length >= BUCKET_MAX) return false;
  bucket.push(now);
  return true;
}

interface HttpishError {
  status?: number;
  code?: string | number;
  message?: string;
  headers?: Record<string, string> | { get?: (k: string) => string | null };
  response?: { status?: number; headers?: Record<string, string> };
}

function asErr(e: unknown): HttpishError {
  return (e && typeof e === 'object' ? e : {}) as HttpishError;
}

function isRateLimit(err: unknown): boolean {
  const e = asErr(err);
  if (e.status === 429 || e.response?.status === 429) return true;
  if (String(e.code) === '429') return true;
  if (typeof e.message === 'string' && /rate.?limit|too many requests|quota|\b429\b/i.test(e.message)) return true;
  return false;
}

function readRetryAfterMs(err: unknown): number | null {
  const e = asErr(err);
  const headers = e.headers ?? e.response?.headers;
  if (!headers) return null;

  let raw: string | null | undefined;
  if (typeof (headers as { get?: (k: string) => string | null }).get === 'function') {
    raw = (headers as { get: (k: string) => string | null }).get('retry-after');
  } else {
    const h = headers as Record<string, string>;
    raw = h['retry-after'] ?? h['Retry-After'];
  }
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function backoffMs(attempt: number): number {
  const jitter = Math.random() * 250;
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt + jitter);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function callGroq(prompt: string, maxTokens: number, jsonMode: boolean): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      });
      const content = completion.choices[0]?.message?.content;
      return content ?? null;
    } catch (error) {
      if (!isRateLimit(error) || attempt === MAX_RETRIES) {
        if (isRateLimit(error)) throw error; // let caller fall through to Gemini
        console.warn('Groq call failed (non-rate-limit):', error);
        return null;
      }
      const wait = Math.min(HARD_RETRY_CAP_MS, readRetryAfterMs(error) ?? backoffMs(attempt));
      console.warn(`Groq 429, retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(wait);
    }
  }
  return null;
}

async function callGemini(prompt: string, maxTokens: number, jsonMode: boolean): Promise<string | null> {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      maxOutputTokens: maxTokens,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return text || null;
    } catch (error) {
      if (!isRateLimit(error) || attempt === MAX_RETRIES) {
        console.warn(
          isRateLimit(error) ? 'Gemini rate-limited, no retries left' : 'Gemini call failed:',
          error
        );
        return null;
      }
      const wait = Math.min(HARD_RETRY_CAP_MS, readRetryAfterMs(error) ?? backoffMs(attempt));
      console.warn(`Gemini 429, retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(wait);
    }
  }
  return null;
}

async function callLLM(prompt: string, maxTokens: number, jsonMode: boolean): Promise<string | null> {
  if (!tryConsume()) {
    console.warn('LLM local token bucket empty — skipping call');
    return null;
  }

  try {
    const groqResult = await callGroq(prompt, maxTokens, jsonMode);
    if (groqResult) return groqResult;
  } catch (error) {
    if (!isRateLimit(error)) {
      console.warn('Unexpected Groq error post-retry:', error);
      return null;
    }
    console.warn('Groq exhausted, falling back to Gemini');
  }

  return await callGemini(prompt, maxTokens, jsonMode);
}

export async function interpretSeeds(seeds: SeedTrack[]): Promise<LLMInterpretation | null> {
  const seedDescriptions = seeds.map((s) => `- ${s.name} by ${s.artist}`).join('\n');

  const prompt = `You are a music taste analyst. The user has chosen these seed tracks as their new musical direction:

${seedDescriptions}

Return ONLY valid JSON with this structure (no prose, no markdown):
{
  "directionSummary": "2 sentences describing where these seeds are pointing musically",
  "searchQueries": ["5 short Spotify search queries that would surface tracks matching this direction — mix of genre words, mood words, and adjacent scene names"],
  "artistSuggestions": ["up to 5 artist names (not from the seed list) whose catalogue fits this direction"],
  "genreKeywords": ["up to 5 genre or mood tags"]
}`;

  const result = await callLLM(prompt, INTERPRET_MAX_TOKENS, true);
  if (!result) return null;

  const parsed = tryParseJson(result);
  if (!parsed) {
    console.warn('Failed to parse LLM interpretation JSON');
    return null;
  }
  return {
    directionSummary: String(parsed.directionSummary ?? ''),
    searchQueries: coerceStringArray(parsed.searchQueries),
    artistSuggestions: coerceStringArray(parsed.artistSuggestions),
    genreKeywords: coerceStringArray(parsed.genreKeywords),
  };
}

export async function explainTrackMatch(
  track: CandidateTrack,
  seeds: SeedTrack[]
): Promise<string | undefined> {
  const seedNames = seeds.map((s) => `${s.name} by ${s.artist}`).join(', ');
  const prompt = `In one sentence (no JSON, no quotes), explain why "${track.name}" by ${track.artist} matches the musical direction set by these seeds: ${seedNames}. Be specific about the musical quality that connects them.`;

  const result = await callLLM(prompt, EXPLAIN_MAX_TOKENS, false);
  return result?.trim() || undefined;
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // fall through
  }
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}
