import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { TranslationService } from '../../i18n/translation.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher.component';
import { LocalizePathPipe } from '../../i18n/localize-path.pipe';

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [RouterLink, LanguageSwitcherComponent, LocalizePathPipe],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqComponent implements OnInit {
  private seo = inject(SeoService);
  i18n = inject(TranslationService);

  // Open/closed state lives separately from the translated q/a content
  // (i18n.faqItems(), which changes on every locale switch) so switching
  // language mid-page doesn't collapse whatever the user had open — the
  // item count and order are fixed across every locale (satisfies
  // Translations in each translations/*.ts file guarantees it), so indices
  // stay meaningfully aligned.
  private readonly openState = signal<boolean[]>([true, ...Array(12).fill(false)]);

  readonly items = computed(() => this.i18n.faqItems().map((item, i) => ({ ...item, open: this.openState()[i] })));

  ngOnInit(): void {
    this.seo.set({
      title: this.i18n.t('faq.seoTitle'),
      description: this.i18n.t('faq.seoDescription'),
      alternatePath: '/faq',
      breadcrumbs: [
        { name: 'musicguessr', path: '/' },
        { name: this.i18n.t('faq.breadcrumb'), path: '/faq' },
      ],
      // Generated from the same translated `items` rendered on the page
      // (rather than a separately hand-maintained copy) so the structured
      // data can never drift out of sync with what's actually visible —
      // Google requires FAQPage markup to match on-page content. Unlike
      // landing/how-to-play's JSON-LD, this one *is* translated per locale,
      // since it's a verbatim copy of the visible Q&A text, not a separate
      // description written for crawlers.
      structuredData: [
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: this.i18n.faqItems().map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        },
      ],
    });
  }

  toggle(index: number): void {
    this.openState.update((list) => list.map((open, i) => (i === index ? !open : open)));
  }
}
