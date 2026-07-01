import { NextRequest, NextResponse } from 'next/server';

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}`;
}

const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const storedState = request.cookies.get('spotify_auth_state')?.value;
  const baseUrl = getBaseUrl(request);

  if (!state || state !== storedState) {
    console.error('State mismatch in OAuth callback');
    return NextResponse.redirect(`${baseUrl}/?error=state_mismatch`);
  }

  if (!code) {
    console.error('No code in OAuth callback');
    return NextResponse.redirect(`${baseUrl}/?error=auth_failed`);
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
      return NextResponse.redirect(`${baseUrl}/?error=auth_failed`);
    }

    const data = await tokenResponse.json();
    const expiresAt = Date.now() + data.expires_in * 1000;

    const response = NextResponse.redirect(`${baseUrl}/dashboard`);

    const baseCookie = {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      path: '/',
    };

    response.cookies.set('spotify_access_token', data.access_token, {
      ...baseCookie,
      maxAge: data.expires_in,
    });
    response.cookies.set('spotify_expires_at', expiresAt.toString(), {
      ...baseCookie,
      maxAge: data.expires_in,
    });
    response.cookies.set('spotify_refresh_token', data.refresh_token, {
      ...baseCookie,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
    response.cookies.delete('spotify_auth_state');

    return response;
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(`${baseUrl}/?error=auth_failed`);
  }
}
