import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import { GameStateService, TrackInfo } from '../../services/game-state.service';
import { YoutubePlayerService } from '../../services/youtube-player.service';
import { SpotifyService } from '../../services/spotify.service';
import { AppleMusicService } from '../../services/apple-music.service';
import { DeckService } from '../../services/deck.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [TitleCasePipe],
  templateUrl: './game.component.html',
  styleUrl: './game.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameComponent implements OnInit, OnDestroy {
  @ViewChild('swipeCard') private swipeCardRef?: ElementRef<HTMLDivElement>;

  // Touch-only devices (phones/tablets) get the swipe-to-skip gesture — real
  // mice don't produce 'touch' PointerEvents, so a desktop with a
  // touchscreen still only triggers it when actually touched, not clicked.
  // Checked once (not reactive): a device doesn't switch input class mid-session.
  readonly isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  private router = inject(Router);
  private state = inject(GameStateService);
  private ytPlayer = inject(YoutubePlayerService);
  private spotify = inject(SpotifyService);
  private apple = inject(AppleMusicService);
  private deckService = inject(DeckService);
  private seo = inject(SeoService);

  readonly track = this.state.currentTrack;
  readonly provider = this.state.provider;
  readonly videoBlur = this.state.videoBlur;
  readonly revealed = signal(false);
  readonly showOverlay = signal(true);
  readonly overlayReady = signal(false);
  readonly overlayError = signal<string | null>(null);
  readonly playerError = signal<string | null>(null);
  readonly isPlaying = signal(false);

  // Custom deck mode
  readonly isCustomMode = this.state.isCustomDeckMode;
  readonly customCard = this.state.currentCustomCard;
  readonly customProgress = this.state.customDeckProgress;
  readonly isFinished = this.state.isCustomDeckFinished;

  readonly effectiveYtId = computed(() => {
    if (this.isCustomMode()) {
      return this.customCard()?.yt_id ?? null;
    }
    return this.track()?.youtube_video_id ?? null;
  });

  constructor() {
    // spotify.error()/apple.error() are set asynchronously by SDK listeners
    // (e.g. authentication_error mid-session) — surface them into the UI's
    // playerError, which nothing previously read these signals into.
    effect(() => {
      const p = this.provider();
      const err = p === 'spotify' ? this.spotify.error() : p === 'apple' ? this.apple.error() : null;
      if (err) {
        this.playerError.set(err);
      }
    });
  }

  ngOnInit(): void {
    this.seo.set({ title: 'Playing', noindex: true });
    if (!this.isCustomMode() && !this.track()) {
      this.router.navigate(['/scan']);
      return;
    }
    if (this.isCustomMode() && this.isFinished()) {
      // Game already finished — stay on finished screen
      return;
    }
    this.preparePlayer();
  }

  ngOnDestroy(): void {
    const p = this.provider();
    if (p === 'youtube') {
      this.ytPlayer.destroy();
    }
    if (p === 'spotify') {
      this.spotify.stop();
    }
    if (p === 'apple') {
      this.apple.stop();
    }
  }

  private async preparePlayer(): Promise<void> {
    const p = this.provider();
    const ytId = this.effectiveYtId();

    if (p === 'youtube') {
      if (ytId) {
        try {
          await this.ytPlayer.loadAPI();
          // Pre-create the player so loadVideoById() in the tap handler is
          // called on a ready player — required for iOS Safari autoplay.
          await this.ytPlayer.preloadPlayer();
          this.overlayReady.set(true);
        } catch {
          this.overlayError.set('Failed to load YouTube player');
          this.overlayReady.set(true);
        }
      } else {
        this.overlayError.set('No YouTube video available for this card');
        this.overlayReady.set(true);
      }
      return;
    }

    if (p === 'spotify') {
      // Clear any error left over from a previous card so a stale message
      // doesn't leak into this one via the spotify.error() effect.
      this.spotify.error.set(null);
      try {
        await this.spotify.initSDK();
        this.overlayReady.set(true);
      } catch (e: any) {
        this.overlayError.set(e.message || 'Spotify failed to initialize');
        this.overlayReady.set(true);
      }
      return;
    }

    if (p === 'apple') {
      this.apple.error.set(null);
      try {
        await this.apple.init();
        // Pre-load the track queue so play() in the tap handler has no async work
        // before music.play() — required for iOS Safari autoplay (C2 fix).
        const t = this.track();
        if (t?.artist && t?.title) {
          await this.apple.preloadTrack(t.artist, t.title);
        }
        this.overlayReady.set(true);
      } catch (e: any) {
        this.overlayError.set(e.message || 'Apple Music failed to initialize');
        this.overlayReady.set(true);
      }
      return;
    }
  }

  // Called synchronously inside click handler — required for iOS autoplay
  onOverlayTap(): void {
    // Ignore taps before preparePlayer() has finished its attempt — otherwise
    // the overlay hides with nothing having actually been played.
    if (!this.overlayReady()) {
      return;
    }

    const p = this.provider();
    const ytId = this.effectiveYtId();
    const t = this.track();

    this.showOverlay.set(false);

    // A single fallback path shared by all three providers — previously only the
    // YouTube branch checked overlayError() before playing, so a failed Spotify/
    // Apple init would still call play() (and, for Apple, silently play the
    // *previous* card's queue instead of showing an error or opening a link).
    if (this.overlayError()) {
      if (!this.isCustomMode() && t) {
        const link = this.getFallbackLink(t);
        if (link) {
          window.open(link, '_blank', 'noopener');
        }
      }
      return;
    }

    if (p === 'youtube') {
      if (ytId) {
        this.ytPlayer.playVideo(ytId);
        this.isPlaying.set(true);
      }
      return;
    }

    if (p === 'spotify') {
      if (!t?.spotify_id) {
        this.playerError.set('Track not available on Spotify');
        return;
      }
      this.spotify
        .play(t.spotify_id)
        .then(() => this.isPlaying.set(true))
        .catch((e: any) => this.playerError.set(e?.message ?? 'Spotify playback failed'));
      return;
    }

    if (p === 'apple') {
      // Queue was pre-loaded in preparePlayer(); play() calls music.play() immediately
      // as the first operation — iOS attributes it to this user gesture.
      this.apple
        .play()
        .then(() => this.isPlaying.set(true))
        .catch((e: any) => this.playerError.set(e?.message ?? 'Apple Music playback failed'));
      return;
    }
  }

  reveal(): void {
    this.revealed.set(true);
  }
  hide(): void {
    this.revealed.set(false);
  }

  nextCustomCard(): void {
    this.ytPlayer.destroy();
    this.state.nextCustomCard();
    this.revealed.set(false);
    this.showOverlay.set(true);
    this.overlayReady.set(false);
    this.overlayError.set(null);
    this.playerError.set(null);
    this.isPlaying.set(false);

    if (!this.state.isCustomDeckFinished()) {
      this.preparePlayer();
    }
  }

  restartCustomDeck(): void {
    const deck = this.state.customDeck()?.deck;
    if (!deck) {
      return;
    }
    const shuffleOrder = this.deckService.shuffle(deck.cards.map((_, i) => i));
    this.state.restartCustomDeck(shuffleOrder);
    this.revealed.set(false);
    this.showOverlay.set(true);
    this.overlayReady.set(false);
    this.overlayError.set(null);
    this.playerError.set(null);
    this.isPlaying.set(false);
    this.preparePlayer();
  }

  scanNext(): void {
    this.ytPlayer.destroy();
    this.spotify.stop();
    this.apple.stop();
    this.state.currentTrack.set(null);
    this.router.navigate(['/scan']);
  }

  endGame(): void {
    this.ytPlayer.destroy();
    this.spotify.stop();
    this.apple.stop();
    this.state.currentTrack.set(null);
    this.state.clearCustomDeck();
    this.state.unlock();
    this.state.setProvider(null);
    this.router.navigate(['/']);
  }

  private getFallbackLink(t: TrackInfo): string | null {
    const p = this.provider();
    if (p === 'spotify') {
      return t.spotify_url ?? null;
    }
    if (p === 'apple') {
      return t.links?.['apple_music'] ?? null;
    }
    return t.links?.['youtube_music'] ?? null;
  }

  readonly overlayLabel = computed(() => {
    if (!this.overlayReady()) {
      return 'LOADING…';
    }
    if (this.overlayError()) {
      return 'TAP TO OPEN';
    }
    return 'TAP TO PLAY';
  });

  readonly overlaySub = computed(() => {
    const p = this.provider();
    if (this.overlayError()) {
      return this.overlayError()!;
    }
    if (p === 'youtube') {
      return 'Playing via YouTube';
    }
    if (p === 'spotify') {
      return 'Playing via Spotify';
    }
    if (p === 'apple') {
      return 'Playing via Apple Music';
    }
    return '';
  });

  readonly streamingLinks = computed(() => {
    const t = this.track();
    if (!t?.links) {
      return [];
    }
    const order: [string, string][] = [
      ['spotify', 'Spotify'],
      ['apple_music', 'Apple Music'],
      ['deezer', 'Deezer'],
      ['tidal', 'Tidal'],
      ['youtube_music', 'YT Music'],
      ['youtube', 'YouTube'],
    ];
    return order.filter(([key]) => !!t.links[key]).map(([key, name]) => ({ key, name, url: t.links[key] }));
  });

  // --- Swipe-left-to-skip gesture ---
  //
  // Drag tracking manipulates the card's DOM style directly (not via Angular
  // bindings/signals) so a high-frequency pointermove stream doesn't trigger
  // a change-detection cycle per event — this only ever runs from event
  // handlers, never during render, so it's safe outside Angular's zone too.
  private readonly SWIPE_THRESHOLD_PX = 80;
  private readonly MAX_ROTATE_DEG = 10;

  private activePointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragCurrentX = 0;
  private dragAxis: 'horizontal' | 'vertical' | null = null;

  onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch' || this.activePointerId !== null) {
      return;
    }
    this.activePointerId = e.pointerId;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragCurrentX = 0;
    this.dragAxis = null;
  }

  onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) {
      return;
    }
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;

    if (this.dragAxis === null) {
      // Below the intent threshold — a real swipe vs. finger jitter/tap.
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        return;
      }
      this.dragAxis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      if (this.dragAxis === 'horizontal') {
        const el = this.swipeCardRef?.nativeElement;
        el?.setPointerCapture(e.pointerId);
        el?.classList.add('dragging');
      }
    }

    if (this.dragAxis !== 'horizontal') {
      return; // vertical intent — let the page scroll natively, don't interfere
    }

    e.preventDefault();
    // Only leftward movement is visually tracked — swipe-right is a no-op
    // by design (a single, unambiguous "skip" direction).
    this.dragCurrentX = Math.min(0, dx);
    this.applyDragStyle(this.dragCurrentX);
  }

  onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) {
      return;
    }
    this.activePointerId = null;
    this.swipeCardRef?.nativeElement.classList.remove('dragging');

    if (this.dragAxis === 'horizontal') {
      if (this.dragCurrentX <= -this.SWIPE_THRESHOLD_PX) {
        this.flyOutAndAdvance();
      } else {
        this.snapBack();
      }
    }
    this.dragAxis = null;
  }

  onPointerCancel(e: PointerEvent): void {
    this.onPointerUp(e);
  }

  private applyDragStyle(dx: number): void {
    const el = this.swipeCardRef?.nativeElement;
    if (!el) {
      return;
    }
    const rotate = Math.max(-this.MAX_ROTATE_DEG, dx / 12);
    el.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`;
    el.style.opacity = `${1 - Math.min(0.6, Math.abs(dx) / 300)}`;
  }

  private snapBack(): void {
    const el = this.swipeCardRef?.nativeElement;
    if (!el) {
      return;
    }
    el.classList.add('snapping');
    el.style.transform = '';
    el.style.opacity = '';
    setTimeout(() => el.classList.remove('snapping'), 250);
  }

  private flyOutAndAdvance(): void {
    const el = this.swipeCardRef?.nativeElement;
    if (el) {
      el.classList.add('flying-left');
      el.style.transform = `translateX(-140%) rotate(-${this.MAX_ROTATE_DEG}deg)`;
      el.style.opacity = '0';
    }
    setTimeout(() => {
      if (this.isCustomMode()) {
        this.nextCustomCard();
      } else {
        this.scanNext();
      }
      if (el) {
        el.classList.remove('flying-left');
        el.style.transform = '';
        el.style.opacity = '';
      }
    }, 260);
  }
}
