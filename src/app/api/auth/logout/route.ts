import { NextRequest, NextResponse } from 'next/server';

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}`;
}

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('spotify_access_token');
  response.cookies.delete('spotify_refresh_token');
  response.cookies.delete('spotify_expires_at');
  return response;
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const response = NextResponse.redirect(`${baseUrl}/`);
  response.cookies.delete('spotify_access_token');
  response.cookies.delete('spotify_refresh_token');
  response.cookies.delete('spotify_expires_at');
  return response;
}
