import { makeBoard, makeTask } from '../../testing';
import { dropIndex, matchesFilter, moveTaskInColumns, reorderColumns, withPositions } from './board.logic';

describe('board.logic', () => {
  it('withPositions asigna posiciones contiguas', () => {
    const r = withPositions([{ position: 5 }, { position: 0 }]);
    expect(r.map((x) => x.position)).toEqual([0, 1]);
  });

  describe('dropIndex', () => {
    const ids = ['a', 'b', 'c'];
    it('al final cuando no hay objetivo', () => expect(dropIndex(ids, 'a', null, false)).toBe(2));
    it('antes del objetivo', () => expect(dropIndex(ids, 'a', 'c', false)).toBe(1));
    it('después del objetivo', () => expect(dropIndex(ids, 'a', 'b', true)).toBe(1));
    it('objetivo de otra lista cuenta todos', () => expect(dropIndex(['x', 'y'], 'a', 'y', false)).toBe(1));
    it('objetivo desconocido va al final', () => expect(dropIndex(ids, 'a', 'zzz', false)).toBe(2));
  });

  describe('reorderColumns', () => {
    it('mueve una columna y recalcula posiciones', () => {
      const r = reorderColumns(makeBoard().columns, 'c1', 2);
      expect(r.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
      expect(r.map((c) => c.position)).toEqual([0, 1, 2]);
    });
    it('ignora ids desconocidos', () => {
      const cols = makeBoard().columns;
      expect(reorderColumns(cols, 'nope', 0)).toBe(cols);
    });
  });

  describe('moveTaskInColumns', () => {
    it('reordena dentro de la misma columna', () => {
      const r = moveTaskInColumns(makeBoard().columns, 't1', 'c1', 2)!;
      expect(r.changed).toBeTrue();
      expect(r.columns[0].tasks.map((t) => t.id)).toEqual(['t2', 't3', 't1']);
      expect(r.columns[0].tasks.map((t) => t.position)).toEqual([0, 1, 2]);
      expect(r.position).toBe(2);
    });
    it('mueve entre columnas y actualiza column_id', () => {
      const r = moveTaskInColumns(makeBoard().columns, 't2', 'c2', 0)!;
      expect(r.columns[0].tasks.map((t) => t.id)).toEqual(['t1', 't3']);
      expect(r.columns[1].tasks.map((t) => t.id)).toEqual(['t2', 't4']);
      expect(r.columns[1].tasks[0].column_id).toBe('c2');
      expect(r.columns[1].tasks.map((t) => t.position)).toEqual([0, 1]);
      expect(r.columnId).toBe('c2');
    });
    it('mueve a una columna vacía', () => {
      const r = moveTaskInColumns(makeBoard().columns, 't4', 'c3', 0)!;
      expect(r.columns[2].tasks.map((t) => t.id)).toEqual(['t4']);
      expect(r.columns[1].tasks.length).toBe(0);
    });
    it('acota el índice', () => {
      const r = moveTaskInColumns(makeBoard().columns, 't1', 'c2', 99)!;
      expect(r.position).toBe(1);
    });
    it('detecta que no hay cambio', () => {
      const cols = makeBoard().columns;
      const r = moveTaskInColumns(cols, 't2', 'c1', 1)!;
      expect(r.changed).toBeFalse();
      expect(r.columns).toBe(cols);
    });
    it('devuelve null si no existe la tarjeta o la columna', () => {
      expect(moveTaskInColumns(makeBoard().columns, 'x', 'c1', 0)).toBeNull();
      expect(moveTaskInColumns(makeBoard().columns, 't1', 'x', 0)).toBeNull();
    });
  });

  describe('matchesFilter', () => {
    const t = makeTask('t', 'c', 0, { title: 'Arreglar Login', description: 'falla el token', priority: 'high', labels: [{ id: 'l', board_id: 'b', name: 'Backend', color: '#000000' }] });
    it('sin filtros coincide', () => expect(matchesFilter(t, '', '')).toBeTrue());
    it('por título sin distinguir mayúsculas', () => expect(matchesFilter(t, 'login', '')).toBeTrue());
    it('por descripción', () => expect(matchesFilter(t, 'TOKEN', '')).toBeTrue());
    it('por etiqueta', () => expect(matchesFilter(t, 'backend', '')).toBeTrue());
    it('por prioridad', () => {
      expect(matchesFilter(t, '', 'high')).toBeTrue();
      expect(matchesFilter(t, '', 'low')).toBeFalse();
    });
    it('sin coincidencia', () => expect(matchesFilter(t, 'zzz', '')).toBeFalse());
  });
});
