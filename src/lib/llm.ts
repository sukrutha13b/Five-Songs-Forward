import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SeedTrack, LLMInterpretation } from './types';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GEMINI_MODEL = 'gemini-2.0-flash';

const INTERPRET_MAX_TOKENS = 1200;

const MAX_RETRIES = 1;
const BASE_BACKOFF_MS = 800;
const MAX_BACKOFF_MS = 4000;
const HARD_RETRY_CAP_MS = 5000;

// Process-wide token bucket. Free tiers sit around 30 RPM on Groq and 15 RPM on
// Gemini. We stay well below by capping total LLM requests to 25/min across the
// whole server. Serverless cold instances each get their own bucket — acceptable
// for MVP; real production would need Redis.
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

async function callGroq(prompt: string, maxTokens: number): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' as const },
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

async function callGemini(prompt: string, maxTokens: number): Promise<string | null> {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
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

async function callLLM(prompt: string, maxTokens: number): Promise<string | null> {
  if (!tryConsume()) {
    console.warn('LLM local token bucket empty — skipping call');
    return null;
  }

  try {
    const groqResult = await callGroq(prompt, maxTokens);
    if (groqResult) return groqResult;
  } catch (error) {
    if (!isRateLimit(error)) {
      console.warn('Unexpected Groq error post-retry:', error);
      return null;
    }
    console.warn('Groq exhausted, falling back to Gemini');
  }

  return await callGemini(prompt, maxTokens);
}

export async function interpretSeeds(seeds: SeedTrack[]): Promise<LLMInterpretation | null> {
  const seedDescriptions = seeds.map((s) => `- ${s.name} by ${s.artist}`).join('\n');

  const prompt = `You are a music taste analyst. The user has chosen these seed tracks as their new musical direction:

${seedDescriptions}

Your job is to read these seeds as a set and articulate where the user is pointing. Then produce retrieval targets that a Spotify catalogue search will use to find 25 forward-looking tracks.

You will produce two lists that drive Spotify's catalogue search:

1. "artists" — 15 to 25 top-of-scene artists that fit the direction. The backend will search Spotify for each and pull their tracks. These are the safe, familiar-adjacent picks.

2. "keywords" — 10 to 15 SHORT Spotify search queries (1-3 words each). These get typed into Spotify search verbatim, then we skip the top 15 mainstream results and take results 15-55. Their whole job is to surface artists you did NOT name in the "artists" list — the deep-cut discoveries.

Because we skip the top mainstream results, keywords MUST be niche sub-genre or micro-scene tags that a smaller, more obscure world of artists uses. Broad umbrella genres ("indie folk", "shoegaze", "chamber pop") will still return your top-of-scene artists in results 15-55 — that's not what we want. Instead, go NICHE:

  Good keyword examples: "midwest emo", "sadcore", "twee pop", "slowcore revival", "american primitivism", "bedroom pop indie", "dungeon synth folk", "post-rock ambient", "freak folk", "jangle pop", "riot grrrl", "no-fi indie", "britpop b-sides".

  Bad keyword examples (too broad, returns same names): "indie folk", "shoegaze", "chamber pop", "post-rock".

  Never use these (return nothing useful): mood adjectives ("melancholic", "wistful"), descriptive phrases ("poetic lyrics", "emotive soundscape"), sentence fragments.

Return ONLY valid JSON with this exact structure (no prose, no markdown, no code fences):
{
  "directionSummary": "1-2 sentences describing where these seeds are pointing musically — the vibe, the era, the scene, the emotional register.",
  "artists": ["15 to 25 artist names whose catalogue fits this direction. Do NOT repeat any artist that appears in the seeds. Real artists only, no invented names."],
  "keywords": ["10 to 15 niche sub-genre or micro-scene tags, 1-3 words each. Follow the guidance above about niche vs broad."]
}`;

  const result = await callLLM(prompt, INTERPRET_MAX_TOKENS);
  if (!result) return null;

  const parsed = tryParseJson(result);
  if (!parsed) {
    console.warn('Failed to parse LLM interpretation JSON');
    return null;
  }
  return {
    directionSummary: String(parsed.directionSummary ?? ''),
    artists: coerceStringArray(parsed.artists),
    keywords: coerceStringArray(parsed.keywords),
  };
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // fall through to bracket-match
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
