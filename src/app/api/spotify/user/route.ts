import { NextResponse } from 'next/server';
import { getValidToken, getUserProfile } from '@/lib/spotify';

export async function GET() {
  try {
    const accessToken = await getValidToken();
    const profile = await getUserProfile(accessToken);
    return NextResponse.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('User profile error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
