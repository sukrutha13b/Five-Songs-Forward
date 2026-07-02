import { SeedTrack } from './types';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';
const REFRESH_SKEW_MS = 60_000;

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - REFRESH_SKEW_MS) {
    return tokenCache.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '<no body>');
    throw new Error(`Spotify token request failed: ${response.status} — ${body}`);
  }

  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.token;
}

async function spotifyGet(path: string): Promise<Response> {
  const token = await getAppToken();
  return fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function searchTracks(
  query: string,
  limit: number = 20,
  offset: number = 0
): Promise<SeedTrack[]> {
  const response = await spotifyGet(
    `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&offset=${offset}`
  );

  if (!response.ok) {
    console.warn(`Search request failed for "${query}": ${response.status}`);
    return [];
  }

  const data = await response.json();
  return mapSpotifyTracks(data.tracks?.items ?? []);
}

export async function getTrackDetails(trackId: string): Promise<SeedTrack> {
  const response = await spotifyGet(`/tracks/${trackId}`);

  if (!response.ok) {
    throw new Error(`Track not found: ${response.status}`);
  }

  const track = await response.json();
  return mapSingleTrack(track);
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
  return tracks.filter((t) => t && t.id).map(mapSingleTrack);
}
