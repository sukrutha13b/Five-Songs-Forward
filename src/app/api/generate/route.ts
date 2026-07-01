import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, getUserProfile } from '@/lib/spotify';
import { interpretSeeds, explainTrackMatch } from '@/lib/llm';
import { gatherCandidates, rankAndSelect, generatePlaylistOnSpotify } from '@/lib/matching';
import { SeedTrack } from '@/lib/types';

// NOTE: Per-instance in-memory rate limit — fine for a single-user MVP demo.
// If deployed on multi-instance serverless, this will not enforce across instances.
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  rateLimitMap.set(userId, recent);
  return true;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let currentUserEmail: string | null = null;

  try {
    const body = await request.json();
    const seeds: SeedTrack[] = body.seeds;

    if (!seeds || seeds.length < 3 || seeds.length > 5) {
      return NextResponse.json({ error: 'Must provide 3-5 seed tracks' }, { status: 400 });
    }

    for (const seed of seeds) {
      if (!seed.id || !seed.artistId) {
        return NextResponse.json({ error: 'Each seed must have id and artistId' }, { status: 400 });
      }
    }

    let accessToken: string;
    try {
      accessToken = await getValidToken();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUserProfile(accessToken);
    currentUserEmail = user.email;
    console.log(
      `[FSF] Generation started — id=${user.id} email=${user.email ?? '<none>'} — ${seeds.length} seeds`
    );

    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again in a minute.' },
        { status: 429 }
      );
    }

    const llmStart = Date.now();
    const llmInterpretation = await interpretSeeds(seeds);
    console.log(
      `[FSF] LLM interpretation — ${llmInterpretation ? 'ok' : 'null'} — ${Date.now() - llmStart}ms`
    );

    const candidates = await gatherCandidates(accessToken, seeds, llmInterpretation);
    const sourceCounts = {
      catalogue: candidates.filter((c) => c.source === 'catalogue').length,
      artist: candidates.filter((c) => c.source === 'artist-suggestion').length,
      recent: candidates.filter((c) => c.source === 'recently-played').length,
    };
    console.log(
      `[FSF] Candidates — ${candidates.length} (catalogue:${sourceCounts.catalogue} artist:${sourceCounts.artist} recent:${sourceCounts.recent})`
    );

    const finalTracks = rankAndSelect(candidates);

    if (finalTracks.length === 0) {
      return NextResponse.json(
        { error: 'Could not build a playlist — no candidates found. Try different seeds.' },
        { status: 502 }
      );
    }

    const finalCounts = {
      catalogue: finalTracks.filter((t) => t.source === 'catalogue').length,
      artist: finalTracks.filter((t) => t.source === 'artist-suggestion').length,
      recent: finalTracks.filter((t) => t.source === 'recently-played').length,
    };
    console.log(
      `[FSF] Final ${finalTracks.length} selected — catalogue:${finalCounts.catalogue} artist:${finalCounts.artist} recent:${finalCounts.recent}`
    );

    // Serialize explanation calls (not parallel) so we don't burst the LLM
    // rate limit. Skip entirely if seed interpretation already failed — both
    // providers are likely exhausted, no point piling on.
    if (llmInterpretation) {
      for (const track of finalTracks.slice(0, 3)) {
        try {
          track.explanation = await explainTrackMatch(track, seeds);
        } catch {
          // Skip explanation on failure
        }
      }
    }

    const playlist = await generatePlaylistOnSpotify(
      accessToken,
      user.id,
      seeds,
      finalTracks,
      llmInterpretation?.directionSummary
    );

    console.log(
      `[FSF] Playlist created — ${playlist.spotifyPlaylistId} — total ${Date.now() - startTime}ms`
    );

    return NextResponse.json(playlist);
  } catch (error) {
    console.error('[FSF] Generation failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    const detail = currentUserEmail
      ? `[account=${currentUserEmail}] ${message}`
      : message;
    return NextResponse.json(
      { error: 'Failed to generate playlist', detail },
      { status: 500 }
    );
  }
}
