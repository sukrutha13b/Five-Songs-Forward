import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, searchTracks } from '@/lib/spotify';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
  }

  try {
    const accessToken = await getValidToken();
    const tracks = await searchTracks(accessToken, q, 10);
    return NextResponse.json(tracks);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 502 });
  }
}
