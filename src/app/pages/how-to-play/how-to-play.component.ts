import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { TranslationService } from '../../i18n/translation.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher.component';
import { LocalizePathPipe } from '../../i18n/localize-path.pipe';

// Matches the numbered steps rendered on the page (howToPlay.step1..7).
const STEP_COUNT = 7;

@Component({
  selector: 'app-how-to-play',
  standalone: true,
  imports: [RouterLink, LanguageSwitcherComponent, LocalizePathPipe],
  templateUrl: './how-to-play.component.html',
  styleUrl: './how-to-play.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowToPlayComponent implements OnInit {
  private seo = inject(SeoService);
  i18n = inject(TranslationService);

  ngOnInit(): void {
    const t = (key: string): string => this.i18n.t(key);
    this.seo.set({
      title: t('howToPlay.seoTitle'),
      description: t('howToPlay.seoDescription'),
      alternatePath: '/how-to-play',
      breadcrumbs: [
        { name: 'musicguessr', path: '/' },
        { name: t('howToPlay.breadcrumb'), path: '/how-to-play' },
      ],
      // Generated from the visible, translated steps so the markup always
      // matches the page and is in the page's language.
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: t('howToPlay.heading'),
          description: t('howToPlay.intro'),
          inLanguage: this.i18n.locale(),
          step: Array.from({ length: STEP_COUNT }, (_, i) => ({
            '@type': 'HowToStep',
            position: i + 1,
            name: t(`howToPlay.step${i + 1}Title`),
            text: t(`howToPlay.step${i + 1}Body`),
          })),
        },
      ],
    });
  }
}
