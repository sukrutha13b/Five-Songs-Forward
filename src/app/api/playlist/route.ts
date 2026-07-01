import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, createPlaylist } from '@/lib/spotify';

export async function POST(request: NextRequest) {
  try {
    const accessToken = await getValidToken(request.cookies);
    const { name, description, trackUris, userId } = await request.json();

    if (!name || !trackUris || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await createPlaylist(accessToken, userId, name, description || '', trackUris);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Playlist creation error:', error);
    return NextResponse.json({ error: 'Failed to create playlist' }, { status: 500 });
  }
}
