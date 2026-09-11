/**
 * Swipe-left-to-skip gesture for the game card, extracted out of
 * GameComponent to keep that file under the repo's max-lines lint limit.
 *
 * Drag tracking manipulates the card's DOM style directly (not via Angular
 * bindings/signals) so a high-frequency pointermove stream doesn't trigger a
 * change-detection cycle per event — this only ever runs from event
 * handlers, never during render, so it's safe outside Angular's zone too.
 */
export class CardSwipeGesture {
  private readonly SWIPE_THRESHOLD_PX = 80;
  private readonly MAX_ROTATE_DEG = 10;

  private activePointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragCurrentX = 0;
  private dragAxis: 'horizontal' | 'vertical' | null = null;

  /**
   * @param getElement Returns the card element to drag, or undefined if not
   *   currently rendered.
   * @param onSwipeLeft Called once the fly-out animation finishes for a
   *   completed left swipe — the caller advances to the next card here.
   */
  constructor(
    private readonly getElement: () => HTMLElement | undefined,
    private readonly onSwipeLeft: () => void,
  ) {}

  onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch' || this.activePointerId !== null) {
      return;
    }
    this.activePointerId = e.pointerId;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragCurrentX = 0;
    this.dragAxis = null;
  }

  onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) {
      return;
    }
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;

    if (this.dragAxis === null) {
      // Below the intent threshold — a real swipe vs. finger jitter/tap.
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        return;
      }
      this.dragAxis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      if (this.dragAxis === 'horizontal') {
        const el = this.getElement();
        el?.setPointerCapture(e.pointerId);
        el?.classList.add('dragging');
      }
    }

    if (this.dragAxis !== 'horizontal') {
      return; // vertical intent — let the page scroll natively, don't interfere
    }

    e.preventDefault();
    // Only leftward movement is visually tracked — swipe-right is a no-op
    // by design (a single, unambiguous "skip" direction).
    this.dragCurrentX = Math.min(0, dx);
    this.applyDragStyle(this.dragCurrentX);
  }

  onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.activePointerId) {
      return;
    }
    this.activePointerId = null;
    this.getElement()?.classList.remove('dragging');

    if (this.dragAxis === 'horizontal') {
      if (this.dragCurrentX <= -this.SWIPE_THRESHOLD_PX) {
        this.flyOutAndAdvance();
      } else {
        this.snapBack();
      }
    }
    this.dragAxis = null;
  }

  onPointerCancel(e: PointerEvent): void {
    this.onPointerUp(e);
  }

  private applyDragStyle(dx: number): void {
    const el = this.getElement();
    if (!el) {
      return;
    }
    const rotate = Math.max(-this.MAX_ROTATE_DEG, dx / 12);
    el.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`;
    el.style.opacity = `${1 - Math.min(0.6, Math.abs(dx) / 300)}`;
  }

  private snapBack(): void {
    const el = this.getElement();
    if (!el) {
      return;
    }
    el.classList.add('snapping');
    el.style.transform = '';
    el.style.opacity = '';
    setTimeout(() => el.classList.remove('snapping'), 250);
  }

  private flyOutAndAdvance(): void {
    const el = this.getElement();
    if (el) {
      el.classList.add('flying-left');
      el.style.transform = `translateX(-140%) rotate(-${this.MAX_ROTATE_DEG}deg)`;
      el.style.opacity = '0';
    }
    setTimeout(() => {
      this.onSwipeLeft();
      if (el) {
        el.classList.remove('flying-left');
        el.style.transform = '';
        el.style.opacity = '';
      }
    }, 260);
  }
}
