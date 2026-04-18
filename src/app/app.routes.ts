import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { GameStateService } from './services/game-state.service';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/provider-select/provider-select.component').then((m) => m.ProviderSelectComponent),
  },
  {
    path: 'scan',
    loadComponent: () => import('./pages/scanner/scanner.component').then((m) => m.ScannerComponent),
    canActivate: [
      (): boolean => {
        const state = inject(GameStateService);
        const router = inject(Router);
        if (!state.provider()) {
          router.navigate(['/']);
          return false;
        }
        return true;
      },
    ],
  },
  {
    path: 'game',
    loadComponent: () => import('./pages/game/game.component').then((m) => m.GameComponent),
    canActivate: [
      (): boolean => {
        const state = inject(GameStateService);
        const router = inject(Router);
        if (!state.provider()) {
          router.navigate(['/']);
          return false;
        }
        if (!state.currentTrack() && !state.isCustomDeckMode()) {
          router.navigate(['/scan']);
          return false;
        }
        return true;
      },
    ],
  },
  {
    path: 'callback',
    loadComponent: () => import('./pages/callback/callback.component').then((m) => m.CallbackComponent),
  },
  {
    path: 'create-deck',
    loadComponent: () =>
      import('./pages/create-deck/create-deck.component').then((m) => m.CreateDeckComponent),
  },
  {
    path: 'deck',
    loadComponent: () =>
      import('./pages/deck-list/deck-list.component').then((m) => m.DeckListComponent),
  },
  {
    path: 'deck/:id',
    loadComponent: () =>
      import('./pages/deck-detail/deck-detail.component').then((m) => m.DeckDetailComponent),
  },
  { path: '**', redirectTo: '' },
];
