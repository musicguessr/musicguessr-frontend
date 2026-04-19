import { ChangeDetectionStrategy, Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { CreateDeckResponse, DeckService, DeckTTL, ValidateYtResponse } from '../../services/deck.service';
import { SeoService } from '../../services/seo.service';
import QRCodeStyling from 'qr-code-styling';

type CardRow = {
  ytUrl: string;
  title: string;
  artist: string;
  year: number | null;
  validating: boolean;
  valid: boolean | null;
  error: string | null;
  ytId: string | null;
  artwork: string | null;
};

const TTL_LABELS: { value: DeckTTL; label: string }[] = [
  { value: '1week', label: '1 week' },
  { value: '1month', label: '1 month' },
  { value: '3months', label: '3 months (default)' },
  { value: '6months', label: '6 months' },
  { value: '1year', label: '1 year' },
];

@Component({
  selector: 'app-create-deck',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './create-deck.component.html',
  styleUrl: './create-deck.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateDeckComponent implements OnInit {
  @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLDivElement>;

  private deck = inject(DeckService);
  private router = inject(Router);
  private seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.set({
      title: 'Create Deck',
      description:
        'Build your own music quiz deck from YouTube videos or playlists. Share it with friends via a link or QR code.',
    });
  }

  readonly MAX_CARDS = 300;
  readonly ttlOptions = TTL_LABELS;

  readonly cards = signal<CardRow[]>([this.emptyCard()]);
  readonly selectedTTL = signal<DeckTTL>('3months');
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly result = signal<CreateDeckResponse | null>(null);

  // Playlist import
  playlistUrl = '';
  readonly playlistImporting = signal(false);
  readonly playlistError = signal<string | null>(null);

  private emptyCard(): CardRow {
    return {
      ytUrl: '',
      title: '',
      artist: '',
      year: null,
      validating: false,
      valid: null,
      error: null,
      ytId: null,
      artwork: null,
    };
  }

  addCard(): void {
    if (this.cards().length >= this.MAX_CARDS) {
      return;
    }
    this.cards.update((c) => [...c, this.emptyCard()]);
  }

  removeCard(i: number): void {
    this.cards.update((c) => c.filter((_, idx) => idx !== i));
    if (this.cards().length === 0) {
      this.cards.set([this.emptyCard()]);
    }
  }

  async onUrlBlur(i: number): Promise<void> {
    const card = this.cards()[i];
    if (!card.ytUrl.trim()) {
      return;
    }

    this.updateCard(i, { validating: true, valid: null, error: null });
    try {
      const res: ValidateYtResponse = await this.deck.validateYt(card.ytUrl);
      if (res.valid) {
        this.updateCard(i, {
          validating: false,
          valid: true,
          ytId: res.yt_id ?? null,
          title: card.title || res.title || '',
          artist: card.artist || res.artist || '',
          year: card.year ?? res.year ?? null,
          artwork: res.artwork ?? null,
          error: null,
        });
      } else {
        this.updateCard(i, { validating: false, valid: false, error: res.error ?? 'Invalid video' });
      }
    } catch {
      this.updateCard(i, { validating: false, valid: false, error: 'Validation failed' });
    }
  }

  private updateCard(i: number, patch: Partial<CardRow>): void {
    this.cards.update((cards) => cards.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async importPlaylist(): Promise<void> {
    const url = this.playlistUrl.trim();
    if (!url) {
      return;
    }

    this.playlistImporting.set(true);
    this.playlistError.set(null);

    try {
      const res = await this.deck.importPlaylist(url);

      const newCards: CardRow[] = res.videos
        .filter((v) => v.yt_id)
        .map((v) => ({
          ytUrl: `https://www.youtube.com/watch?v=${v.yt_id}`,
          title: v.title || '',
          artist: v.artist || '',
          year: v.year ?? null,
          validating: false,
          valid: true as const,
          error: null,
          ytId: v.yt_id!,
          artwork: v.artwork ?? null,
        }));

      this.cards.update((existing) => {
        const isPlaceholder = existing.length === 1 && !existing[0].ytUrl.trim();
        const base = isPlaceholder ? [] : existing;
        const available = this.MAX_CARDS - base.length;
        const added = newCards.slice(0, available);

        if (added.length < newCards.length) {
          this.playlistError.set(
            `Only ${added.length} of ${newCards.length} videos added — deck limit of ${this.MAX_CARDS} reached.`,
          );
        }
        return [...base, ...added];
      });

      this.playlistUrl = '';
    } catch (e: any) {
      this.playlistError.set(e?.message ?? 'Failed to import playlist');
    } finally {
      this.playlistImporting.set(false);
    }
  }

  async submit(): Promise<void> {
    const rows = this.cards();
    const invalid = rows.some((c) => c.valid !== true);
    if (invalid) {
      this.submitError.set('Please validate all cards before creating the deck.');
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);
    try {
      const res = await this.deck.createDeck(
        rows.map((c) => ({
          yt_url: c.ytUrl,
          title: c.title || undefined,
          artist: c.artist || undefined,
          year: c.year ?? undefined,
        })),
        this.selectedTTL(),
      );
      this.result.set(res);
      setTimeout(() => this.renderQR(res.share_url), 0);
      this.deck
        .getDeck(res.id)
        .then((full) => {
          this.deck.cacheDeck(full);
          this.deck.saveLocalDeckEntry(full);
        })
        .catch(() => {
          /* non-fatal */
        });
    } catch (e: any) {
      this.submitError.set(e.message ?? 'Failed to create deck');
    } finally {
      this.submitting.set(false);
    }
  }

  private renderQR(url: string): void {
    if (!this.qrCanvas?.nativeElement) {
      return;
    }
    this.qrCanvas.nativeElement.innerHTML = '';
    const qr = new QRCodeStyling({
      width: 240,
      height: 240,
      data: url,
      dotsOptions: { color: '#ffffff', type: 'rounded' },
      cornersSquareOptions: { color: '#ffffff', type: 'extra-rounded' },
      backgroundOptions: { color: '#0a0a0a' },
      image: undefined,
      imageOptions: { crossOrigin: 'anonymous', margin: 4 },
    });
    qr.append(this.qrCanvas.nativeElement);
  }

  copyLink(): void {
    const url = this.result()?.share_url;
    if (url) {
      navigator.clipboard.writeText(url);
    }
  }

  playNow(): void {
    const id = this.result()?.id;
    if (id) {
      this.router.navigate(['/deck', id]);
    }
  }

  createAnother(): void {
    this.result.set(null);
    this.cards.set([this.emptyCard()]);
    this.playlistUrl = '';
    this.playlistError.set(null);
  }

  trackByIndex(i: number): number {
    return i;
  }
}
