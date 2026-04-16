import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SpotifyService } from '../../services/spotify.service';
import { GameStateService } from '../../services/game-state.service';

@Component({
  selector: 'app-callback',
  standalone: true,
  imports: [],
  template: `
    <div class="callback-page">
      <div class="logo">musicguessr</div>
      @if (!error()) {
        <span class="spinner large"></span>
        <p class="msg">Connecting to {{ provider() }}…</p>
      } @else {
        <p class="error">{{ error() }}</p>
        <button class="btn btn-ghost" (click)="goHome()">Go back</button>
      }
    </div>
  `,
  styles: [
    `
      .callback-page {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 32px;
      }
      .logo {
        font-family: var(--font-display);
        font-size: 1.8rem;
        letter-spacing: 2px;
        color: var(--accent);
        margin-bottom: 16px;
      }
      .msg {
        font-size: 0.9rem;
        color: var(--muted);
      }
      .error {
        color: #ff6b6b;
        font-size: 0.9rem;
        text-align: center;
      }
      .spinner.large {
        width: 36px;
        height: 36px;
        border-width: 3px;
        margin: 0;
      }
    `,
  ],
})
export class CallbackComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private spotify = inject(SpotifyService);
  private state = inject(GameStateService);

  readonly error = signal<string | null>(null);
  readonly provider = signal<string>('Spotify');

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParams;
    const code = params['code'];
    const errorParam = params['error'];

    if (errorParam) {
      this.error.set(`Auth denied: ${errorParam}`);
      return;
    }

    if (code) {
      try {
        await this.spotify.handleCallback(code);
        this.state.setProvider('spotify');
        this.state.lock();
        this.router.navigate(['/scan']);
      } catch (e: any) {
        this.error.set(e.message || 'Token exchange failed');
      }
      return;
    }

    this.error.set('No authorization code received');
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
