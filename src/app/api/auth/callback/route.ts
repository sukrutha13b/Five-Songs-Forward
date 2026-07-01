import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const storedState = request.cookies.get('spotify_auth_state')?.value;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!state || state !== storedState) {
    console.error('State mismatch in OAuth callback');
    return NextResponse.redirect(`${appUrl}/?error=state_mismatch`);
  }

  if (!code) {
    console.error('No code in OAuth callback');
    return NextResponse.redirect(`${appUrl}/?error=auth_failed`);
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI!;

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return NextResponse.redirect(`${appUrl}/?error=auth_failed`);
    }

    const data = await tokenResponse.json();
    const expiresAt = Date.now() + data.expires_in * 1000;

    const response = NextResponse.redirect(`${appUrl}/dashboard`);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 3600 * 24 * 30,
    };

    response.cookies.set('spotify_access_token', data.access_token, cookieOptions);
    response.cookies.set('spotify_refresh_token', data.refresh_token, cookieOptions);
    response.cookies.set('spotify_expires_at', expiresAt.toString(), cookieOptions);
    response.cookies.delete('spotify_auth_state');

    return response;
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(`${appUrl}/?error=auth_failed`);
  }
}
