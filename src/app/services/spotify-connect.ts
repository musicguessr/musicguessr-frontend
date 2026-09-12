// Spotify Connect: controlling playback on a *different* device (the user's
// phone, desktop app, speaker) over the Web API.
//
// This is a genuinely separate mechanism from the Web Playback SDK, which
// turns the browser tab itself into a player. It is the only one that works
// on iOS, where WebKit blocks the audio path the SDK needs — the SDK there
// can even connect and report a device id while never producing sound, so
// the browser is never a playback target on that platform.
//
// Kept as plain functions over a token: SpotifyService owns the state
// (which device we handed off to, error reporting, token refresh) and these
// own only the HTTP calls.

const API_BASE = 'https://api.spotify.com/v1';

export type SpotifyDevice = { id: string; is_active: boolean; name: string };

// Never rejects: a device listing failing is indistinguishable, for our
// purposes, from there being no devices — both mean "nothing to hand off to".
export async function listDevices(token: string): Promise<SpotifyDevice[]> {
  try {
    const resp = await fetch(`${API_BASE}/me/player/devices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      return [];
    }
    const data = await resp.json();
    return data.devices ?? [];
  } catch {
    return [];
  }
}

// Prefers whichever device Spotify itself reports as currently active,
// falling back to the first available one (e.g. the app is open but idle).
export function pickTargetDevice(devices: SpotifyDevice[]): SpotifyDevice | null {
  return devices.find((d) => d.is_active) ?? devices[0] ?? null;
}

export function playOnDevice(token: string, deviceId: string, spotifyId: string): Promise<Response> {
  return fetch(`${API_BASE}/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [`spotify:track:${spotifyId}`] }),
  });
}

// deviceId is optional so a pause can still be attempted when we never
// recorded a target (Spotify then applies it to the active device).
// keepalive because callers fire this from teardown paths — "End game"
// immediately followed by a route change — where the request would
// otherwise risk being dropped.
export function pauseOnDevice(token: string, deviceId: string | null): Promise<Response> {
  const url = deviceId
    ? `${API_BASE}/me/player/pause?device_id=${encodeURIComponent(deviceId)}`
    : `${API_BASE}/me/player/pause`;
  return fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  });
}
