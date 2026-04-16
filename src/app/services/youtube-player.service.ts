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
  private pendingVideoId: string | null = null;
  private containerId = 'yt-player-container';

  loadAPI(): Promise<void> {
    if (this.apiReady) return Promise.resolve();
    return new Promise(resolve => {
      window.onYouTubeIframeAPIReady = () => {
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

  // Must be called inside a click/touchend handler for iOS autoplay
  playVideo(videoId: string): void {
    this.videoId.set(videoId);
    this.pendingVideoId = videoId;

    if (!this.apiReady) {
      this.loadAPI().then(() => this.createPlayer(videoId));
      return;
    }

    if (this.player) {
      this.player.loadVideoById(videoId);
      this.isPlaying.set(true);
    } else {
      this.createPlayer(videoId);
      // Try to start playback synchronously so it's attributed to the user gesture.
      try {
        if (this.player && typeof this.player.playVideo === 'function') {
          this.player.playVideo();
          this.isPlaying.set(true);
        }
      } catch (err) {
        // ignore - playback may be handled in onReady
      }
    }
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
        playsinline: 1,   // critical for iOS - don't go fullscreen
        rel: 0,
        modestbranding: 1,
        fs: 0,
      },
      events: {
        onReady: (e: any) => {
          // Play is attempted synchronously from the user gesture; onReady is a fallback.
          try {
            e.target.playVideo();
            this.isPlaying.set(true);
          } catch (err) {
            // ignore
          }
        },
        onStateChange: (e: any) => {
          // YT.PlayerState.PLAYING = 1, PAUSED = 2, ENDED = 0
          this.isPlaying.set(e.data === 1);
        },
        onError: (e: any) => {
          console.error('YouTube player error:', e.data);
          this.isPlaying.set(false);
        }
      }
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

  // Call to unmute the player (can be invoked after a user gesture)
  unmute(): void {
    if (this.player && typeof this.player.unMute === 'function') {
      try {
        this.player.unMute();
      } catch (err) {
        // ignore
      }
    }
  }
}
