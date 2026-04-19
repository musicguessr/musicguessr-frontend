import { Injectable, signal } from '@angular/core';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

@Injectable({ providedIn: 'root' })
export class YoutubePlayerService {
  readonly isPlaying = signal(false);
  readonly videoId = signal<string | null>(null);

  private player: any = null;
  private apiReady = false;
  private containerId = 'yt-player-container';

  loadAPI(): Promise<void> {
    if (this.apiReady) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = (): void => {
        this.apiReady = true;
        resolve();
      };
      if (!document.getElementById('yt-api-script')) {
        const s = document.createElement('script');
        s.id = 'yt-api-script';
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    });
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
    return new Promise((resolve) => {
      // setTimeout(0) ensures Angular change detection has rendered the container
      setTimeout(() => {
        const container = document.getElementById(this.containerId);
        if (!container) {
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
            onReady: (): void => resolve(),
            onStateChange: (e: any): void => {
              this.isPlaying.set(e.data === 1);
            },
            onError: (e: any): void => {
              console.error('YouTube player error:', e.data);
              this.isPlaying.set(false);
              resolve();
            },
          },
        });
      }, 0);
    });
  }

  // Must be called inside a click/touchend handler for iOS autoplay.
  // With a pre-loaded player, loadVideoById() is synchronous from iOS's perspective.
  playVideo(videoId: string): void {
    this.videoId.set(videoId);

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
        },
      },
    });
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
