import { ChangeDetectionStrategy, Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Deck, DeckService } from '../../services/deck.service';
import { GameStateService } from '../../services/game-state.service';
import { SeoService } from '../../services/seo.service';
import QRCodeStyling from 'qr-code-styling';

@Component({
  selector: 'app-deck-detail',
  standalone: true,
  imports: [RouterLink, DatePipe],
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
      this.error.set(e.message ?? 'Failed to load deck');
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
    this.router.navigate(['/game']);
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.shareUrl());
  }

  isExpired(): boolean {
    const d = this.deck();
    return d ? new Date(d.expires_at) < new Date() : false;
  }

  private applyDeckSeo(deck: import('../../services/deck.service').Deck): void {
    const artists = [...new Set(deck.cards.map((c) => c.artist).filter(Boolean))].slice(0, 4).join(', ');
    const title = `Music Quiz Deck — ${deck.cards.length} tracks${artists ? ` (${artists}…)` : ''}`;
    const description = `${deck.cards.length}-track music quiz deck. ${artists ? `Featuring ${artists} and more. ` : ''}Guess the release year for each song. Play free on musicguessr.`;
    this.seo.set({ title, description, url: this.shareUrl() });
  }
}
