import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, getAudioFeatures, getUserProfile } from '@/lib/spotify';
import { interpretSeeds, explainTrackMatch } from '@/lib/llm';
import { computeSeedCentroid, gatherCandidates, rankAndSelect, generatePlaylistOnSpotify } from '@/lib/matching';
import { SeedTrack, SeedWithFeatures } from '@/lib/types';

const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) || [];
  const recent = timestamps.filter((t) => now - t < 60000);
  if (recent.length >= 5) return false;
  recent.push(now);
  rateLimitMap.set(userId, recent);
  return true;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

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

    // Auth
    let accessToken: string;
    try {
      accessToken = await getValidToken(request.cookies);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // User profile
    const user = await getUserProfile(accessToken);
    console.log(`[FSF] Generation started — ${user.id} — ${seeds.length} seeds`);

    // Rate limit
    if (!checkRateLimit(user.id)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again in a minute.' }, { status: 429 });
    }

    // Audio features for seeds
    const featureStart = Date.now();
    const seedIds = seeds.map((s) => s.id);
    const featuresMap = await getAudioFeatures(accessToken, seedIds);
    console.log(`[FSF] Audio features fetched — ${Date.now() - featureStart}ms`);

    const seedsWithFeatures: SeedWithFeatures[] = seeds.map((s) => ({
      ...s,
      features: featuresMap?.get(s.id) || null,
    }));

    // LLM interpretation
    const llmStart = Date.now();
    const llmInterpretation = await interpretSeeds(seedsWithFeatures);
    const llmProvider = llmInterpretation ? 'groq/gemini' : 'null';
    console.log(`[FSF] LLM interpretation — ${llmProvider} — ${Date.now() - llmStart}ms`);

    // Compute centroid
    const centroid = computeSeedCentroid(seedsWithFeatures);

    // Gather candidates
    const candidates = await gatherCandidates(accessToken, seeds, llmInterpretation);
    const sourceCounts = {
      catalogue: candidates.filter((c) => c.source === 'catalogue').length,
      related: candidates.filter((c) => c.source === 'related-artist').length,
      library: candidates.filter((c) => c.source === 'rescued-library').length,
    };
    console.log(`[FSF] Candidates gathered — ${candidates.length} tracks from catalogue:${sourceCounts.catalogue} related:${sourceCounts.related} library:${sourceCounts.library}`);

    // Rank and select
    const finalTracks = await rankAndSelect(
      accessToken,
      candidates,
      centroid,
      llmInterpretation?.targetFeatures || null
    );

    const finalSourceCounts = {
      catalogue: finalTracks.filter((t) => t.source === 'catalogue').length,
      related: finalTracks.filter((t) => t.source === 'related-artist').length,
      library: finalTracks.filter((t) => t.source === 'rescued-library').length,
    };
    console.log(`[FSF] Final ${finalTracks.length} selected — catalogue:${finalSourceCounts.catalogue} related:${finalSourceCounts.related} library:${finalSourceCounts.library}`);

    // Generate explanations for first 5 tracks (non-blocking)
    const explanationPromises = finalTracks.slice(0, 5).map(async (track) => {
      try {
        track.explanation = await explainTrackMatch(track, seeds);
      } catch {
        // Skip explanation on failure
      }
    });
    await Promise.all(explanationPromises);

    // Create playlist
    const playlist = await generatePlaylistOnSpotify(
      accessToken,
      user.id,
      seeds,
      finalTracks,
      llmInterpretation?.directionSummary
    );

    console.log(`[FSF] Playlist created — ${playlist.spotifyPlaylistId} — total ${Date.now() - startTime}ms`);

    return NextResponse.json(playlist);
  } catch (error) {
    console.error('[FSF] Generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate playlist', phase: 'unknown' },
      { status: 500 }
    );
  }
}
