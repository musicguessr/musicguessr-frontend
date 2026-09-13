import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppErrorService } from './services/app-error.service';
import { AppUpdateService } from './services/app-update.service';
import { TranslationService } from './i18n/translation.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    @if (updateAvailable()) {
      <div class="update-banner" role="status">
        <span class="update-text">{{ i18n.t('app.updateAvailable') }}</span>
        <button class="update-btn" type="button" (click)="applyUpdate()">{{ i18n.t('common.reload') }}</button>
      </div>
    }
    @if (fatalError(); as msg) {
      <div class="fatal-error-overlay">
        <div class="fatal-error-box">
          <p class="fatal-error-icon">!</p>
          <p class="fatal-error-msg">{{ msg }}</p>
          <button class="btn btn-primary" type="button" (click)="reload()">{{ i18n.t('common.reload') }}</button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .fatal-error-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(10, 10, 10, 0.93);
        padding: 24px;
      }
      .fatal-error-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        max-width: 320px;
        text-align: center;
      }
      .fatal-error-icon {
        font-size: 2rem;
        font-weight: 700;
        color: #ff6b6b;
      }
      .fatal-error-msg {
        color: var(--text);
        font-size: 0.95rem;
        line-height: 1.5;
        margin-bottom: 8px;
      }
      .update-banner {
        position: fixed;
        left: 50%;
        bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        z-index: 900;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: calc(100vw - 32px);
        padding: 10px 12px 10px 16px;
        border: 1px solid var(--border, #2a2a2a);
        border-radius: 999px;
        background: #1a1a1a;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
      }
      .update-text {
        color: var(--text);
        font-size: 0.82rem;
        white-space: nowrap;
      }
      .update-btn {
        flex-shrink: 0;
        padding: 6px 14px;
        border: none;
        border-radius: 999px;
        background: var(--accent);
        color: #0a0a0a;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private appError = inject(AppErrorService);
  private appUpdate = inject(AppUpdateService);
  i18n = inject(TranslationService);
  readonly fatalError = this.appError.fatalError;
  readonly updateAvailable = this.appUpdate.updateAvailable;

  ngOnInit(): void {
    this.appUpdate.init();
  }

  applyUpdate(): void {
    void this.appUpdate.applyUpdate();
  }

  reload(): void {
    window.location.reload();
  }
}
