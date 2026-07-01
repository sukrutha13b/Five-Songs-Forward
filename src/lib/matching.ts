import { SeedTrack, CandidateTrack, CandidateSource, LLMInterpretation } from './types';
import { searchTracks, getRecentlyPlayed, createPlaylist } from './spotify';

const TARGET_TRACKS = 25;
const MAX_PER_ARTIST = 3;

const SOURCE_WEIGHT: Record<CandidateSource, number> = {
  catalogue: 1.0,
  'artist-suggestion': 0.9,
  'recently-played': 0.6,
};

interface ScoredCandidate extends CandidateTrack {
  queryRank: number;
}

export async function gatherCandidates(
  accessToken: string,
  seeds: SeedTrack[],
  llmInterpretation: LLMInterpretation | null
): Promise<ScoredCandidate[]> {
  const seedIds = new Set(seeds.map((s) => s.id));
  const seen = new Map<string, ScoredCandidate>();

  const addCandidate = (
    track: SeedTrack,
    source: CandidateSource,
    queryRank: number
  ) => {
    if (seedIds.has(track.id)) return;
    const existing = seen.get(track.id);
    if (existing) {
      // Keep the higher-weighted source if the track shows up multiple times.
      if (SOURCE_WEIGHT[source] > SOURCE_WEIGHT[existing.source]) {
        existing.source = source;
      }
      existing.queryRank = Math.min(existing.queryRank, queryRank);
      return;
    }
    seen.set(track.id, {
      ...track,
      source,
      queryRank,
      score: 0,
    });
  };

  const searchQueries = llmInterpretation?.searchQueries?.length
    ? llmInterpretation.searchQueries.slice(0, 5)
    : fallbackQueries(seeds);

  const artistQueries = (llmInterpretation?.artistSuggestions ?? []).slice(0, 5);

  const [catalogueResults, artistResults, recent] = await Promise.all([
    Promise.all(searchQueries.map((q) => searchTracks(accessToken, q, 20))),
    Promise.all(artistQueries.map((a) => searchTracks(accessToken, `artist:${a}`, 10))),
    getRecentlyPlayed(accessToken, 50).catch(() => [] as SeedTrack[]),
  ]);

  catalogueResults.forEach((tracks, qIdx) => {
    tracks.forEach((track, tIdx) => {
      addCandidate(track, 'catalogue', qIdx * 100 + tIdx);
    });
  });

  artistResults.forEach((tracks, qIdx) => {
    tracks.forEach((track, tIdx) => {
      addCandidate(track, 'artist-suggestion', qIdx * 100 + tIdx);
    });
  });

  const seedArtistIds = new Set(seeds.map((s) => s.artistId));
  recent.forEach((track, idx) => {
    // Only "flavor" recent tracks that aren't already by a seed artist.
    if (seedArtistIds.has(track.artistId)) return;
    addCandidate(track, 'recently-played', idx);
  });

  return [...seen.values()];
}

function fallbackQueries(seeds: SeedTrack[]): string[] {
  const artists = [...new Set(seeds.map((s) => s.artist))];
  return artists.slice(0, 5);
}

export function rankAndSelect(candidates: ScoredCandidate[]): CandidateTrack[] {
  for (const c of candidates) {
    // Higher rank number = later in the search result list = lower score.
    const rankScore = 1 / (1 + c.queryRank * 0.02);
    c.score = SOURCE_WEIGHT[c.source] * rankScore;
  }

  candidates.sort((a, b) => b.score - a.score);

  const selected: CandidateTrack[] = [];
  const artistCount = new Map<string, number>();
  const selectedIds = new Set<string>();

  // First pass: honor the artist cap.
  for (const c of candidates) {
    if (selected.length >= TARGET_TRACKS) break;
    const key = c.artistId || c.artist;
    const count = artistCount.get(key) || 0;
    if (count >= MAX_PER_ARTIST) continue;
    selected.push(stripInternal(c));
    artistCount.set(key, count + 1);
    selectedIds.add(c.id);
  }

  // Second pass: if we're still short, relax the artist cap to hit 25.
  if (selected.length < TARGET_TRACKS) {
    for (const c of candidates) {
      if (selected.length >= TARGET_TRACKS) break;
      if (selectedIds.has(c.id)) continue;
      selected.push(stripInternal(c));
      selectedIds.add(c.id);
    }
  }

  // Shuffle so the highest-score track isn't always first.
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }

  return selected;
}

function stripInternal(c: ScoredCandidate): CandidateTrack {
  const { queryRank: _q, ...rest } = c;
  void _q;
  return rest;
}

export async function generatePlaylistOnSpotify(
  accessToken: string,
  userId: string,
  seeds: SeedTrack[],
  tracks: CandidateTrack[],
  directionSummary: string | undefined
) {
  const date = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const name = `Five Songs Forward — ${date}`;
  const seedNames = seeds.map((s) => s.name).join(', ');
  const rawDescription = `Direction: ${directionSummary || 'Based on your seed tracks'}. Seeds: ${seedNames}.`;
  const description = truncate(rawDescription, 300);
  const trackUris = tracks.map((t) => t.uri);

  const result = await createPlaylist(accessToken, userId, name, description, trackUris);

  return {
    spotifyPlaylistId: result.playlistId,
    spotifyPlaylistUrl: result.playlistUrl,
    tracks,
    seedSummary: directionSummary || `A playlist inspired by ${seedNames}`,
  };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}
