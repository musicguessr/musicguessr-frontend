import { ChangeDetectionStrategy, Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Deck, DeckService } from '../../services/deck.service';
import { GameStateService } from '../../services/game-state.service';
import { SeoService } from '../../services/seo.service';
import { TranslationService } from '../../i18n/translation.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher.component';
import { LocalizePathPipe } from '../../i18n/localize-path.pipe';
import { localizedPath } from '../../i18n/locale';
import QRCodeStyling from 'qr-code-styling';

@Component({
  selector: 'app-deck-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, LanguageSwitcherComponent, LocalizePathPipe],
  templateUrl: './deck-detail.component.html',
  styleUrl: './deck-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckDetailComponent implements OnInit {
  @ViewChild('qrCanvas', { static: false }) qrCanvas?: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private deckService = inject(DeckService);
  private state = inject(GameStateService);
  private seo = inject(SeoService);
  i18n = inject(TranslationService);

  readonly deck = signal<Deck | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly shareUrl = signal('');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.shareUrl.set(typeof window !== 'undefined' ? window.location.href : '');
    this.seo.set({
      title: `Music Quiz Deck ${id}`,
      description: 'Play this custom music quiz deck — guess the year for each track. Shareable via link or QR code.',
      url: this.shareUrl(),
    });
    this.loadDeck(id);
  }

  private async loadDeck(id: string): Promise<void> {
    const cached = this.deckService.getCachedDeck(id);
    if (cached && new Date(cached.expires_at) > new Date()) {
      this.deck.set(cached);
      this.loading.set(false);
      this.applyDeckSeo(cached);
      setTimeout(() => this.renderQR(), 0);
      return;
    }

    try {
      const deck = await this.deckService.getDeck(id);
      this.deckService.cacheDeck(deck);
      this.deckService.saveLocalDeckEntry(deck);
      this.deck.set(deck);
      this.applyDeckSeo(deck);
      setTimeout(() => this.renderQR(), 0);
    } catch (e: any) {
      this.error.set(e.message ?? this.i18n.t('deckDetail.errFailedToLoad'));
    } finally {
      this.loading.set(false);
    }
  }

  private renderQR(): void {
    if (!this.qrCanvas?.nativeElement) {
      return;
    }
    this.qrCanvas.nativeElement.innerHTML = '';
    const qr = new QRCodeStyling({
      width: 180,
      height: 180,
      data: this.shareUrl(),
      dotsOptions: { color: '#ffffff', type: 'rounded' },
      cornersSquareOptions: { color: '#ffffff', type: 'extra-rounded' },
      backgroundOptions: { color: '#0a0a0a' },
      imageOptions: { crossOrigin: 'anonymous', margin: 4 },
    });
    qr.append(this.qrCanvas.nativeElement);
  }

  play(): void {
    const d = this.deck();
    if (!d) {
      return;
    }
    const shuffleOrder = this.deckService.shuffle(d.cards.map((_, i) => i));
    this.state.startCustomDeck(d, shuffleOrder);
    this.state.setProvider('youtube');
    this.state.lock();
    this.router.navigateByUrl(localizedPath(this.i18n.locale(), '/game'));
  }

  copyLink(): void {
    // Undefined outside secure contexts, and rejects when permission is denied.
    void navigator.clipboard?.writeText(this.shareUrl())?.catch(() => undefined);
  }

  isExpired(): boolean {
    const d = this.deck();
    return d ? new Date(d.expires_at) < new Date() : false;
  }

  // Per-deck dynamic SEO content (artist names, track counts are
  // user-generated) — kept in English along with the rest of this page's
  // SEO fields, same reasoning as landing/how-to-play's structured data:
  // this page also has no alternatePath/hreflang (shared decks aren't a
  // fixed, prerendered page family the way /faq or /how-to-play are), so
  // there's no per-locale URL for a crawler to land on here anyway.
  private applyDeckSeo(deck: import('../../services/deck.service').Deck): void {
    const artists = [...new Set(deck.cards.map((c) => c.artist).filter(Boolean))].slice(0, 4).join(', ');
    const title = `Music Quiz Deck — ${deck.cards.length} tracks${artists ? ` (${artists}…)` : ''}`;
    const description = `${deck.cards.length}-track music quiz deck. ${artists ? `Featuring ${artists} and more. ` : ''}Guess the release year for each song. Play free on musicguessr.`;
    this.seo.set({ title, description, url: this.shareUrl() });
  }
}
