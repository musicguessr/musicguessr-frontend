import { inject, Injectable, signal } from '@angular/core';
import { ClientErrorReporterService } from './client-error-reporter.service';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

// Some browsers ship built-in tracker/ad blocking that silently drops the
// request for youtube.com/iframe_api (privacy-hardened Firefox forks in
// particular) — without a hard timeout, window.onYouTubeIframeAPIReady
// simply never fires and loadAPI()'s promise hangs forever, which is what a
// user sees as the TAP TO PLAY overlay stuck on "LOADING…" indefinitely
// (musicguessr-frontend#7). 8s is generous for a real network fetch of a
// tiny script; anything slower than that is functionally "blocked" from
// the user's perspective either way.
const API_LOAD_TIMEOUT_MS = 8000;

@Injectable({ providedIn: 'root' })
export class YoutubePlayerService {
  readonly isPlaying = signal(false);
  readonly videoId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  private reporter = inject(ClientErrorReporterService);
  private player: any = null;
  private apiReady = false;
  private containerId = 'yt-player-container';
  private apiLoadPromise: Promise<void> | null = null;
  private preloadPromise: Promise<void> | null = null;

  loadAPI(): Promise<void> {
    if (this.apiReady) {
      return Promise.resolve();
    }
    // Dedup concurrent callers instead of letting each overwrite
    // window.onYouTubeIframeAPIReady and orphan the others' promises.
    if (this.apiLoadPromise) {
      return this.apiLoadPromise;
    }

    const promise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.reportBlocked('iframe_api script timed out');
        reject(
          new Error(
            'YouTube player script did not load — it may be blocked by a browser extension or DNS-level ad blocker',
          ),
        );
      }, API_LOAD_TIMEOUT_MS);

      window.onYouTubeIframeAPIReady = (): void => {
        clearTimeout(timeout);
        this.apiReady = true;
        resolve();
      };
      if (!document.getElementById('yt-api-script')) {
        const s = document.createElement('script');
        s.id = 'yt-api-script';
        s.src = 'https://www.youtube.com/iframe_api';
        // Fires immediately (rather than waiting out the full timeout) when
        // a blocker rejects the request outright instead of just hanging it.
        s.onerror = (): void => {
          clearTimeout(timeout);
          this.reportBlocked('iframe_api script onerror');
          reject(
            new Error(
              'YouTube player script failed to load — it may be blocked by a browser extension or DNS-level ad blocker',
            ),
          );
        };
        document.head.appendChild(s);
      } else if (window.YT?.Player) {
        // Script tag already present and finished loading in a previous call.
        clearTimeout(timeout);
        this.apiReady = true;
        resolve();
      }
    }).finally(() => {
      this.apiLoadPromise = null;
    });
    this.apiLoadPromise = promise;
    return promise;
  }

  // Pre-creates the player (no video) so it's ready before the user taps.
  // Must be called after loadAPI() and after the DOM container exists.
  // iOS Safari requires play() to be called synchronously inside a user gesture —
  // pre-creating the player ensures loadVideoById() in the tap handler is the
  // only async boundary that iOS sees.
  preloadPlayer(): Promise<void> {
    if (this.player) {
      return Promise.resolve();
    }
    // Dedup concurrent callers — otherwise two preloadPlayer() calls before the
    // first setTimeout(0) fires (e.g. a rapid double-tap on "NEXT CARD") can each
    // construct a competing YT.Player against the same DOM container.
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    const promise = new Promise<void>((resolve) => {
      // Belt-and-braces alongside loadAPI()'s own timeout: even once the API
      // script has loaded, the actual player iframe (youtube.com/embed/…)
      // can itself be blocked by the same class of tracker/ad blocker,
      // which would otherwise leave onReady/onError never firing and this
      // promise — and the TAP TO PLAY overlay — stuck forever.
      const timeout = setTimeout(() => {
        this.reportBlocked('player embed timed out');
        this.error.set(
          'YouTube player failed to load — it may be blocked by a browser extension or DNS-level ad blocker',
        );
        resolve();
      }, API_LOAD_TIMEOUT_MS);

      // setTimeout(0) ensures Angular change detection has rendered the container
      setTimeout(() => {
        const container = document.getElementById(this.containerId);
        if (!container || this.player) {
          clearTimeout(timeout);
          resolve();
          return;
        }

        this.player = new window.YT.Player(this.containerId, {
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            fs: 0,
          },
          events: {
            onReady: (): void => {
              clearTimeout(timeout);
              resolve();
            },
            onStateChange: (e: any): void => {
              this.isPlaying.set(e.data === 1);
            },
            onError: (e: any): void => {
              clearTimeout(timeout);
              console.error('YouTube player error:', e.data);
              this.isPlaying.set(false);
              this.error.set(this.describeError(e?.data));
              resolve();
            },
          },
        });
      }, 0);
    }).finally(() => {
      this.preloadPromise = null;
    });
    this.preloadPromise = promise;
    return promise;
  }

  // Must be called inside a click/touchend handler for iOS autoplay.
  // With a pre-loaded player, loadVideoById() is synchronous from iOS's perspective.
  playVideo(videoId: string): void {
    this.videoId.set(videoId);
    // Clear any error left over from a previous card so a stale message
    // doesn't leak into this one.
    this.error.set(null);

    if (this.player) {
      this.player.loadVideoById(videoId);
      this.isPlaying.set(true);
      return;
    }

    // Fallback: no pre-loaded player (preloadPlayer() was not called or failed).
    // Create the player with autoplay=1; onReady will attempt play, but this
    // may not work on iOS Safari due to the async gap.
    if (!this.apiReady) {
      this.loadAPI().then(() => setTimeout(() => this.createPlayer(videoId), 0));
      return;
    }
    this.createPlayer(videoId);
  }

  private createPlayer(videoId: string): void {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('YouTube player container not found');
      return;
    }

    this.player = new window.YT.Player(this.containerId, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        controls: 1,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        fs: 0,
      },
      events: {
        onReady: (e: any): void => {
          try {
            e.target.playVideo();
            this.isPlaying.set(true);
          } catch {
            /* ignore */
          }
        },
        onStateChange: (e: any): void => {
          this.isPlaying.set(e.data === 1);
        },
        onError: (e: any): void => {
          console.error('YouTube player error:', e.data);
          this.isPlaying.set(false);
          this.error.set(this.describeError(e?.data));
        },
      },
    });
  }

  // Reports specifically to distinguish "the YouTube domains themselves are
  // network/DNS-blocked" (common on privacy-hardened browsers and de-Googled
  // setups — not a missing API, since this is plain web JS/iframe embedding
  // with no native Android/Google Play Services dependency at all) from any
  // other client failure, so this failure mode is actually visible to us
  // instead of only ever surfacing as a "LOADING… forever" report with no
  // further detail.
  private reportBlocked(where: string): void {
    this.reporter.report({
      message: `YouTube ${where}`,
      context: 'youtube-player-blocked',
    });
  }

  private describeError(code: number | undefined): string {
    switch (code) {
      case 2:
        return 'Invalid YouTube video';
      case 5:
        return 'This video cannot be played in the HTML5 player';
      case 100:
        return 'Video not found or has been removed';
      case 101:
      case 150:
        return 'Video owner does not allow embedded playback';
      default:
        return 'YouTube playback failed';
    }
  }

  stop(): void {
    if (this.player) {
      this.player.stopVideo();
      this.isPlaying.set(false);
    }
  }

  destroy(): void {
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
    this.isPlaying.set(false);
    this.videoId.set(null);
    this.error.set(null);
  }

  unmute(): void {
    if (this.player && typeof this.player.unMute === 'function') {
      try {
        this.player.unMute();
      } catch {
        /* ignore */
      }
    }
  }
}
