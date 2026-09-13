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
import { CardSwipeGesture } from './card-swipe-gesture';
import { SwipeHint } from './swipe-hint';
import { UndoToast } from './undo-toast';
import { preparePlayerFor } from './prepare-player';
import { TranslationService } from '../../i18n/translation.service';
import { localizedPath } from '../../i18n/locale';

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
  i18n = inject(TranslationService);

  readonly track = this.state.currentTrack;
  readonly provider = this.state.provider;
  readonly videoBlur = this.state.videoBlur;
  readonly revealed = signal(false);
  readonly showOverlay = signal(true);
  readonly overlayReady = signal(false);
  readonly overlayError = signal<string | null>(null);
  readonly playerError = signal<string | null>(null);
  readonly isPlaying = signal(false);

  private readonly swipeHint = new SwipeHint();
  readonly showSwipeHint = this.swipeHint.visible;

  private readonly undoToast = new UndoToast();
  readonly showUndoToast = this.undoToast.visible;

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
    // spotify.error()/apple.error()/ytPlayer.error() are set asynchronously by
    // SDK/player listeners (e.g. authentication_error mid-session, or a YouTube
    // video becoming unembeddable) — surface them into the UI's playerError,
    // which nothing previously read these signals into.
    effect(() => {
      const p = this.provider();
      const err =
        p === 'spotify'
          ? this.spotify.error()
          : p === 'apple'
            ? this.apple.error()
            : p === 'youtube'
              ? this.ytPlayer.error()
              : null;
      if (err) {
        this.playerError.set(err);
      }
    });
  }

  ngOnInit(): void {
    this.seo.set({ title: this.i18n.t('game.seoTitle'), noindex: true });
    if (!this.isCustomMode() && !this.track()) {
      this.goTo('/scan');
      return;
    }
    if (this.isCustomMode() && this.isFinished()) {
      // Game already finished — stay on finished screen
      return;
    }
    this.preparePlayer();
  }

  ngOnDestroy(): void {
    this.stopActivePlayer();
    this.swipeGesture.destroy();
    this.undoToast.destroy();
  }

  // Only the provider this game uses — stopping every provider paused a
  // previously connected Spotify session on the user's own device while
  // they were playing through YouTube.
  private stopActivePlayer(): void {
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

  private goTo(path: string): void {
    this.router.navigateByUrl(localizedPath(this.i18n.locale(), path));
  }

  private async preparePlayer(): Promise<void> {
    const result = await preparePlayerFor(this.provider(), this.effectiveYtId(), this.track(), {
      ytPlayer: this.ytPlayer,
      spotify: this.spotify,
      apple: this.apple,
    });
    this.overlayReady.set(result.ready);
    this.overlayError.set(result.error);
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
    this.swipeHint.maybeShow(this.isTouchDevice);

    // A single fallback path shared by all three providers — previously only the
    // YouTube branch checked overlayError() before playing, so a failed Spotify/
    // Apple init would still call play() (and, for Apple, silently play the
    // *previous* card's queue instead of showing an error or opening a link).
    if (this.overlayError()) {
      const link = !this.isCustomMode() && t ? this.getFallbackLink(t) : null;
      if (link) {
        window.open(link, '_blank', 'noopener');
      } else {
        // The error text only lived on the overlay being hidden above —
        // without this, a custom-deck card with a blocked embed showed no
        // music and no explanation.
        this.playerError.set(this.overlayError());
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
        this.playerError.set(this.i18n.t('game.errTrackNotOnSpotify'));
        return;
      }
      this.spotify.activateElement();
      this.spotify
        .play(t.spotify_id)
        .then(() => this.isPlaying.set(true))
        .catch((e: any) => this.playerError.set(e?.message ?? this.i18n.t('game.errSpotifyPlaybackFailed')));
      return;
    }

    if (p === 'apple') {
      // Queue was pre-loaded in preparePlayer(); play() calls music.play() immediately
      // as the first operation — iOS attributes it to this user gesture.
      this.apple
        .play()
        .then(() => this.isPlaying.set(true))
        .catch((e: any) => this.playerError.set(e?.message ?? this.i18n.t('game.errApplePlaybackFailed')));
      return;
    }
  }

  // Lets the user recover from a failed play attempt (e.g. Spotify Connect
  // finding no active device because the app wasn't open yet) without
  // re-scanning the card — the overlay only responds to the first tap, so
  // this is the only way back into a provider's play() after that.
  retryPlayback(): void {
    const p = this.provider();
    const t = this.track();
    if (p === 'spotify' && t?.spotify_id) {
      this.playerError.set(null);
      this.spotify
        .play(t.spotify_id)
        .then(() => this.isPlaying.set(true))
        .catch((e: any) => this.playerError.set(e?.message ?? this.i18n.t('game.errSpotifyPlaybackFailed')));
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
    this.resetPlayerUiState();

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
    this.resetPlayerUiState();
    this.preparePlayer();
  }

  // Shared by nextCustomCard/restartCustomDeck/undoSwipe — each advances or
  // rewinds state.customDeck() differently, but all three then need the
  // overlay/player signals back to "fresh card, not yet played" the same way.
  private resetPlayerUiState(): void {
    this.revealed.set(false);
    this.showOverlay.set(true);
    this.overlayReady.set(false);
    this.overlayError.set(null);
    this.playerError.set(null);
    this.isPlaying.set(false);
  }

  scanNext(): void {
    this.stopActivePlayer();
    this.state.currentTrack.set(null);
    this.goTo('/scan');
  }

  endGame(): void {
    // The single most destructive one-tap action in the app (clears the
    // whole session, provider lock included) sitting right next to the
    // routine "next card" buttons — a party game's phone gets passed
    // around, so a stray tap here is a real, not hypothetical, risk.
    if (!confirm(this.i18n.t('game.endGameConfirm'))) {
      return;
    }
    this.stopActivePlayer();
    this.state.currentTrack.set(null);
    this.state.clearCustomDeck();
    this.state.unlock();
    this.state.setProvider(null);
    this.goTo('/');
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
      return this.i18n.t('game.loading');
    }
    if (this.overlayError()) {
      return this.i18n.t('game.tapToOpen');
    }
    return this.i18n.t('game.tapToPlay');
  });

  readonly overlaySub = computed(() => {
    const p = this.provider();
    if (this.overlayError()) {
      return this.overlayError()!;
    }
    if (p === 'youtube') {
      return this.i18n.t('game.playingViaYoutube');
    }
    if (p === 'spotify') {
      return this.i18n.t('game.playingViaSpotify');
    }
    if (p === 'apple') {
      return this.i18n.t('game.playingViaApple');
    }
    return '';
  });

  readonly streamingLinks = computed(() => {
    const t = this.track();
    if (!t?.links) {
      return [];
    }
    const order: [string, string][] = [
      ['spotify', this.i18n.t('game.linkSpotify')],
      ['apple_music', this.i18n.t('game.linkApple')],
      ['deezer', this.i18n.t('game.linkDeezer')],
      ['tidal', this.i18n.t('game.linkTidal')],
      ['youtube_music', this.i18n.t('game.linkYtMusic')],
      ['youtube', this.i18n.t('game.linkYoutube')],
    ];
    return order.filter(([key]) => !!t.links[key]).map(([key, name]) => ({ key, name, url: t.links[key] }));
  });

  // Swipe-left-to-skip gesture — see card-swipe-gesture.ts. Bound to
  // whichever of nextCustomCard()/scanNext() currently applies, resolved
  // lazily at swipe-completion time (not captured once at construction)
  // since isCustomMode() can only be read once the component's inputs are set.
  private readonly swipeGesture = new CardSwipeGesture(
    () => this.swipeCardRef?.nativeElement,
    () => this.onSwipeComplete(),
  );

  // Only custom-deck mode gets an undo: scanNext() (standard Hitster mode)
  // just re-opens the camera with nothing destroyed — the physical card
  // already scanned stays fully revealed/known, so an accidental swipe
  // there costs a re-scan at worst. nextCustomCard() actually advances past
  // a deck-list index with no physical card to fall back on, which is the
  // case an accidental fast swipe gesture can genuinely lose your place in.
  private onSwipeComplete(): void {
    if (this.isCustomMode()) {
      this.nextCustomCard();
      this.undoToast.show();
    } else {
      this.scanNext();
    }
  }

  undoSwipe(): void {
    this.undoToast.dismiss();
    this.ytPlayer.destroy();
    this.state.previousCustomCard();
    this.resetPlayerUiState();
    this.preparePlayer();
  }

  onPointerDown(e: PointerEvent): void {
    this.swipeGesture.onPointerDown(e);
  }
  onPointerMove(e: PointerEvent): void {
    this.swipeGesture.onPointerMove(e);
  }
  onPointerUp(e: PointerEvent): void {
    this.swipeGesture.onPointerUp(e);
  }
  onPointerCancel(e: PointerEvent): void {
    this.swipeGesture.onPointerCancel(e);
  }
}
