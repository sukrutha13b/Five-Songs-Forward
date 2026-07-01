import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, getTrackDetails, getAudioFeatures } from '@/lib/spotify';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let trackId = searchParams.get('id');
  const url = searchParams.get('url');

  if (!trackId && url) {
    // Parse spotify:track:xxx or https://open.spotify.com/track/xxx?...
    const uriMatch = url.match(/spotify:track:(\w+)/);
    const urlMatch = url.match(/open\.spotify\.com\/track\/(\w+)/);
    trackId = uriMatch?.[1] || urlMatch?.[1] || null;
  }

  if (!trackId) {
    return NextResponse.json({ error: 'Track ID or URL required' }, { status: 400 });
  }

  try {
    const accessToken = await getValidToken(request.cookies);
    const track = await getTrackDetails(accessToken, trackId);
    const featuresMap = await getAudioFeatures(accessToken, [trackId]);
    const features = featuresMap?.get(trackId) || null;

    return NextResponse.json({ ...track, features });
  } catch (error) {
    console.error('Track details error:', error);
    return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  }
}
