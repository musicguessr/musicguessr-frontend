import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { DeckService } from '../../services/deck.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-deck-list',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './deck-list.component.html',
  styleUrl: './deck-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckListComponent implements OnInit {
  private deckService = inject(DeckService);
  private seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.set({
      title: 'My Decks',
      description: 'Your saved custom music quiz decks. Play, share, or create new ones.',
      noindex: true,
    });
  }

  readonly entries = this.deckService.getLocalDeckEntries();

  isExpired(expiresAt: string): boolean {
    return new Date(expiresAt) < new Date();
  }
}
