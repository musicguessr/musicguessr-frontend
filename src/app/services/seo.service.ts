import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

const APP_NAME = 'musicguessr';
const DEFAULT_DESCRIPTION =
  'Play any Hitster card with YouTube, Spotify or Apple Music — no subscription lock-in. Scan QR codes, guess the year, create custom decks.';

export type BreadcrumbItem = { name: string; path: string };

export type SeoOptions = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  noindex?: boolean;
  breadcrumbs?: BreadcrumbItem[];
};

@Injectable({ providedIn: 'root' })
export class SeoService {
  private titleSvc = inject(Title);
  private meta = inject(Meta);
  private doc = inject(DOCUMENT);

  set(options: SeoOptions = {}): void {
    const fullTitle = options.title ? `${options.title} — ${APP_NAME}` : APP_NAME;
    const description = options.description ?? DEFAULT_DESCRIPTION;
    const canonical = options.url ?? this.doc.location.href;

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

    this.setCanonical(canonical);

    if (options.breadcrumbs) {
      this.setJsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: options.breadcrumbs.map((crumb, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: crumb.name,
          item: `${this.doc.location.origin}${crumb.path}`,
        })),
      });
    }
  }

  private setCanonical(url: string): void {
    let el = this.doc.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!el) {
      el = this.doc.createElement('link');
      el.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(el);
    }
    el.setAttribute('href', url);
  }

  private setJsonLd(data: object): void {
    this.doc.querySelectorAll('script[data-seo-dynamic]').forEach((el) => el.remove());
    const script = this.doc.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo-dynamic', '');
    script.text = JSON.stringify(data);
    this.doc.head.appendChild(script);
  }
}
