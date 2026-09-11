import { Injectable, signal } from '@angular/core';

// Separate from GlobalErrorHandler so any component can read/clear the
// signal without depending on Angular's ErrorHandler token directly.
@Injectable({ providedIn: 'root' })
export class AppErrorService {
  readonly fatalError = signal<string | null>(null);

  reportFatal(message: string): void {
    this.fatalError.set(message);
  }

  clear(): void {
    this.fatalError.set(null);
  }
}
