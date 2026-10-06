import { LONG_PRESS_MS } from './pointer-drag.logic';
import { PointerDragHandlers, PointerDragSession } from './pointer-drag';

function pe(type: string, x: number, y: number, pointerType = 'mouse', pointerId = 1): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, pointerType, pointerId, isPrimary: true, bubbles: true, cancelable: true });
}

describe('PointerDragSession', () => {
  let el: HTMLElement;
  let handlers: jasmine.SpyObj<Required<PointerDragHandlers>>;
  let frames: (() => void)[];
  let session: PointerDragSession | null;

  const frame = (cb: () => void) => frames.push(cb);
  const runFrame = () => frames.shift()?.();
  const start = (type = 'mouse', fromHandle = false, x = 10, y = 10) => {
    session = new PointerDragSession(pe('pointerdown', x, y, type), handlers, {
      element: el, fromHandle, frame, cancelFrame: () => undefined,
    });
    return session;
  };

  beforeEach(() => {
    el = document.createElement('div');
    el.id = 'src';
    el.className = 'item dragging';
    el.innerHTML = '<span id="inner">Tarjeta</span>';
    Object.assign(el.style, { position: 'fixed', left: '0', top: '0', width: '100px', height: '40px' });
    document.body.appendChild(el);
    handlers = jasmine.createSpyObj<Required<PointerDragHandlers>>('handlers', ['start', 'move', 'drop', 'cancel', 'scrollers']);
    handlers.scrollers.and.returnValue([]);
    frames = [];
    session = null;
  });

  afterEach(() => {
    session?.dispose();
    el.remove();
    document.querySelectorAll('.drag-ghost').forEach((g) => g.remove());
  });

  it('con el ratón empieza al superar el umbral, crea el fantasma y suelta', () => {
    const s = start();
    window.dispatchEvent(pe('pointermove', 12, 11));
    expect(s.phase).toBe('pending');
    expect(handlers.start).not.toHaveBeenCalled();

    window.dispatchEvent(pe('pointermove', 30, 20));
    expect(s.phase).toBe('drag');
    expect(handlers.start).toHaveBeenCalledTimes(1);
    expect(handlers.move).toHaveBeenCalledWith(30, 20);
    const ghost = document.querySelector<HTMLElement>('.drag-ghost')!;
    expect(ghost).not.toBeNull();
    expect(ghost.classList).not.toContain('dragging');
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    expect(ghost.querySelector('[id]')).toBeNull();
    expect(ghost.style.transform).toContain('translate3d(20px, 10px, 0px)');
    expect(document.body.classList).toContain('is-pointer-dragging');

    window.dispatchEvent(pe('pointermove', 50, 60));
    expect(handlers.move).toHaveBeenCalledWith(50, 60);

    window.dispatchEvent(pe('pointerup', 50, 60));
    expect(handlers.drop).toHaveBeenCalledTimes(1);
    expect(s.phase).toBe('done');
    expect(document.querySelector('.drag-ghost')).toBeNull();
    expect(document.body.classList).not.toContain('is-pointer-dragging');
  });

  it('ignora otros punteros (multitáctil)', () => {
    const s = start();
    window.dispatchEvent(pe('pointermove', 300, 300, 'mouse', 2));
    window.dispatchEvent(pe('pointerup', 300, 300, 'mouse', 2));
    expect(s.phase).toBe('pending');
  });

  it('soltar sin haber arrastrado termina sin avisar', () => {
    const s = start();
    window.dispatchEvent(pe('pointerup', 10, 10));
    expect(s.phase).toBe('done');
    expect(handlers.drop).not.toHaveBeenCalled();
    expect(handlers.cancel).not.toHaveBeenCalled();
  });

  describe('con el dedo', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    it('empieza tras la pulsación larga si el dedo no se movió', () => {
      const s = start('touch');
      window.dispatchEvent(pe('pointermove', 14, 12, 'touch'));
      jasmine.clock().tick(LONG_PRESS_MS - 1);
      expect(s.phase).toBe('pending');
      jasmine.clock().tick(1);
      expect(s.phase).toBe('drag');
      expect(handlers.start).toHaveBeenCalled();
    });

    it('si el dedo se desplaza antes de tiempo, deja hacer scroll (cancela sin avisar)', () => {
      const s = start('touch');
      window.dispatchEvent(pe('pointermove', 10, 60, 'touch'));
      expect(s.phase).toBe('done');
      jasmine.clock().tick(LONG_PRESS_MS);
      expect(handlers.start).not.toHaveBeenCalled();
      expect(handlers.cancel).not.toHaveBeenCalled();
    });

    it('desde un asa empieza por umbral, sin esperar', () => {
      const s = start('touch', true);
      window.dispatchEvent(pe('pointermove', 10, 30, 'touch'));
      expect(s.phase).toBe('drag');
    });

    it('durante el arrastre impide el scroll táctil y el menú contextual', () => {
      start('touch');
      const before = new TouchEvent('touchmove', { cancelable: true });
      window.dispatchEvent(before);
      expect(before.defaultPrevented).toBeFalse();
      const menu = new MouseEvent('contextmenu', { cancelable: true });
      window.dispatchEvent(menu);
      expect(menu.defaultPrevented).toBeTrue();

      jasmine.clock().tick(LONG_PRESS_MS);
      const during = new TouchEvent('touchmove', { cancelable: true });
      window.dispatchEvent(during);
      expect(during.defaultPrevented).toBeTrue();
      const move = pe('pointermove', 20, 20, 'touch');
      window.dispatchEvent(move);
      expect(move.defaultPrevented).toBeTrue();
    });

    it('pointercancel aborta el arrastre y avisa', () => {
      start('touch');
      jasmine.clock().tick(LONG_PRESS_MS);
      window.dispatchEvent(pe('pointercancel', 0, 0, 'touch'));
      expect(handlers.cancel).toHaveBeenCalledTimes(1);
      expect(document.querySelector('.drag-ghost')).toBeNull();
    });
  });

  it('el menú contextual del ratón no se bloquea y la selección de texto sí', () => {
    start();
    const menu = new MouseEvent('contextmenu', { cancelable: true });
    window.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBeFalse();
    const sel = new Event('selectstart', { cancelable: true });
    window.dispatchEvent(sel);
    expect(sel.defaultPrevented).toBeTrue();
  });

  it('Esc cancela solo si ya se arrastra', () => {
    const s = start();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(s.phase).toBe('pending');
    window.dispatchEvent(pe('pointermove', 40, 40));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(s.phase).toBe('drag');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handlers.cancel).toHaveBeenCalledTimes(1);
    expect(s.phase).toBe('done');
  });

  it('auto-scroll: desplaza el contenedor cerca del borde y recalcula el destino', () => {
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'fixed', left: '0', top: '0', width: '200px', height: '200px', overflow: 'auto' });
    box.innerHTML = '<div style="width:2000px;height:2000px"></div>';
    document.body.appendChild(box);
    handlers.scrollers.and.returnValue([{ el: box, axis: 'x' }, { el: box, axis: 'y' }]);
    try {
      start();
      window.dispatchEvent(pe('pointermove', 195, 100)); // cerca del borde derecho
      handlers.move.calls.reset();
      runFrame();
      expect(box.scrollLeft).toBeGreaterThan(0);
      expect(box.scrollTop).toBe(0);
      expect(handlers.move).toHaveBeenCalledWith(195, 100);

      window.dispatchEvent(pe('pointermove', 100, 198)); // cerca del borde inferior
      runFrame();
      expect(box.scrollTop).toBeGreaterThan(0);

      window.dispatchEvent(pe('pointermove', 100, 100)); // centro: nada que hacer
      handlers.move.calls.reset();
      const left = box.scrollLeft;
      runFrame();
      expect(box.scrollLeft).toBe(left);
      expect(handlers.move).not.toHaveBeenCalled();
      expect(frames.length).toBe(1); // sigue programando cuadros mientras arrastra
    } finally {
      box.remove();
    }
  });

  it('suprime el click que sigue a soltar sobre el elemento, pero no otros', () => {
    const onClick = jasmine.createSpy('click');
    el.addEventListener('click', onClick);
    start();
    window.dispatchEvent(pe('pointermove', 40, 40));
    window.dispatchEvent(pe('pointerup', 40, 40));
    el.click();
    expect(onClick).not.toHaveBeenCalled();
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    const other = document.createElement('button');
    const onOther = jasmine.createSpy('other');
    other.addEventListener('click', onOther);
    document.body.appendChild(other);
    start();
    window.dispatchEvent(pe('pointermove', 40, 40));
    window.dispatchEvent(pe('pointerup', 40, 40));
    other.click();
    expect(onOther).toHaveBeenCalled();
    other.remove();
  });

  it('dispose termina sin avisar y es idempotente', () => {
    const s = start();
    window.dispatchEvent(pe('pointermove', 40, 40));
    s.dispose();
    s.dispose();
    expect(s.phase).toBe('done');
    expect(handlers.cancel).not.toHaveBeenCalled();
    expect(document.querySelector('.drag-ghost')).toBeNull();
  });
});
