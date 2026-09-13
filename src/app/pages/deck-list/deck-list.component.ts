import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { DeckService } from '../../services/deck.service';
import { SeoService } from '../../services/seo.service';
import { TranslationService } from '../../i18n/translation.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher.component';
import { LocalizePathPipe } from '../../i18n/localize-path.pipe';

@Component({
  selector: 'app-deck-list',
  standalone: true,
  imports: [RouterLink, DatePipe, LanguageSwitcherComponent, LocalizePathPipe],
  templateUrl: './deck-list.component.html',
  styleUrl: './deck-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckListComponent implements OnInit {
  private deckService = inject(DeckService);
  private seo = inject(SeoService);
  i18n = inject(TranslationService);

  ngOnInit(): void {
    this.seo.set({
      title: this.i18n.t('deckList.seoTitle'),
      description: this.i18n.t('deckList.seoDescription'),
      noindex: true,
    });
  }

  readonly entries = this.deckService.getLocalDeckEntries();

  isExpired(expiresAt: string): boolean {
    return new Date(expiresAt) < new Date();
  }
}
