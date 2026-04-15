import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { GameStateService } from './services/game-state.service';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/provider-select/provider-select.component').then(m => m.ProviderSelectComponent)
  },
  {
    path: 'scan',
    loadComponent: () =>
      import('./pages/scanner/scanner.component').then(m => m.ScannerComponent),
    canActivate: [() => {
      const state = inject(GameStateService);
      const router = inject(Router);
      if (!state.provider()) {
        router.navigate(['/']);
        return false;
      }
      return true;
    }]
  },
  {
    path: 'game',
    loadComponent: () =>
      import('./pages/game/game.component').then(m => m.GameComponent),
    canActivate: [() => {
      const state = inject(GameStateService);
      const router = inject(Router);
      if (!state.provider()) {
        router.navigate(['/']);
        return false;
      }
      return true;
    }]
  },
  {
    path: 'callback',
    loadComponent: () =>
      import('./pages/callback/callback.component').then(m => m.CallbackComponent)
  },
  { path: '**', redirectTo: '' }
];
