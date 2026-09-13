import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../services/seo.service';
import { TranslationService } from '../../i18n/translation.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher.component';
import { LocalizePathPipe } from '../../i18n/localize-path.pipe';

// nginx answers unknown URLs with a 404 status and the client-only shell;
// this is what that shell renders. Replaces a redirect to the home page,
// which turned every mistyped URL into a soft-404 duplicate of it.
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, LanguageSwitcherComponent, LocalizePathPipe],
  template: `
    <main class="page">
      <div class="page-header">
        <a class="logo" [routerLink]="'/' | localize">{{ i18n.t('common.logo') }}</a>
        <app-language-switcher />
      </div>
      <div class="not-found">
        <h1>{{ i18n.t('notFound.heading') }}</h1>
        <p>{{ i18n.t('notFound.body') }}</p>
        <a class="btn btn-primary" [routerLink]="'/' | localize">{{ i18n.t('notFound.goHome') }}</a>
      </div>
    </main>
  `,
  styles: [
    `
      .not-found {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 64px 0;
        text-align: center;
      }
      .not-found h1 {
        font-family: var(--font-display);
        font-size: clamp(2rem, 7vw, 2.4rem);
        margin: 0;
      }
      .not-found p {
        color: var(--muted);
        margin: 0 0 8px;
      }
      .not-found .btn {
        width: auto;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent implements OnInit {
  private seo = inject(SeoService);
  i18n = inject(TranslationService);

  ngOnInit(): void {
    this.seo.set({ title: this.i18n.t('notFound.seoTitle'), noindex: true });
  }
}
