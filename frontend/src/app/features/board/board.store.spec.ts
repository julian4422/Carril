import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { makeBoard, makeColumn, makeTask } from '../../testing';
import { BoardStore } from './board.store';

describe('BoardStore', () => {
  let store: BoardStore;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [BoardStore, provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(BoardStore);
    http = TestBed.inject(HttpTestingController);
    const p = store.load('b1');
    http.expectOne('/api/v1/boards/b1').flush(makeBoard());
    await p;
  });

  afterEach(() => http.verify());

  const ids = (colId: string) => store.columns().find((c) => c.id === colId)!.tasks.map((t) => t.id);

  it('carga el tablero', () => {
    expect(store.board()?.name).toBe('Mi tablero');
    expect(store.loading()).toBeFalse();
    expect(store.error()).toBeNull();
  });

  it('guarda el error si la carga falla', async () => {
    const p = store.load('x');
    http.expectOne('/api/v1/boards/x').flush({ detail: 'Tablero no encontrado' }, { status: 404, statusText: 'Not Found' });
    await p;
    expect(store.error()).toBe('Tablero no encontrado');
    expect(store.board()).toBeNull();
  });

  it('filtra por texto y prioridad, y marca WIP superado', () => {
    store.filterText.set('t2');
    expect(store.view()[0].tasks.map((t) => t.id)).toEqual(['t2']);
    expect(store.filtering()).toBeTrue();
    store.clearFilters();
    expect(store.filtering()).toBeFalse();
    store.filterPriority.set('urgent');
    expect(store.view()[0].tasks.length).toBe(0);
    store.clearFilters();

    store.board.update((b) => ({ ...b!, columns: b!.columns.map((c) => (c.id === 'c1' ? { ...c, wip_limit: 2 } : c)) }));
    expect(store.view()[0].overWip).toBeTrue();
    expect(store.view()[1].overWip).toBeFalse();
  });

  describe('moveTask', () => {
    it('es optimista y llama a la API con la columna y posición correctas', async () => {
      const p = store.moveTask('t1', 'c2', 1);
      expect(ids('c2')).toEqual(['t4', 't1']); // antes de responder
      const req = http.expectOne('/api/v1/tasks/t1/move');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ column_id: 'c2', position: 1 });
      req.flush(makeTask('t1', 'c2', 1));
      expect(await p).toBeTrue();
      expect(ids('c1')).toEqual(['t2', 't3']);
    });

    it('revierte si la API falla', async () => {
      const p = store.moveTask('t1', 'c2', 0);
      expect(ids('c2')).toEqual(['t1', 't4']);
      http.expectOne('/api/v1/tasks/t1/move').flush({ detail: 'boom' }, { status: 500, statusText: 'x' });
      expect(await p).toBeFalse();
      expect(ids('c1')).toEqual(['t1', 't2', 't3']);
      expect(ids('c2')).toEqual(['t4']);
    });

    it('no llama a la API si no hay cambio', async () => {
      expect(await store.moveTask('t1', 'c1', 0)).toBeTrue();
    });

    it('devuelve false con ids desconocidos', async () => {
      expect(await store.moveTask('zz', 'c1', 0)).toBeFalse();
    });
  });

  describe('moveColumn', () => {
    it('reordena y envía todos los ids', async () => {
      const p = store.moveColumn('c3', 0);
      expect(store.columns().map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
      const req = http.expectOne('/api/v1/boards/b1/columns/order');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ column_ids: ['c3', 'c1', 'c2'] });
      req.flush([]);
      expect(await p).toBeTrue();
    });
    it('revierte si falla', async () => {
      const p = store.moveColumn('c3', 0);
      http.expectOne('/api/v1/boards/b1/columns/order').flush({ detail: 'x' }, { status: 422, statusText: 'x' });
      expect(await p).toBeFalse();
      expect(store.columns().map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    });
    it('sin cambio no llama a la API', async () => {
      expect(await store.moveColumn('c1', 0)).toBeTrue();
    });
  });

  describe('columnas', () => {
    it('agrega', async () => {
      const p = store.addColumn('Revisión', 3);
      const req = http.expectOne('/api/v1/boards/b1/columns');
      expect(req.request.body).toEqual({ name: 'Revisión', wip_limit: 3 });
      req.flush(makeColumn('c4', 3, [], { name: 'Revisión', wip_limit: 3 }));
      expect((await p)?.id).toBe('c4');
      expect(store.columns().length).toBe(4);
    });
    it('addColumn devuelve null si falla', async () => {
      const p = store.addColumn('x');
      http.expectOne('/api/v1/boards/b1/columns').flush({}, { status: 500, statusText: 'x' });
      expect(await p).toBeNull();
    });
    it('actualiza conservando tarjetas', async () => {
      const p = store.updateColumn('c1', { name: 'Nuevo', wip_limit: 5 });
      http.expectOne('/api/v1/columns/c1').flush(makeColumn('c1', 0, [], { name: 'Nuevo', wip_limit: 5 }));
      expect(await p).toBeTrue();
      const c = store.columns()[0];
      expect([c.name, c.wip_limit, c.tasks.length]).toEqual(['Nuevo', 5, 3]);
    });
    it('updateColumn false si falla', async () => {
      const p = store.updateColumn('c1', { name: 'x' });
      http.expectOne('/api/v1/columns/c1').flush({}, { status: 500, statusText: 'x' });
      expect(await p).toBeFalse();
    });
    it('elimina y compacta', async () => {
      const p = store.deleteColumn('c1');
      http.expectOne('/api/v1/columns/c1').flush(null, { status: 204, statusText: 'No Content' });
      expect(await p).toBeTrue();
      expect(store.columns().map((c) => [c.id, c.position])).toEqual([['c2', 0], ['c3', 1]]);
    });
    it('deleteColumn false si falla', async () => {
      const p = store.deleteColumn('c1');
      http.expectOne('/api/v1/columns/c1').flush({}, { status: 500, statusText: 'x' });
      expect(await p).toBeFalse();
      expect(store.columns().length).toBe(3);
    });
  });

  describe('tarjetas', () => {
    it('crea al final de la columna', async () => {
      const p = store.createTask('c3', { title: 'Nueva' });
      http.expectOne('/api/v1/columns/c3/tasks').flush(makeTask('t9', 'c3', 0, { title: 'Nueva' }));
      expect((await p)?.id).toBe('t9');
      expect(ids('c3')).toEqual(['t9']);
    });
    it('createTask null si falla', async () => {
      const p = store.createTask('c3', { title: 'N' });
      http.expectOne('/api/v1/columns/c3/tasks').flush({}, { status: 500, statusText: 'x' });
      expect(await p).toBeNull();
    });
    it('actualiza', async () => {
      const p = store.updateTask('t1', { title: 'Otro' });
      http.expectOne('/api/v1/tasks/t1').flush(makeTask('t1', 'c1', 0, { title: 'Otro' }));
      await p;
      expect(store.taskById('t1')?.title).toBe('Otro');
    });
    it('updateTask null si falla', async () => {
      const p = store.updateTask('t1', { title: 'Otro' });
      http.expectOne('/api/v1/tasks/t1').flush({}, { status: 500, statusText: 'x' });
      expect(await p).toBeNull();
    });
    it('reemplaza etiquetas', async () => {
      const p = store.setTaskLabels('t1', ['l1']);
      const req = http.expectOne('/api/v1/tasks/t1/labels');
      expect(req.request.body).toEqual({ label_ids: ['l1'] });
      req.flush(makeTask('t1', 'c1', 0, { labels: [{ id: 'l1', board_id: 'b1', name: 'Bug', color: '#ff0000' }] }));
      await p;
      expect(store.taskById('t1')?.labels.length).toBe(1);
    });
    it('setTaskLabels null si falla', async () => {
      const p = store.setTaskLabels('t1', []);
      http.expectOne('/api/v1/tasks/t1/labels').flush({}, { status: 500, statusText: 'x' });
      expect(await p).toBeNull();
    });
    it('elimina y compacta', async () => {
      const p = store.deleteTask('t1');
      http.expectOne('/api/v1/tasks/t1').flush(null, { status: 204, statusText: 'x' });
      expect(await p).toBeTrue();
      expect(store.columns()[0].tasks.map((t) => t.position)).toEqual([0, 1]);
      expect(store.taskById('t1')).toBeNull();
    });
    it('deleteTask false si falla', async () => {
      const p = store.deleteTask('t1');
      http.expectOne('/api/v1/tasks/t1').flush({}, { status: 500, statusText: 'x' });
      expect(await p).toBeFalse();
    });
    it('taskById con null', () => expect(store.taskById(null)).toBeNull());
    it('ajusta contador de comentarios', () => {
      store.adjustCommentCount('t1', 2);
      expect(store.taskById('t1')?.comment_count).toBe(2);
      store.adjustCommentCount('t1', -5);
      expect(store.taskById('t1')?.comment_count).toBe(0);
      store.adjustCommentCount('nope', 1);
    });
  });

  describe('etiquetas', () => {
    it('crea y ordena por nombre', async () => {
      const p = store.createLabel('Alfa', '#00ff00');
      http.expectOne('/api/v1/boards/b1/labels').flush({ id: 'l2', board_id: 'b1', name: 'Alfa', color: '#00ff00' });
      await p;
      expect(store.labels().map((l) => l.name)).toEqual(['Alfa', 'Bug']);
    });
    it('null si falla', async () => {
      const p = store.createLabel('Bug', '#00ff00');
      http.expectOne('/api/v1/boards/b1/labels').flush({ detail: 'dup' }, { status: 409, statusText: 'x' });
      expect(await p).toBeNull();
    });
  });
});
