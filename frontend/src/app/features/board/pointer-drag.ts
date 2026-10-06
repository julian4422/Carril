import {
  LONG_PRESS_MS,
  autoScrollSpeed,
  gestureOnLongPress,
  gestureOnMove,
  needsLongPress,
} from './pointer-drag.logic';

export interface AutoScrollTarget { el: Element; axis: 'x' | 'y' }

export interface PointerDragHandlers {
  /** El gesto se convirtió en arrastre. */
  start(): void;
  /** El puntero se movió (o el contenedor se desplazó): recalcula el destino. */
  move(x: number, y: number): void;
  /** Se soltó durante un arrastre. */
  drop(): void;
  /** Se canceló un arrastre ya iniciado (Esc, pointercancel). */
  cancel(): void;
  /** Contenedores que deben desplazarse si el puntero está cerca de sus bordes. */
  scrollers?(x: number, y: number): AutoScrollTarget[];
}

export interface PointerDragOptions {
  /** Elemento que se arrastra; se clona como "fantasma". */
  element: HTMLElement;
  /** El gesto empezó en un asa con `touch-action: none`: no hace falta pulsación larga. */
  fromHandle?: boolean;
  /** Programador de cuadros (inyectable en pruebas). */
  frame?: (cb: () => void) => number;
  cancelFrame?: (id: number) => void;
}

export type SessionPhase = 'pending' | 'drag' | 'done';

/**
 * Un gesto de arrastre, desde `pointerdown` hasta que se suelta o se cancela.
 * Decide cuándo empieza el arrastre (umbral o pulsación larga), mueve el fantasma,
 * evita que el navegador haga scroll mientras se arrastra con el dedo, hace auto-scroll
 * cerca de los bordes y suprime el `click` posterior al soltar.
 */
export class PointerDragSession {
  phase: SessionPhase = 'pending';

  private readonly pointerId: number;
  private readonly pointerType: string;
  private readonly startX: number;
  private readonly startY: number;
  private x: number;
  private y: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frameId: number | null = null;
  private ghost: HTMLElement | null = null;
  private readonly frame: (cb: () => void) => number;
  private readonly cancelFrame: (id: number) => void;
  private readonly fromHandle: boolean;

  constructor(
    down: PointerEvent,
    private readonly handlers: PointerDragHandlers,
    private readonly options: PointerDragOptions,
  ) {
    this.pointerId = down.pointerId;
    this.pointerType = down.pointerType || 'mouse';
    this.startX = this.x = down.clientX;
    this.startY = this.y = down.clientY;
    this.fromHandle = options.fromHandle ?? false;
    this.frame = options.frame ?? ((cb) => requestAnimationFrame(cb));
    this.cancelFrame = options.cancelFrame ?? ((id) => cancelAnimationFrame(id));

    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('keydown', this.onKey, true);
    // Debe ser no pasivo para poder impedir el scroll táctil durante el arrastre.
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('contextmenu', this.onContextMenu, true);
    window.addEventListener('selectstart', this.onSelectStart, true);

    if (needsLongPress(this.pointerType, this.fromHandle)) {
      this.timer = setTimeout(() => {
        this.timer = null;
        const phase = gestureOnLongPress(this.pointerType, this.fromHandle, this.x - this.startX, this.y - this.startY);
        if (phase === 'drag') this.begin();
        else if (phase === 'cancel') this.end();
      }, LONG_PRESS_MS);
    }
  }

  /** Termina el gesto sin avisar (p. ej. al destruir el componente). */
  dispose(): void {
    this.end();
  }

  private readonly onMove = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.pointerId) return;
    this.x = ev.clientX;
    this.y = ev.clientY;
    if (this.phase === 'pending') {
      const phase = gestureOnMove(this.pointerType, this.fromHandle, this.x - this.startX, this.y - this.startY);
      if (phase === 'drag') this.begin();
      else if (phase === 'cancel') this.end();
      return;
    }
    if (this.phase !== 'drag') return;
    ev.preventDefault();
    this.placeGhost();
    this.handlers.move(this.x, this.y);
  };

  private readonly onUp = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.pointerId) return;
    if (this.phase === 'drag') {
      this.suppressNextClick();
      this.end();
      this.handlers.drop();
      return;
    }
    this.end();
  };

  private readonly onCancel = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.pointerId) return;
    this.abort();
  };

  private readonly onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' || this.phase !== 'drag') return;
    ev.preventDefault();
    ev.stopPropagation();
    this.abort();
  };

  private readonly onTouchMove = (ev: TouchEvent): void => {
    if (this.phase === 'drag' && ev.cancelable) ev.preventDefault();
  };

  private readonly onContextMenu = (ev: Event): void => {
    // La pulsación larga abriría el menú contextual (Android) en lugar de arrastrar.
    if (this.pointerType !== 'mouse') ev.preventDefault();
  };

  private readonly onSelectStart = (ev: Event): void => {
    ev.preventDefault();
  };

  private begin(): void {
    if (this.phase !== 'pending') return;
    this.phase = 'drag';
    this.clearTimer();
    try {
      this.options.element.setPointerCapture?.(this.pointerId);
    } catch {
      /* el puntero ya no está activo: no pasa nada */
    }
    this.createGhost();
    document.body.classList.add('is-pointer-dragging');
    if (this.pointerType !== 'mouse') navigator.vibrate?.(8);
    this.handlers.start();
    this.handlers.move(this.x, this.y);
    this.frameId = this.frame(this.tick);
  }

  private abort(): void {
    const wasDragging = this.phase === 'drag';
    this.end();
    if (wasDragging) this.handlers.cancel();
  }

  private end(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.clearTimer();
    if (this.frameId !== null) this.cancelFrame(this.frameId);
    this.frameId = null;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('contextmenu', this.onContextMenu, true);
    window.removeEventListener('selectstart', this.onSelectStart, true);
    this.ghost?.remove();
    this.ghost = null;
    document.body.classList.remove('is-pointer-dragging');
  }

  /** Un cuadro de auto-scroll: desplaza los contenedores y recalcula el destino si algo se movió. */
  private readonly tick = (): void => {
    if (this.phase !== 'drag') return;
    let moved = false;
    for (const { el, axis } of this.handlers.scrollers?.(this.x, this.y) ?? []) {
      const r = el.getBoundingClientRect();
      const speed = axis === 'x' ? autoScrollSpeed(this.x, r.left, r.right) : autoScrollSpeed(this.y, r.top, r.bottom);
      if (!speed) continue;
      if (axis === 'x') {
        const before = el.scrollLeft;
        el.scrollLeft = before + speed;
        moved ||= el.scrollLeft !== before;
      } else {
        const before = el.scrollTop;
        el.scrollTop = before + speed;
        moved ||= el.scrollTop !== before;
      }
    }
    if (moved) this.handlers.move(this.x, this.y);
    this.frameId = this.frame(this.tick);
  };

  private createGhost(): void {
    const src = this.options.element;
    const rect = src.getBoundingClientRect();
    const ghost = src.cloneNode(true) as HTMLElement;
    ghost.classList.remove('dragging');
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '1000',
    });
    document.body.appendChild(ghost);
    this.ghost = ghost;
    this.placeGhost();
  }

  private placeGhost(): void {
    if (!this.ghost) return;
    const dx = this.x - this.startX;
    const dy = this.y - this.startY;
    this.ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(2deg)`;
  }

  /** Tras soltar, el navegador puede disparar un `click` sobre la tarjeta: no debe abrir el detalle. */
  private suppressNextClick(): void {
    const source = this.options.element;
    const stop = (ev: Event) => {
      // Solo el click que sale del elemento arrastrado; cualquier otro sigue su curso.
      if (!(ev.target instanceof Node) || !source.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
    };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, true), 400);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
