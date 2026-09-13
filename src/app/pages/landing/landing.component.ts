import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { TranslationService } from '../../i18n/translation.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher.component';
import { LocalizePathPipe } from '../../i18n/localize-path.pipe';
import { localizedPath } from '../../i18n/locale';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, LanguageSwitcherComponent, LocalizePathPipe],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnInit {
  private seo = inject(SeoService);
  i18n = inject(TranslationService);

  ngOnInit(): void {
    // Derived via SeoService.siteOrigin() (real origin in-browser, a
    // __SITE_URL__ placeholder patched in at container start while
    // prerendering) so a self-hosted deployment under another domain gets
    // correct URLs here too.
    const origin = this.seo.siteOrigin();
    const locale = this.i18n.locale();
    const t = (key: string): string => this.i18n.t(key);
    this.seo.set({
      title: t('landing.seoTitle'),
      description: t('landing.seoDescription'),
      alternatePath: '/',
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'musicguessr',
          url: `${origin}${localizedPath(locale, '/')}`,
          inLanguage: locale,
          // Built from the same translated copy the page shows, so the
          // pl/de/nl pages don't carry English entity text.
          description: t('landing.seoDescription'),
          applicationCategory: 'GameApplication',
          operatingSystem: 'Any',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
          featureList: [
            `${t('landing.why1Prefix')}${t('landing.why1Strong')}`,
            t('landing.why2'),
            t('landing.why3'),
            `${t('landing.why4Prefix')}${t('landing.why4Strong')}${t('landing.why4Suffix')}`,
            t('landing.why5'),
            t('landing.why6'),
          ],
          screenshot: `${origin}/assets/og-image.png`,
          creator: {
            '@type': 'Organization',
            name: 'musicguessr',
            url: `${origin}/`,
          },
        },
      ],
    });
  }
}
