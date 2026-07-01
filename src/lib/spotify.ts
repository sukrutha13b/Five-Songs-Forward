import { cookies } from 'next/headers';
import { SeedTrack, UserProfile } from './types';

const REFRESH_SKEW_MS = 60_000;

export async function getValidToken(): Promise<string> {
  const jar = await cookies();
  const accessToken = jar.get('spotify_access_token')?.value;
  const refreshToken = jar.get('spotify_refresh_token')?.value;
  const expiresAt = jar.get('spotify_expires_at')?.value;

  if (!accessToken || !refreshToken) {
    throw new Error('No tokens found');
  }

  if (expiresAt && Date.now() < parseInt(expiresAt) - REFRESH_SKEW_MS) {
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
  const newAccessToken: string = data.access_token;
  const newExpiresAt = Date.now() + data.expires_in * 1000;

  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
  };

  jar.set('spotify_access_token', newAccessToken, {
    ...cookieOptions,
    maxAge: data.expires_in,
  });
  jar.set('spotify_expires_at', newExpiresAt.toString(), {
    ...cookieOptions,
    maxAge: data.expires_in,
  });
  if (data.refresh_token) {
    jar.set('spotify_refresh_token', data.refresh_token, {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return newAccessToken;
}

export async function getRecentlyPlayed(
  accessToken: string,
  limit: number = 50
): Promise<SeedTrack[]> {
  const response = await fetch(
    `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    console.warn(`Recently-played request failed: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return data.items.map((item: { track: SpotifyTrackObject }) => mapSingleTrack(item.track));
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
    const body = await createResponse.text().catch(() => '<no body>');
    throw new Error(
      `Failed to create playlist: ${createResponse.status} — userId=${userId} — spotify said: ${body}`
    );
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
    email: data.email ?? null,
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
