import { NextRequest, NextResponse } from 'next/server';
import { getTrackDetails } from '@/lib/spotify';

const SPOTIFY_ID_RE = /^[A-Za-z0-9]{22}$/;

function extractTrackId(input: string): string | null {
  if (SPOTIFY_ID_RE.test(input)) return input;
  const uriMatch = input.match(/spotify:track:([A-Za-z0-9]{22})/);
  if (uriMatch) return uriMatch[1];
  const urlMatch = input.match(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/);
  if (urlMatch) return urlMatch[1];
  return null;
}

export async function GET(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get('id');
  const urlParam = request.nextUrl.searchParams.get('url');

  const trackId =
    (idParam && extractTrackId(idParam)) || (urlParam && extractTrackId(urlParam)) || null;

  if (!trackId) {
    return NextResponse.json({ error: 'Valid Spotify track ID or URL required' }, { status: 400 });
  }

  try {
    const track = await getTrackDetails(trackId);
    return NextResponse.json(track);
  } catch (error) {
    console.error('Track details error:', error);
    return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  }
}
