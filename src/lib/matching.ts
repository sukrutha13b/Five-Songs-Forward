import { AudioFeatures, SeedWithFeatures, SeedTrack, CandidateTrack, LLMInterpretation } from './types';
import { searchTracks, getRelatedArtists, getArtistTopTracks, getUserSavedTracks, getAudioFeatures, createPlaylist } from './spotify';

export function computeSeedCentroid(seeds: SeedWithFeatures[]): AudioFeatures | null {
  const withFeatures = seeds.filter((s) => s.features !== null);
  if (withFeatures.length === 0) return null;

  const sum: AudioFeatures = {
    energy: 0, acousticness: 0, valence: 0, tempo: 0,
    instrumentalness: 0, danceability: 0, liveness: 0,
  };

  for (const s of withFeatures) {
    const f = s.features!;
    sum.energy += f.energy;
    sum.acousticness += f.acousticness;
    sum.valence += f.valence;
    sum.tempo += f.tempo;
    sum.instrumentalness += f.instrumentalness;
    sum.danceability += f.danceability;
    sum.liveness += f.liveness;
  }

  const n = withFeatures.length;
  return {
    energy: sum.energy / n,
    acousticness: sum.acousticness / n,
    valence: sum.valence / n,
    tempo: sum.tempo / n,
    instrumentalness: sum.instrumentalness / n,
    danceability: sum.danceability / n,
    liveness: sum.liveness / n,
  };
}

export function computeSimilarity(trackFeatures: AudioFeatures, centroid: AudioFeatures): number {
  const vecA = [
    trackFeatures.energy, trackFeatures.acousticness, trackFeatures.valence,
    trackFeatures.tempo / 200, trackFeatures.instrumentalness, trackFeatures.danceability,
  ];
  const vecB = [
    centroid.energy, centroid.acousticness, centroid.valence,
    centroid.tempo / 200, centroid.instrumentalness, centroid.danceability,
  ];

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

export async function gatherCandidates(
  accessToken: string,
  seeds: SeedTrack[],
  llmInterpretation: LLMInterpretation | null
): Promise<CandidateTrack[]> {
  const seedIds = new Set(seeds.map((s) => s.id));
  const seen = new Set<string>();
  const candidates: CandidateTrack[] = [];

  const addCandidate = (track: SeedTrack, source: CandidateTrack['source']) => {
    if (seedIds.has(track.id) || seen.has(track.id)) return;
    seen.add(track.id);
    candidates.push({ ...track, features: null, source, score: 0 });
  };

  // Source 1: Catalogue search
  const queries = llmInterpretation?.searchQueries ||
    seeds.map((s, i) => i < seeds.length - 1 ? `${s.artist} ${seeds[i + 1].artist}` : s.artist);

  const searchPromises = queries.slice(0, 5).map((q) => searchTracks(accessToken, q, 20));
  const searchResults = await Promise.all(searchPromises);
  for (const tracks of searchResults) {
    for (const track of tracks) {
      addCandidate(track, 'catalogue');
    }
  }

  // Source 2: Related-artist graph walk
  const uniqueArtistIds = [...new Set(seeds.map((s) => s.artistId))];
  const relatedPromises = uniqueArtistIds.map((id) => getRelatedArtists(accessToken, id));
  const relatedResults = await Promise.all(relatedPromises);

  const artistFrequency = new Map<string, { id: string; name: string; count: number }>();
  for (const artists of relatedResults) {
    for (const artist of artists) {
      const existing = artistFrequency.get(artist.id);
      if (existing) {
        existing.count++;
      } else {
        artistFrequency.set(artist.id, { id: artist.id, name: artist.name, count: 1 });
      }
    }
  }

  const topRelated = [...artistFrequency.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topTrackPromises = topRelated.map((a) => getArtistTopTracks(accessToken, a.id));
  const topTrackResults = await Promise.all(topTrackPromises);
  for (const tracks of topTrackResults) {
    for (const track of tracks) {
      addCandidate(track, 'related-artist');
    }
  }

  // Source 3: Rescued from library
  try {
    const savedTracks = await getUserSavedTracks(accessToken);
    for (const track of savedTracks) {
      addCandidate(track, 'rescued-library');
    }
  } catch (error) {
    console.warn('Failed to fetch user library:', error);
  }

  return candidates;
}

export async function rankAndSelect(
  accessToken: string,
  candidates: CandidateTrack[],
  centroid: AudioFeatures | null,
  targetFeatures: LLMInterpretation['targetFeatures'] | null
): Promise<CandidateTrack[]> {
  if (centroid) {
    const trackIds = candidates.map((c) => c.id);
    const featuresMap = await getAudioFeatures(accessToken, trackIds);

    if (featuresMap) {
      for (const candidate of candidates) {
        const features = featuresMap.get(candidate.id);
        if (features) {
          candidate.features = features;
          candidate.score = computeSimilarity(features, centroid);

          if (targetFeatures) {
            const inRange =
              features.energy >= targetFeatures.energy.min &&
              features.energy <= targetFeatures.energy.max &&
              features.acousticness >= targetFeatures.acousticness.min &&
              features.acousticness <= targetFeatures.acousticness.max &&
              features.valence >= targetFeatures.valence.min &&
              features.valence <= targetFeatures.valence.max &&
              features.tempo >= targetFeatures.tempo.min &&
              features.tempo <= targetFeatures.tempo.max;

            if (inRange) candidate.score += 0.15;
          }
        } else {
          candidate.score = 0.3;
        }
      }
    } else {
      applyFallbackScores(candidates);
    }
  } else {
    applyFallbackScores(candidates);
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Diversity pass
  const selected: CandidateTrack[] = [];
  const artistCount = new Map<string, number>();
  const sourceCount = { catalogue: 0, 'related-artist': 0, 'rescued-library': 0 };

  // First pass: ensure minimum 5 from each source
  for (const source of ['catalogue', 'related-artist', 'rescued-library'] as const) {
    const sourceCandidates = candidates.filter((c) => c.source === source);
    let added = 0;
    for (const c of sourceCandidates) {
      if (added >= 5) break;
      const count = artistCount.get(c.artistId) || 0;
      if (count >= 3) continue;
      selected.push(c);
      artistCount.set(c.artistId, count + 1);
      sourceCount[source]++;
      added++;
    }
  }

  // Second pass: fill to 25 from remaining
  const selectedIds = new Set(selected.map((s) => s.id));
  for (const c of candidates) {
    if (selected.length >= 25) break;
    if (selectedIds.has(c.id)) continue;
    const count = artistCount.get(c.artistId) || 0;
    if (count >= 3) continue;
    selected.push(c);
    artistCount.set(c.artistId, count + 1);
    sourceCount[c.source]++;
    selectedIds.add(c.id);
  }

  // Shuffle
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }

  return selected;
}

function applyFallbackScores(candidates: CandidateTrack[]) {
  for (const c of candidates) {
    switch (c.source) {
      case 'related-artist': c.score = 0.7; break;
      case 'rescued-library': c.score = 0.6; break;
      case 'catalogue': c.score = 0.5; break;
    }
  }
}

export async function generatePlaylistOnSpotify(
  accessToken: string,
  userId: string,
  seeds: SeedTrack[],
  tracks: CandidateTrack[],
  directionSummary: string | undefined
) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const name = `Five Songs Forward — ${date}`;
  const seedNames = seeds.map((s) => s.name).join(', ');
  const description = `Direction: ${directionSummary || 'Based on your seed tracks'}. Seeds: ${seedNames}.`;
  const trackUris = tracks.map((t) => t.uri);

  const result = await createPlaylist(accessToken, userId, name, description, trackUris);

  return {
    spotifyPlaylistId: result.playlistId,
    spotifyPlaylistUrl: result.playlistUrl,
    tracks,
    seedSummary: directionSummary || `A playlist inspired by ${seedNames}`,
  };
}
