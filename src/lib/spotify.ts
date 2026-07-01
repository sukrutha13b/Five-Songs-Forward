import { SeedTrack, AudioFeatures, UserProfile } from './types';

export async function getValidToken(cookies: { get: (name: string) => { value: string } | undefined }): Promise<string> {
  const accessToken = cookies.get('spotify_access_token')?.value;
  const refreshToken = cookies.get('spotify_refresh_token')?.value;
  const expiresAt = cookies.get('spotify_expires_at')?.value;

  if (!accessToken || !refreshToken) {
    throw new Error('No tokens found');
  }

  if (expiresAt && Date.now() < parseInt(expiresAt) - 60000) {
    return accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  const data = await response.json();
  return data.access_token;
}

export async function getAudioFeatures(
  accessToken: string,
  trackIds: string[]
): Promise<Map<string, AudioFeatures> | null> {
  try {
    const batches: string[][] = [];
    for (let i = 0; i < trackIds.length; i += 100) {
      batches.push(trackIds.slice(i, i + 100));
    }

    const result = new Map<string, AudioFeatures>();

    for (const batch of batches) {
      const response = await fetch(
        `https://api.spotify.com/v1/audio-features?ids=${batch.join(',')}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (response.status === 403) {
        console.warn('Audio features endpoint returned 403 — access restricted');
        return null;
      }

      if (!response.ok) {
        console.warn(`Audio features request failed: ${response.status}`);
        return null;
      }

      const data = await response.json();
      for (const feature of data.audio_features) {
        if (feature) {
          result.set(feature.id, {
            energy: feature.energy,
            acousticness: feature.acousticness,
            valence: feature.valence,
            tempo: feature.tempo,
            instrumentalness: feature.instrumentalness,
            danceability: feature.danceability,
            liveness: feature.liveness,
          });
        }
      }
    }

    return result;
  } catch (error) {
    console.warn('Audio features fetch error:', error);
    return null;
  }
}

export async function getRelatedArtists(
  accessToken: string,
  artistId: string
): Promise<{ id: string; name: string; genres: string[] }[]> {
  const response = await fetch(
    `https://api.spotify.com/v1/artists/${artistId}/related-artists`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    console.warn(`Related artists request failed: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return data.artists.map((a: { id: string; name: string; genres: string[] }) => ({
    id: a.id,
    name: a.name,
    genres: a.genres,
  }));
}

export async function getArtistTopTracks(
  accessToken: string,
  artistId: string
): Promise<SeedTrack[]> {
  const response = await fetch(
    `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    console.warn(`Artist top tracks request failed: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return mapSpotifyTracks(data.tracks);
}

export async function getUserSavedTracks(
  accessToken: string,
  limit: number = 50
): Promise<SeedTrack[]> {
  const allTracks: SeedTrack[] = [];
  const maxPages = 4;

  for (let page = 0; page < maxPages; page++) {
    const response = await fetch(
      `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${page * limit}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) break;

    const data = await response.json();
    const tracks = data.items.map((item: { track: SpotifyTrackObject }) =>
      mapSingleTrack(item.track)
    );
    allTracks.push(...tracks);

    if (data.items.length < limit) break;
  }

  return allTracks;
}

export async function searchTracks(
  accessToken: string,
  query: string,
  limit: number = 20
): Promise<SeedTrack[]> {
  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    console.warn(`Search request failed: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return mapSpotifyTracks(data.tracks.items);
}

export async function createPlaylist(
  accessToken: string,
  userId: string,
  name: string,
  description: string,
  trackUris: string[]
): Promise<{ playlistId: string; playlistUrl: string }> {
  const createResponse = await fetch(
    `https://api.spotify.com/v1/users/${userId}/playlists`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, description, public: false }),
    }
  );

  if (!createResponse.ok) {
    throw new Error(`Failed to create playlist: ${createResponse.status}`);
  }

  const playlist = await createResponse.json();

  const addResponse = await fetch(
    `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: trackUris }),
    }
  );

  if (!addResponse.ok) {
    throw new Error(`Failed to add tracks to playlist: ${addResponse.status}`);
  }

  return {
    playlistId: playlist.id,
    playlistUrl: playlist.external_urls.spotify,
  };
}

export async function getTrackDetails(
  accessToken: string,
  trackId: string
): Promise<SeedTrack> {
  const response = await fetch(
    `https://api.spotify.com/v1/tracks/${trackId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Track not found: ${response.status}`);
  }

  const track = await response.json();
  return mapSingleTrack(track);
}

export async function getUserProfile(accessToken: string): Promise<UserProfile> {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to get user profile: ${response.status}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    displayName: data.display_name,
    email: data.email,
    imageUrl: data.images?.[0]?.url || null,
  };
}

interface SpotifyTrackObject {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { name: string; images: { url: string }[] };
  preview_url: string | null;
  uri: string;
}

function mapSingleTrack(track: SpotifyTrackObject): SeedTrack {
  return {
    id: track.id,
    name: track.name,
    artist: track.artists[0]?.name || 'Unknown',
    artistId: track.artists[0]?.id || '',
    album: track.album.name,
    albumArt: track.album.images[0]?.url || '',
    previewUrl: track.preview_url,
    uri: track.uri,
  };
}

function mapSpotifyTracks(tracks: SpotifyTrackObject[]): SeedTrack[] {
  return tracks.map(mapSingleTrack);
}
