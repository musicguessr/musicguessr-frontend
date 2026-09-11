import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppErrorService } from './services/app-error.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    @if (fatalError(); as msg) {
      <div class="fatal-error-overlay">
        <div class="fatal-error-box">
          <p class="fatal-error-icon">!</p>
          <p class="fatal-error-msg">{{ msg }}</p>
          <button class="btn btn-primary" type="button" (click)="reload()">Reload</button>
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private appError = inject(AppErrorService);
  readonly fatalError = this.appError.fatalError;

  reload(): void {
    window.location.reload();
  }
}
