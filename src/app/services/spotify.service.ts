import { inject, Injectable, signal } from '@angular/core';
import { ConfigService } from './config.service';
import { GameStateService } from './game-state.service';
import { ClientErrorReporterService } from './client-error-reporter.service';
import { listDevices, pauseOnDevice, pickTargetDevice, playOnDevice } from './spotify-connect';

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
  private currentRequestId: string | null = null;
  // The real device playback was handed off to via Spotify Connect, so stop()
  // can pause that exact one rather than whatever Spotify currently considers
  // active (the user may have started something else on another device).
  private connectDeviceId: string | null = null;

  // The Web Playback SDK isn't officially supported on Safari on any
  // platform, but critically it doesn't always fail loudly there: on iOS it
  // can connect and report a real device_id (accepting play commands, even
  // advancing playback position server-side) while never actually producing
  // audio locally, since WebKit blocks the audio path it depends on. Relying
  // on 'ready'/'initialization_error' alone silently sends playback to that
  // dead local device instead of handing off to a real one — confirmed on a
  // real device where Spotify Connect showed "musicguessr" progressing with
  // no sound. So on iOS we skip the local SDK player entirely and always go
  // straight through Spotify Connect to an actual device.
  private readonly isIOS =
    typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);

  private config = inject(ConfigService);
  private state = inject(GameStateService);
  private reporter = inject(ClientErrorReporterService);

  // Set from prepare-player.ts right before initSDK()/play() so any report
  // below can be correlated with this card's /api/resolve backend log line
  // (same pattern as YoutubePlayerService.setRequestId).
  setRequestId(id: string | null): void {
    this.currentRequestId = id;
  }

  private reportIssue(message: string, context: string): void {
    this.reporter.report({ message, context, requestId: this.currentRequestId ?? undefined });
  }

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

        if (this.isIOS) {
          // Don't even attempt the local SDK player here — see isIOS's
          // comment. play() always uses Connect when deviceId is null, which
          // it stays here since we never set it.
          resolve();
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
            // iOS Safari — Web Playback SDK not supported (WebKit blocks the
            // Web Audio API it needs). Expected there, so log it as info-level
            // context rather than a surprising failure — prepareSpotify()
            // treats this specific message as non-fatal and falls back to
            // Spotify Connect, but we still want a trace of how often this
            // path is actually hit and on which browsers.
            this.error.set(`Spotify not supported on this browser: ${message}`);
            this.reportIssue(`Spotify Web Playback SDK initialization_error: ${message}`, 'spotify-init-unsupported');
            // Don't leave a half-constructed player behind — otherwise the
            // `if (this.player) return Promise.resolve()` guard above would
            // treat this failed init as a permanent success.
            this.player = null;
            reject(new Error(message));
          });

          this.player.addListener('authentication_error', ({ message }: any) => {
            this.error.set('Spotify authentication error');
            this.reportIssue(`Spotify Web Playback SDK authentication_error: ${message}`, 'spotify-auth-error');
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
    const devices = await listDevices(token);
    const target = pickTargetDevice(devices);
    if (!target) {
      this.reportIssue(`Spotify Connect found no devices (${devices.length} total)`, 'spotify-connect-no-device');
      throw new Error('Open the Spotify app on your phone, then tap play again.');
    }

    const resp = await playOnDevice(token, target.id, spotifyId);
    if (!resp.ok) {
      this.reportIssue(`Spotify Connect play failed: HTTP ${resp.status}`, 'spotify-connect-play-failed');
      this.throwForStatus(resp.status);
    }

    this.connectDeviceId = target.id;
    this.isPlaying.set(true);
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

  // Pausing only the local SDK player was a no-op wherever playback had been
  // handed off through Spotify Connect — which is every iOS session, since
  // we deliberately never construct a local player there. The music simply
  // kept playing on the user's phone after "End game", after "Next card",
  // and after navigating away from /game.
  stop(): void {
    if (typeof this.player?.pause === 'function') {
      this.player.pause();
    } else {
      void this.pauseViaConnect();
    }
    this.isPlaying.set(false);
  }

  private async pauseViaConnect(): Promise<void> {
    const token = this.state.getSpotifyToken();
    if (!token) {
      return;
    }
    try {
      // Targets the device we actually handed playback to, not whatever
      // Spotify currently calls active — by now the user may have started
      // something else somewhere, and pausing that would be worse than
      // doing nothing.
      const resp = await pauseOnDevice(token, this.connectDeviceId);
      // 404 = no active device and 403 = restricted (most often "already
      // paused"). Both mean the music isn't playing, which is the goal —
      // neither is worth reporting.
      if (!resp.ok && resp.status !== 404 && resp.status !== 403) {
        this.reportIssue(`Spotify Connect pause failed: HTTP ${resp.status}`, 'spotify-connect-pause-failed');
      }
    } catch {
      // Teardown path — failing to pause must never throw into a caller that
      // is mid-navigation and has no way to handle it.
    }
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
    this.connectDeviceId = null;
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
