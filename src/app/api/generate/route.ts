import { NextRequest, NextResponse } from 'next/server';
import { interpretSeeds } from '@/lib/llm';
import { gatherCandidates, rankAndSelect } from '@/lib/matching';
import { GeneratedPlaylist, SeedTrack } from '@/lib/types';

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

    const llmStart = Date.now();
    const llmInterpretation = await interpretSeeds(seeds);
    console.log(
      `[FSF] LLM interpretation — ${llmInterpretation ? 'ok' : 'null'} — ${Date.now() - llmStart}ms`
    );

    if (!llmInterpretation) {
      return NextResponse.json(
        {
          error:
            'Recommendation engine is temporarily unavailable. Please try again in a few minutes.',
        },
        { status: 503 }
      );
    }

    const { candidates, namedArtistCount, discoveryCount } = await gatherCandidates(
      seeds,
      llmInterpretation
    );
    console.log(
      `[FSF] Candidates — ${candidates.length} (named:${namedArtistCount} discovery:${discoveryCount})`
    );

    const finalTracks = rankAndSelect(candidates);
    const finalNamed = finalTracks.filter((t) => t.source === 'named-artist').length;
    const finalDiscovery = finalTracks.filter((t) => t.source === 'discovery').length;
    console.log(`[FSF] Final ${finalTracks.length} — named:${finalNamed} discovery:${finalDiscovery}`);

    if (finalTracks.length === 0) {
      return NextResponse.json(
        { error: 'Could not build a playlist — no candidates found. Try different seeds.' },
        { status: 502 }
      );
    }

    console.log(`[FSF] Total ${Date.now() - startTime}ms`);

    const playlist: GeneratedPlaylist = {
      directionSummary: llmInterpretation.directionSummary,
      tracks: finalTracks,
    };

    return NextResponse.json(playlist);
  } catch (error) {
    console.error('[FSF] Generation failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to generate playlist', detail: message },
      { status: 500 }
    );
  }
}
