// Spotify PKCE OAuth primitives, kept free of Angular DI so SpotifyService
// only orchestrates (redirect, storage, SDK) around them.

const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export type SpotifyTokenResponse = { access_token: string; refresh_token: string; expires_in: number };

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function generateVerifier(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return base64Url(arr);
}

export async function generateChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

// null on a non-2xx response; callers decide whether that's fatal.
export async function requestToken(params: Record<string, string>): Promise<SpotifyTokenResponse | null> {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  return resp.ok ? resp.json() : null;
}
