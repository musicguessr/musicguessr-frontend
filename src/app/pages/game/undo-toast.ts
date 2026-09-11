import { signal } from '@angular/core';

const VISIBLE_MS = 4000;

// Shows a brief "Undo" affordance after an action that can be reverted
// (currently: swiping past a custom-deck card) — auto-hides after
// VISIBLE_MS, or immediately once the undo itself is invoked. A swipe is a
// fast, easy-to-mistrigger gesture with no confirmation step, unlike the
// physical-card Hitster flow where "the next card" is decided by picking up
// an actual card, not a screen gesture.
export class UndoToast {
  readonly visible = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(): void {
    this.clearTimer();
    this.visible.set(true);
    this.timer = setTimeout(() => this.visible.set(false), VISIBLE_MS);
  }

  dismiss(): void {
    this.clearTimer();
    this.visible.set(false);
  }

  destroy(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
