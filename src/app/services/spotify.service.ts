import { inject, Injectable, signal } from '@angular/core';
import { ConfigService } from './config.service';
import { GameStateService } from './game-state.service';

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

@Injectable({ providedIn: 'root' })
export class SpotifyService {
  readonly isReady = signal(false);
  readonly isPlaying = signal(false);
  readonly error = signal<string | null>(null);

  private player: any = null;
  private deviceId: string | null = null;
  private initPromise: Promise<void> | null = null;

  private config = inject(ConfigService);
  private state = inject(GameStateService);

  get clientId(): string {
    return this.config.spotifyClientId;
  }
  get redirectUri(): string {
    return `${window.location.origin}/callback`;
  }

  // Step 1: redirect to Spotify auth
  async authorize(): Promise<void> {
    const verifier = this.generateVerifier();
    const challenge = await this.generateChallenge(verifier);
    sessionStorage.setItem('pkce_verifier', verifier);

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      // user-read-playback-state is needed to list the user's Spotify Connect
      // devices (see playViaConnect) — required on iOS Safari, where the Web
      // Playback SDK can't initialize at all and playback has to be handed
      // off to a device already running the real Spotify app.
      scope: 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state',
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  }

  // Step 2: exchange code for token (called in /callback)
  async handleCallback(code: string): Promise<void> {
    const verifier = sessionStorage.getItem('pkce_verifier');
    if (!verifier) {
      throw new Error('Missing PKCE verifier');
    }

    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        code_verifier: verifier,
      }),
    });

    if (!resp.ok) {
      throw new Error('Token exchange failed');
    }
    const data = await resp.json();
    this.state.setSpotifyToken(data.access_token, data.refresh_token, data.expires_in);
    sessionStorage.removeItem('pkce_verifier');
  }

  // Step 3: refresh token silently
  async refreshToken(): Promise<boolean> {
    const refresh = this.state.getSpotifyRefreshToken();
    if (!refresh) {
      return false;
    }

    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        grant_type: 'refresh_token',
        refresh_token: refresh,
      }),
    });

    if (!resp.ok) {
      return false;
    }
    const data = await resp.json();
    this.state.setSpotifyToken(data.access_token, data.refresh_token || refresh, data.expires_in);
    return true;
  }

  // Step 4: initialize Web Playback SDK
  initSDK(): Promise<void> {
    if (this.player) {
      return Promise.resolve();
    }
    // Dedup concurrent callers instead of letting each overwrite
    // window.onSpotifyWebPlaybackSDKReady and orphan the others' promises.
    if (this.initPromise) {
      return this.initPromise;
    }

    const promise = this.doInitSDK().finally(() => {
      this.initPromise = null;
    });
    this.initPromise = promise;
    return promise;
  }

  private doInitSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      const setup = async (): Promise<void> => {
        let token = this.state.getSpotifyToken();
        if (!token) {
          // Access token missing/expired — try a silent refresh before giving up.
          const ok = await this.refreshToken();
          token = ok ? this.state.getSpotifyToken() : null;
        }
        if (!token) {
          reject(new Error('No Spotify token'));
          return;
        }

        window.onSpotifyWebPlaybackSDKReady = (): void => {
          this.player = new window.Spotify.Player({
            name: 'musicguessr',
            getOAuthToken: async (cb: (t: string) => void): Promise<void> => {
              let t = this.state.getSpotifyToken();
              if (!t) {
                const ok = await this.refreshToken();
                if (!ok) {
                  this.error.set('Session expired, please reconnect Spotify');
                  // Must always call cb(), even on failure — otherwise the SDK's
                  // internal auth promise hangs forever instead of surfacing an error.
                  cb('');
                  return;
                }
                t = this.state.getSpotifyToken();
              }
              cb(t ?? '');
            },
            volume: 1.0,
          });

          this.player.addListener('ready', ({ device_id }: { device_id: string }) => {
            this.deviceId = device_id;
            this.isReady.set(true);
            resolve();
          });

          this.player.addListener('not_ready', () => {
            this.isReady.set(false);
          });

          this.player.addListener('player_state_changed', (state: any) => {
            if (state) {
              this.isPlaying.set(!state.paused);
            }
          });

          this.player.addListener('initialization_error', ({ message }: any) => {
            // iOS Safari — Web Playback SDK not supported
            this.error.set(`Spotify not supported on this browser: ${message}`);
            // Don't leave a half-constructed player behind — otherwise the
            // `if (this.player) return Promise.resolve()` guard above would
            // treat this failed init as a permanent success.
            this.player = null;
            reject(new Error(message));
          });

          this.player.addListener('authentication_error', ({ message }: any) => {
            this.error.set('Spotify authentication error');
            this.player = null;
            reject(new Error(message));
          });

          this.player.connect();
        };

        if (!document.getElementById('spotify-sdk-script')) {
          const s = document.createElement('script');
          s.id = 'spotify-sdk-script';
          s.src = 'https://sdk.scdn.co/spotify-player.js';
          document.head.appendChild(s);
        } else if (window.Spotify) {
          window.onSpotifyWebPlaybackSDKReady();
        }
      };

      setup();
    });
  }

  // Play track by Spotify URI — must be called in click handler
  async play(spotifyId: string): Promise<void> {
    let token = this.state.getSpotifyToken();
    if (!token) {
      // Access token expired between initSDK() and this tap — try a silent
      // refresh instead of failing outright.
      const ok = await this.refreshToken();
      token = ok ? this.state.getSpotifyToken() : null;
    }
    if (!token) {
      throw new Error('Spotify not ready');
    }

    // No local Web Playback SDK device — this is the normal case on iOS
    // Safari, where the SDK's initialization_error always fires (WebKit
    // blocks the Web Audio API it needs). Rather than failing outright, hand
    // playback off via Spotify Connect to a device already running the real
    // Spotify app, so the user still doesn't have to leave the browser UI.
    if (!this.deviceId) {
      await this.playViaConnect(spotifyId, token);
      return;
    }

    const resp = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [`spotify:track:${spotifyId}`] }),
    });

    if (!resp.ok) {
      this.throwForStatus(resp.status);
    }

    this.isPlaying.set(true);
  }

  private async playViaConnect(spotifyId: string, token: string): Promise<void> {
    const devices = await this.getDevices(token);
    // Prefer whichever device Spotify itself reports as currently active —
    // falls back to the first available one (e.g. app open but idle).
    const target = devices.find((d) => d.is_active) ?? devices[0];
    if (!target) {
      throw new Error('Open the Spotify app on your phone, then tap play again.');
    }

    const resp = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${target.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [`spotify:track:${spotifyId}`] }),
    });

    if (!resp.ok) {
      this.throwForStatus(resp.status);
    }

    this.isPlaying.set(true);
  }

  private async getDevices(token: string): Promise<{ id: string; is_active: boolean; name: string }[]> {
    try {
      const resp = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        return [];
      }
      const data = await resp.json();
      return data.devices ?? [];
    } catch {
      // Network hiccup listing devices shouldn't crash playback — treated
      // the same as "no devices found" below.
      return [];
    }
  }

  private throwForStatus(status: number): never {
    if (status === 401) {
      // Token was rejected server-side (e.g. access revoked) — clear it so
      // hasAuth()/getSpotifyToken() stop reporting a dead token as valid.
      this.state.clearSpotifyToken();
      throw new Error('Spotify session expired, please reconnect');
    }
    if (status === 403) {
      throw new Error('Spotify Premium required');
    }
    if (status === 429) {
      throw new Error('Too many requests, try again in a moment');
    }
    throw new Error(`Spotify error ${status}`);
  }

  stop(): void {
    if (this.player) {
      this.player.pause();
    }
    this.isPlaying.set(false);
  }

  disconnect(): void {
    if (this.player) {
      this.player.removeListener('ready');
      this.player.removeListener('not_ready');
      this.player.removeListener('player_state_changed');
      this.player.removeListener('initialization_error');
      this.player.removeListener('authentication_error');
      this.player.disconnect();
      this.player = null;
    }
    this.isReady.set(false);
    this.isPlaying.set(false);
    this.deviceId = null;
  }

  // PKCE helpers
  private generateVerifier(): string {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private async generateChallenge(verifier: string): Promise<string> {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}
