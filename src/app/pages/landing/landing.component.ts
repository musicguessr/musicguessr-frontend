import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnInit {
  private seo = inject(SeoService);

  ngOnInit(): void {
    // Derived via SeoService.siteOrigin() (real origin in-browser, a
    // __SITE_URL__ placeholder patched in at container start while
    // prerendering — see its doc comment) rather than hardcoded, so a
    // self-hosted deployment under a different domain (see CLAUDE.md's
    // runtime config.json / SITE_URL) gets correct URLs here too instead of
    // ones pointing at musicguessr.app.
    const origin = this.seo.siteOrigin();
    this.seo.set({
      title: 'Play Hitster Cards on YouTube — Free, No Login',
      description:
        'Play Hitster card game in your browser using YouTube, Spotify, or Apple Music. Scan QR codes, guess the year — no Spotify required. Free & open source.',
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'musicguessr',
          url: origin,
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
