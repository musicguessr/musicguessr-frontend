import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { LOCALES, localizedPath } from '../i18n/locale';
import { TranslationService } from '../i18n/translation.service';

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
  // Page-specific schema.org blocks (e.g. WebApplication, HowTo, FAQPage).
  // Rendered alongside the breadcrumb list, if any — see setJsonLd(). Keeping
  // these scoped to the page that actually shows the matching content
  // (rather than injecting them globally in index.html) is what lets a
  // structured-data block for e.g. FAQPage only ever appear on /faq.
  structuredData?: object[];
  // The unprefixed path family this page belongs to (e.g. "/faq", "/"),
  // used to compute this page's URL in every other locale for hreflang
  // alternates. Omit for pages that don't exist in every locale (custom
  // deck pages, /play, /scan, /game, ...) — those get no hreflang block at
  // all rather than a wrong one, since a locale-prefixed variant of e.g.
  // /deck/abc123 has never actually been rendered by anything and would be
  // a dead link.
  alternatePath?: string;
};

@Injectable({ providedIn: 'root' })
export class SeoService {
  private titleSvc = inject(Title);
  private meta = inject(Meta);
  private doc = inject(DOCUMENT);
  private platformId = inject(PLATFORM_ID);
  private i18n = inject(TranslationService);

  // The real origin in-browser, or a __SITE_URL__ placeholder while
  // server-side prerendering (ng build). document.location.origin resolves
  // to Angular's internal fake prerender host ("http://ng-localhost") at
  // build time, not the real production domain — baking that into a
  // prerendered page's canonical/og:url/JSON-LD would ship a permanently
  // wrong URL, since only the root index.html's own hardcoded
  // "__SITE_URL__" tag (not any value Angular computed) gets corrected by
  // the Docker entrypoint at container start. Emitting the same placeholder
  // token here instead lets that entrypoint step (see
  // docker/entrypoint/main.go, which patches __SITE_URL__ across every
  // prerendered route's index.html) fix these too.
  siteOrigin(): string {
    return isPlatformBrowser(this.platformId) ? this.doc.location.origin : '__SITE_URL__';
  }

  set(options: SeoOptions = {}): void {
    const fullTitle = options.title ? `${options.title} — ${APP_NAME}` : APP_NAME;
    const description = options.description ?? DEFAULT_DESCRIPTION;
    const canonical = options.url ?? `${this.siteOrigin()}${this.doc.location.pathname}${this.doc.location.search}`;

    this.titleSvc.setTitle(fullTitle);
    this.doc.documentElement.lang = this.i18n.locale();

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
    this.setHreflangAlternates(options.alternatePath);

    const blocks: object[] = [];
    if (options.breadcrumbs) {
      blocks.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: options.breadcrumbs.map((crumb, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: crumb.name,
          item: `${this.siteOrigin()}${crumb.path}`,
        })),
      });
    }
    if (options.structuredData) {
      blocks.push(...options.structuredData);
    }
    // Always called, even with an empty list — clears structured data left
    // over from whatever page/route rendered before this one (relevant for
    // client-side navigation, where index.html/the previous route's <script>
    // tags would otherwise linger in the DOM).
    this.setJsonLd(blocks);
  }

  // Emits one <link rel="alternate" hreflang="..."> per locale plus an
  // "x-default" pointing at the English (unprefixed) URL — the standard
  // signal that tells Google these pages are translations of each other
  // rather than duplicate content, and which one to serve for a search in
  // an unmatched language. No-op when the page has no alternatePath (see
  // its doc comment on SeoOptions).
  private setHreflangAlternates(alternatePath: string | undefined): void {
    this.doc.querySelectorAll('link[data-seo-hreflang]').forEach((el) => el.remove());
    if (!alternatePath) {
      return;
    }
    const origin = this.siteOrigin();
    for (const locale of LOCALES) {
      const link = this.doc.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', locale);
      link.setAttribute('href', `${origin}${localizedPath(locale, alternatePath)}`);
      link.setAttribute('data-seo-hreflang', '');
      this.doc.head.appendChild(link);
    }
    const defaultLink = this.doc.createElement('link');
    defaultLink.setAttribute('rel', 'alternate');
    defaultLink.setAttribute('hreflang', 'x-default');
    defaultLink.setAttribute('href', `${origin}${localizedPath('en', alternatePath)}`);
    defaultLink.setAttribute('data-seo-hreflang', '');
    this.doc.head.appendChild(defaultLink);
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

  private setJsonLd(blocks: object[]): void {
    this.doc.querySelectorAll('script[data-seo-dynamic]').forEach((el) => el.remove());
    for (const data of blocks) {
      const script = this.doc.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-dynamic', '');
      script.text = JSON.stringify(data);
      this.doc.head.appendChild(script);
    }
  }
}
