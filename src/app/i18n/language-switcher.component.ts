import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Locale, LOCALE_LABELS, LOCALES, localizedPath, stripLocalePrefix } from './locale';
import { TranslationService } from './translation.service';
import { LocaleSuggestionService } from './locale-suggestion.service';

// A compact dropdown, not four inline links — the flat "English · Polski ·
// Deutsch · Nederlands" row this replaced grew with every language added
// and had nowhere left to go on mobile: it collided with the logo and
// clipped mid-word ("Nederlands" → "N") on every page under ~400px wide,
// confirmed via real screenshots at 390px before rewriting this. A single
// trigger button has a fixed footprint regardless of how many locales exist.
@Component({
  selector: 'app-language-switcher',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="lang-dropdown">
      <button
        aria-haspopup="true"
        class="lang-trigger"
        type="button"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="'Language: ' + labelFor(i18n.locale())"
        (click)="toggle()"
      >
        <svg
          class="lang-globe"
          fill="none"
          height="14"
          stroke="currentColor"
          stroke-width="1.5"
          viewBox="0 0 24 24"
          width="14"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18" />
        </svg>
        <span class="lang-code">{{ codeFor(i18n.locale()) }}</span>
      </button>
      @if (open()) {
        <div class="lang-menu" role="menu">
          @for (l of locales; track l) {
            <a
              class="lang-option"
              role="menuitem"
              [class.active]="l === i18n.locale()"
              [routerLink]="pathFor(l)"
              (click)="select()"
              >{{ labelFor(l) }}</a
            >
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .lang-dropdown {
        position: relative;
      }
      .lang-trigger {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        border: 1px solid var(--border, #2a2a2a);
        border-radius: 999px;
        background: transparent;
        color: var(--muted, #888);
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        cursor: pointer;
      }
      .lang-trigger:hover {
        color: var(--text, #fff);
        border-color: var(--muted, #888);
      }
      .lang-globe {
        flex-shrink: 0;
      }
      /* Right-aligned so the menu never overflows off the left edge of a
         narrow viewport regardless of where the trigger sits in the header. */
      .lang-menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 50;
        display: flex;
        flex-direction: column;
        min-width: 140px;
        padding: 6px;
        border: 1px solid var(--border, #2a2a2a);
        border-radius: 12px;
        background: #161616;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      }
      .lang-option {
        padding: 8px 10px;
        border-radius: 8px;
        color: var(--text, #fff);
        font-size: 0.85rem;
        text-decoration: none;
        white-space: nowrap;
      }
      .lang-option:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .lang-option.active {
        color: var(--accent);
        font-weight: 600;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSwitcherComponent {
  i18n = inject(TranslationService);
  localeSuggestion = inject(LocaleSuggestionService);
  private router = inject(Router);
  private host = inject(ElementRef<HTMLElement>);
  readonly locales = LOCALES;
  readonly open = signal(false);

  // Closing on an outside click is standard dropdown behavior; without it
  // the menu stays open after e.g. tapping a different header control.
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  select(): void {
    this.open.set(false);
    this.localeSuggestion.markHandled();
  }

  codeFor(l: Locale): string {
    return l.toUpperCase();
  }

  labelFor(l: Locale): string {
    return LOCALE_LABELS[l];
  }

  pathFor(l: Locale): string {
    const current = this.router.url.split(/[?#]/)[0];
    return localizedPath(l, stripLocalePrefix(current));
  }
}
