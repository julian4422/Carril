import {
  AUTOSCROLL_EDGE_PX,
  AUTOSCROLL_MAX_SPEED,
  DRAG_THRESHOLD_PX,
  TOUCH_SLOP_PX,
  autoScrollSpeed,
  dropTarget,
  gestureOnLongPress,
  gestureOnMove,
  needsLongPress,
  pickColumn,
} from './pointer-drag.logic';

describe('pointer-drag.logic', () => {
  describe('inicio del gesto', () => {
    it('el ratón y las asas no necesitan pulsación larga; el dedo y el lápiz sí', () => {
      expect(needsLongPress('mouse', false)).toBeFalse();
      expect(needsLongPress('touch', true)).toBeFalse();
      expect(needsLongPress('pen', true)).toBeFalse();
      expect(needsLongPress('touch', false)).toBeTrue();
      expect(needsLongPress('pen', false)).toBeTrue();
    });

    it('con el ratón arrastra al superar el umbral de movimiento', () => {
      expect(gestureOnMove('mouse', false, DRAG_THRESHOLD_PX - 1, 0)).toBe('pending');
      expect(gestureOnMove('mouse', false, 3, 4)).toBe('drag'); // hipotenusa 5
      expect(gestureOnMove('touch', true, 0, DRAG_THRESHOLD_PX)).toBe('drag');
    });

    it('con el dedo, moverse más que el margen antes de tiempo es un scroll (cancela)', () => {
      expect(gestureOnMove('touch', false, 0, TOUCH_SLOP_PX)).toBe('pending');
      expect(gestureOnMove('touch', false, 0, TOUCH_SLOP_PX + 1)).toBe('cancel');
      expect(gestureOnMove('pen', false, 30, 0)).toBe('cancel');
    });

    it('al vencer la pulsación larga, arrastra si el dedo sigue casi quieto', () => {
      expect(gestureOnLongPress('touch', false, 2, 3)).toBe('drag');
      expect(gestureOnLongPress('touch', false, 20, 0)).toBe('cancel');
      expect(gestureOnLongPress('mouse', false, 0, 0)).toBe('pending');
      expect(gestureOnLongPress('touch', true, 0, 0)).toBe('pending');
    });
  });

  describe('autoScrollSpeed', () => {
    it('es 0 lejos de los bordes', () => {
      expect(autoScrollSpeed(500, 0, 1000)).toBe(0);
    });

    it('es negativa cerca del inicio y positiva cerca del final, con máximo en el borde', () => {
      expect(autoScrollSpeed(0, 0, 1000)).toBe(-AUTOSCROLL_MAX_SPEED);
      expect(autoScrollSpeed(1000, 0, 1000)).toBe(AUTOSCROLL_MAX_SPEED);
      expect(autoScrollSpeed(-50, 0, 1000)).toBe(-AUTOSCROLL_MAX_SPEED); // fuera, se limita
      const half = autoScrollSpeed(AUTOSCROLL_EDGE_PX / 2, 0, 1000);
      expect(half).toBeLessThan(0);
      expect(half).toBeGreaterThan(-AUTOSCROLL_MAX_SPEED);
      expect(autoScrollSpeed(1000 - AUTOSCROLL_EDGE_PX / 2, 0, 1000)).toBe(-half);
    });

    it('en contenedores pequeños la franja es un tercio del tamaño', () => {
      expect(autoScrollSpeed(50, 0, 90)).toBe(0);
      expect(autoScrollSpeed(10, 0, 90)).toBeLessThan(0);
      expect(autoScrollSpeed(0, 10, 10)).toBe(0);
    });
  });

  describe('dropTarget', () => {
    const items = [
      { id: 'a', start: 0, size: 40 },
      { id: 'b', start: 50, size: 40 },
    ];

    it('lista vacía: al final', () => {
      expect(dropTarget(10, [])).toEqual({ id: null, after: true });
    });

    it('antes del primer elemento cuya mitad queda por debajo del puntero', () => {
      expect(dropTarget(5, items)).toEqual({ id: 'a', after: false });
      expect(dropTarget(30, items)).toEqual({ id: 'b', after: false });
      expect(dropTarget(69, items)).toEqual({ id: 'b', after: false });
    });

    it('después del último si el puntero pasa su mitad', () => {
      expect(dropTarget(71, items)).toEqual({ id: 'b', after: true });
      expect(dropTarget(500, items)).toEqual({ id: 'b', after: true });
    });
  });

  describe('pickColumn', () => {
    const cols = [
      { id: 'c1', left: 0, right: 100 },
      { id: 'c2', left: 120, right: 220 },
    ];

    it('devuelve la columna bajo x', () => {
      expect(pickColumn(50, cols)).toBe('c1');
      expect(pickColumn(120, cols)).toBe('c2');
    });

    it('en un hueco o fuera, la más cercana', () => {
      expect(pickColumn(105, cols)).toBe('c1');
      expect(pickColumn(115, cols)).toBe('c2');
      expect(pickColumn(900, cols)).toBe('c2');
      expect(pickColumn(-40, cols)).toBe('c1');
    });

    it('sin columnas, null', () => {
      expect(pickColumn(0, [])).toBeNull();
    });
  });
});
