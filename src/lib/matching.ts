import { SeedTrack, CandidateTrack, CandidateSource, LLMInterpretation } from './types';
import { searchTracks } from './spotify';

const TARGET_TRACKS = 25;
const MAX_PER_ARTIST = 2;
const ARTIST_QUERY_LIMIT = 6;
const KEYWORD_QUERY_LIMIT = 40;
const KEYWORD_QUERY_OFFSET = 15; // skip the mainstream — top hits are always the artists the LLM named
const MAX_ARTIST_QUERIES = 25;
const MAX_KEYWORD_QUERIES = 15;

// Source quotas — deliberately biased toward discovery so the app surfaces
// artists the LLM did not name (the whole point of "forward-looking").
const DISCOVERY_TARGET = 15;
const NAMED_TARGET = 10;

interface ScoredCandidate extends CandidateTrack {
  queryRank: number;
}

export interface CandidateBreakdown {
  candidates: ScoredCandidate[];
  namedArtistCount: number;
  discoveryCount: number;
}

function normalizeArtist(name: string): string {
  return name.toLowerCase().trim();
}

export async function gatherCandidates(
  seeds: SeedTrack[],
  llm: LLMInterpretation
): Promise<CandidateBreakdown> {
  const seedIds = new Set(seeds.map((s) => s.id));

  const artists = llm.artists.slice(0, MAX_ARTIST_QUERIES);
  const keywords = llm.keywords.slice(0, MAX_KEYWORD_QUERIES);

  // The named-artist set is built from the LLM's list directly — NOT from search
  // results. Search results include collaborators and features whose primary
  // artist is unrelated (e.g. artist:"The National" returns a Taylor Swift
  // track). Using the LLM list keeps classification honest.
  const namedArtistNames = new Set(artists.map(normalizeArtist));

  const [artistResults, keywordResults] = await Promise.all([
    Promise.all(artists.map((a) => searchTracks(`artist:"${a}"`, ARTIST_QUERY_LIMIT))),
    Promise.all(
      keywords.map((k) => searchTracks(k, KEYWORD_QUERY_LIMIT, KEYWORD_QUERY_OFFSET))
    ),
  ]);

  const classify = (track: SeedTrack): CandidateSource =>
    namedArtistNames.has(normalizeArtist(track.artist)) ? 'named-artist' : 'discovery';

  const seen = new Map<string, ScoredCandidate>();
  const addCandidate = (track: SeedTrack, queryRank: number) => {
    if (seedIds.has(track.id)) return;
    const existing = seen.get(track.id);
    if (existing) {
      existing.queryRank = Math.min(existing.queryRank, queryRank);
      return;
    }
    seen.set(track.id, {
      ...track,
      source: classify(track),
      queryRank,
      score: 0,
    });
  };

  artistResults.forEach((tracks, qIdx) => {
    tracks.forEach((track, tIdx) => {
      addCandidate(track, qIdx * 100 + tIdx);
    });
  });

  keywordResults.forEach((tracks, qIdx) => {
    tracks.forEach((track, tIdx) => {
      addCandidate(track, (MAX_ARTIST_QUERIES + qIdx) * 100 + tIdx);
    });
  });

  const candidates = [...seen.values()];
  return {
    candidates,
    namedArtistCount: candidates.filter((c) => c.source === 'named-artist').length,
    discoveryCount: candidates.filter((c) => c.source === 'discovery').length,
  };
}

export function rankAndSelect(candidates: ScoredCandidate[]): CandidateTrack[] {
  for (const c of candidates) {
    c.score = 1 / (1 + c.queryRank * 0.02);
  }
  candidates.sort((a, b) => b.score - a.score);

  const discoveryPool = candidates.filter((c) => c.source === 'discovery');
  const namedPool = candidates.filter((c) => c.source === 'named-artist');

  const selected: CandidateTrack[] = [];
  const artistCount = new Map<string, number>();
  const selectedIds = new Set<string>();

  const pickFrom = (pool: ScoredCandidate[], target: number) => {
    let taken = 0;
    for (const c of pool) {
      if (selected.length >= TARGET_TRACKS || taken >= target) break;
      if (selectedIds.has(c.id)) continue;
      const key = c.artistId || c.artist;
      if ((artistCount.get(key) || 0) >= MAX_PER_ARTIST) continue;
      selected.push(stripInternal(c));
      artistCount.set(key, (artistCount.get(key) || 0) + 1);
      selectedIds.add(c.id);
      taken++;
    }
  };

  pickFrom(discoveryPool, DISCOVERY_TARGET);
  pickFrom(namedPool, NAMED_TARGET);

  // Backfill if either quota came up short.
  if (selected.length < TARGET_TRACKS) {
    const remaining = candidates.filter((c) => !selectedIds.has(c.id));
    for (const c of remaining) {
      if (selected.length >= TARGET_TRACKS) break;
      const key = c.artistId || c.artist;
      if ((artistCount.get(key) || 0) >= MAX_PER_ARTIST) continue;
      selected.push(stripInternal(c));
      artistCount.set(key, (artistCount.get(key) || 0) + 1);
      selectedIds.add(c.id);
    }
  }

  // Last-ditch: relax the artist cap if still short.
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
