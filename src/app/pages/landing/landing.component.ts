import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { TranslationService } from '../../i18n/translation.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher.component';
import { LocalizePathPipe } from '../../i18n/localize-path.pipe';

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
    // prerendering — see its doc comment) rather than hardcoded, so a
    // self-hosted deployment under a different domain (see CLAUDE.md's
    // runtime config.json / SITE_URL) gets correct URLs here too instead of
    // ones pointing at musicguessr.app.
    const origin = this.seo.siteOrigin();
    this.seo.set({
      title: this.i18n.t('landing.seoTitle'),
      description: this.i18n.t('landing.seoDescription'),
      alternatePath: '/',
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'musicguessr',
          url: origin,
          // JSON-LD structured data is read by crawlers, not shown to
          // visitors — kept in English throughout (description here,
          // featureList below) rather than translated per locale. Google
          // doesn't require schema.org content to match the page's visible
          // language, and duplicating this whole block with a translated
          // featureList for three more locales wasn't worth it for content
          // nothing reads directly.
          description:
            'Play any Hitster card with YouTube, Spotify or Apple Music. Scan QR codes, guess the year, and create custom music quiz decks — no subscription lock-in.',
          applicationCategory: 'GameApplication',
          operatingSystem: 'Any',
          browserRequirements: 'Requires JavaScript. Requires a modern browser with camera access for QR scanning.',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
          featureList: [
            'YouTube playback — no account required',
            'Spotify Web Playback SDK integration',
            'Apple Music via MusicKit JS',
            'QR code scanner for Hitster cards',
            'Custom deck creator with YouTube playlist import',
            'Shareable deck links with QR codes',
            'Progressive Web App — installable on mobile',
          ],
          screenshot: `${origin}/assets/og-image.png`,
          creator: {
            '@type': 'Organization',
            name: 'musicguessr',
            url: origin,
          },
        },
      ],
    });
  }
}
