/**
 * Lógica pura del arrastre por Pointer Events (ratón, dedo y lápiz).
 * Sin DOM: recibe números y rectángulos, así se prueba sin navegador.
 */

/** Pulsación larga que inicia el arrastre con el dedo o el lápiz. */
export const LONG_PRESS_MS = 250;
/** Movimiento tolerado durante la pulsación larga; si se supera, es un scroll. */
export const TOUCH_SLOP_PX = 10;
/** Movimiento con el ratón (o desde un asa) que inicia el arrastre. */
export const DRAG_THRESHOLD_PX = 5;
/** Franja junto a los bordes del contenedor que activa el auto-scroll. */
export const AUTOSCROLL_EDGE_PX = 56;
/** Velocidad máxima del auto-scroll, en píxeles por cuadro. */
export const AUTOSCROLL_MAX_SPEED = 18;

export type GesturePhase = 'pending' | 'drag' | 'cancel';

/**
 * El ratón (o un asa con `touch-action: none`) arrastra al superar un umbral de movimiento.
 * El dedo y el lápiz necesitan pulsación larga, para no robarle el gesto al scroll.
 */
export function needsLongPress(pointerType: string, fromHandle: boolean): boolean {
  return pointerType !== 'mouse' && !fromHandle;
}

/** Qué hacer ante un movimiento del puntero mientras el gesto está pendiente. */
export function gestureOnMove(pointerType: string, fromHandle: boolean, dx: number, dy: number): GesturePhase {
  const dist = Math.hypot(dx, dy);
  if (!needsLongPress(pointerType, fromHandle)) return dist >= DRAG_THRESHOLD_PX ? 'drag' : 'pending';
  // Con pulsación larga, moverse antes de tiempo significa que la persona quiere desplazarse.
  return dist > TOUCH_SLOP_PX ? 'cancel' : 'pending';
}

/** Qué hacer cuando vence el temporizador de la pulsación larga. */
export function gestureOnLongPress(pointerType: string, fromHandle: boolean, dx: number, dy: number): GesturePhase {
  if (!needsLongPress(pointerType, fromHandle)) return 'pending';
  return Math.hypot(dx, dy) > TOUCH_SLOP_PX ? 'cancel' : 'drag';
}

/**
 * Velocidad de auto-scroll en un eje: negativa cerca del inicio, positiva cerca del final
 * y proporcional a lo cerca que está el puntero del borde. 0 fuera de las franjas.
 */
export function autoScrollSpeed(
  pos: number,
  start: number,
  end: number,
  edge = AUTOSCROLL_EDGE_PX,
  max = AUTOSCROLL_MAX_SPEED,
): number {
  const size = end - start;
  if (size <= 0) return 0;
  const band = Math.min(edge, size / 3);
  if (pos < start + band) return -Math.ceil(max * Math.min(1, (start + band - pos) / band));
  if (pos > end - band) return Math.ceil(max * Math.min(1, (pos - (end - band)) / band));
  return 0;
}

export interface SpanRect { id: string; start: number; size: number }
export interface DropHint { id: string | null; after: boolean }

/**
 * Destino al soltar en una lista (vertical para tarjetas, horizontal para columnas).
 * `pos` es la coordenada del puntero en ese eje; `items` ya excluye el elemento arrastrado.
 * Devuelve `{ id: null }` si la lista está vacía (soltar al final).
 */
export function dropTarget(pos: number, items: SpanRect[]): DropHint {
  if (!items.length) return { id: null, after: true };
  for (const item of items) {
    if (pos < item.start + item.size / 2) return { id: item.id, after: false };
  }
  return { id: items[items.length - 1].id, after: true };
}

export interface ColumnSpan { id: string; left: number; right: number }

/** Columna bajo `x`; si `x` cae en un hueco o fuera, la más cercana. */
export function pickColumn(x: number, columns: ColumnSpan[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of columns) {
    if (x >= c.left && x <= c.right) return c.id;
    const dist = x < c.left ? c.left - x : x - c.right;
    if (dist < bestDist) {
      bestDist = dist;
      best = c.id;
    }
  }
  return best;
}
