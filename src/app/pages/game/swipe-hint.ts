import { signal } from '@angular/core';

const SWIPE_HINT_SEEN_KEY = 'oh_swipe_hint_seen';
// Matches the .hint-nudge keyframe duration in game.component.scss.
const ANIMATION_MS = 900;

// Drives a one-time "nudge" animation on the card so touch users actually
// notice it's swipeable, rather than relying only on the small text hint
// below it — a static label is easy to skim past, a brief motion is not.
// Gated by localStorage (not per-card): the first card a touch user ever
// sees after tapping the overlay is the one moment their attention is
// already on the card, making it the best — and only — time to teach the
// gesture without it reading as a repeated, ignorable tic on every card.
export class SwipeHint {
  readonly visible = signal(false);

  // Called once, right when the card first becomes visible/interactive.
  maybeShow(isTouchDevice: boolean): void {
    if (!isTouchDevice) {
      return;
    }
    try {
      if (localStorage.getItem(SWIPE_HINT_SEEN_KEY) === 'true') {
        return;
      }
      localStorage.setItem(SWIPE_HINT_SEEN_KEY, 'true');
    } catch {
      // localStorage unavailable (private mode, quota) — skip rather than
      // risk replaying the animation on every card.
      return;
    }
    this.visible.set(true);
    setTimeout(() => this.visible.set(false), ANIMATION_MS);
  }
}
