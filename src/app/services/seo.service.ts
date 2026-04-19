import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

const APP_NAME = 'musicguessr';
const DEFAULT_DESCRIPTION =
  'Play any Hitster card with YouTube, Spotify or Apple Music — no subscription lock-in. Scan QR codes, guess the year, create custom decks.';

export type SeoOptions = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  noindex?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private titleSvc = inject(Title);
  private meta = inject(Meta);

  set(options: SeoOptions = {}): void {
    const fullTitle = options.title ? `${options.title} — ${APP_NAME}` : APP_NAME;
    const description = options.description ?? DEFAULT_DESCRIPTION;
    const canonical = options.url ?? (typeof window !== 'undefined' ? window.location.href : '');

    this.titleSvc.setTitle(fullTitle);

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: options.noindex ? 'noindex,nofollow' : 'index,follow' });

    // Open Graph
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    if (options.image) {
      this.meta.updateTag({ property: 'og:image', content: options.image });
    }

    // Twitter / X
    this.meta.updateTag({ name: 'twitter:title', content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    if (options.image) {
      this.meta.updateTag({ name: 'twitter:image', content: options.image });
    }
  }
}
