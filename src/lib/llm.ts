import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SeedWithFeatures, SeedTrack, CandidateTrack, LLMInterpretation } from './types';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function callLLM(prompt: string, systemPrompt?: string): Promise<string | null> {
  // Try Groq first
  try {
    const messages: { role: 'system' | 'user'; content: string }[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;
    if (content) return content;
  } catch (error) {
    console.warn('Groq failed, falling back to Gemini:', error);
  }

  // Fallback to Gemini
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const result = await model.generateContent(fullPrompt);
    const text = result.response.text();
    if (text) return text;
  } catch (error) {
    console.warn('Gemini also failed:', error);
  }

  return null;
}

export async function interpretSeeds(seeds: SeedWithFeatures[]): Promise<LLMInterpretation | null> {
  const seedDescriptions = seeds.map((s) => {
    if (s.features) {
      return `- ${s.name} by ${s.artist} (energy: ${s.features.energy}, acousticness: ${s.features.acousticness}, valence: ${s.features.valence}, tempo: ${s.features.tempo})`;
    }
    return `- ${s.name} by ${s.artist}`;
  }).join('\n');

  const prompt = `You are a music taste analyst. Given these seed tracks the user has chosen as their new musical direction, analyze the common patterns and return a JSON response.

Seed tracks:
${seedDescriptions}

Return ONLY valid JSON with this structure:
{
  "directionSummary": "A 2-sentence description of the musical direction these seeds suggest",
  "searchQueries": ["5 Spotify search queries that would find tracks in this direction"],
  "targetFeatures": {
    "energy": { "min": 0.0, "max": 1.0 },
    "acousticness": { "min": 0.0, "max": 1.0 },
    "valence": { "min": 0.0, "max": 1.0 },
    "tempo": { "min": 60, "max": 200 }
  },
  "genreKeywords": ["up to 5 genre or mood keywords"]
}`;

  const result = await callLLM(prompt);
  if (!result) return null;

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as LLMInterpretation;
  } catch {
    console.warn('Failed to parse LLM interpretation JSON');
    return null;
  }
}

export async function explainTrackMatch(
  track: CandidateTrack,
  seeds: SeedTrack[]
): Promise<string | undefined> {
  const seedNames = seeds.map((s) => `${s.name} by ${s.artist}`).join(', ');
  const prompt = `In one sentence, explain why '${track.name}' by '${track.artist}' matches the musical direction set by these seeds: ${seedNames}. Be specific about what musical qualities connect them.`;

  const result = await callLLM(prompt);
  return result || undefined;
}
