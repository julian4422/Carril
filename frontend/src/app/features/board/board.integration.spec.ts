import { HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { BoardDetail } from '../../core/models/api.models';
import { ToastService } from '../../shared/ui/toast.service';
import { TestBed } from '@angular/core/testing';
import { $, $$, settle, setupIntegration } from '../../integration-helpers';
import { LABEL, makeBoard, makeTask } from '../../testing';

async function openBoard(board: BoardDetail = makeBoard()) {
  const { http } = setupIntegration(true);
  const harness = await RouterTestingHarness.create('/boards/b1');
  http.expectOne('/api/v1/boards/b1').flush(board);
  await settle(harness);
  return { http, harness };
}

const titles = (h: RouterTestingHarness, colId: string) =>
  $$(h, `[data-column-id="${colId}"] app-task-card .title`).map((e) => e.textContent!.trim());

function drag(type: string, target: Element, init: { clientY?: number; clientX?: number; dt?: DataTransfer } = {}) {
  const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: init.dt, clientX: init.clientX, clientY: init.clientY });
  target.dispatchEvent(ev);
  return ev;
}

describe('Tablero (integración)', () => {
  it('carga el tablero y muestra columnas, tarjetas y WIP', async () => {
    const board = makeBoard();
    board.columns[0].wip_limit = 2;
    const { harness } = await openBoard(board);
    expect($$(harness, '.column').length).toBe(3);
    expect(titles(harness, 'c1')).toEqual(['Tarea t1', 'Tarea t2', 'Tarea t3']);
    expect($(harness, '[data-column-id="c1"]').classList).toContain('over-wip');
    expect($(harness, '[data-column-id="c1"]').textContent).toContain('Límite WIP superado');
    expect($(harness, '[data-column-id="c2"]').classList).not.toContain('over-wip');
  });

  it('muestra error si el tablero no existe', async () => {
    const { http } = setupIntegration(true);
    const harness = await RouterTestingHarness.create('/boards/zz');
    http.expectOne('/api/v1/boards/zz').flush({ detail: 'Tablero no encontrado' }, { status: 404, statusText: 'x' });
    await settle(harness);
    expect($(harness, '[role="alert"]').textContent).toContain('Tablero no encontrado');
  });

  it('arrastrar una tarjeta a otra columna llama a /move con column_id y position', async () => {
    const { http, harness } = await openBoard();
    const dt = new DataTransfer();
    const card = $(harness, '[data-task-id="t1"]');
    drag('dragstart', card, { dt });
    const target = $(harness, '[data-task-id="t4"]');
    const rect = target.getBoundingClientRect();
    drag('dragover', target, { dt, clientY: rect.top + 1 });
    await settle(harness);
    expect(target.classList).toContain('drop-before');
    drag('drop', target, { dt });
    // optimista: ya está en la columna destino antes de que responda la API
    await settle(harness);
    expect(titles(harness, 'c2')).toEqual(['Tarea t1', 'Tarea t4']);
    const req = http.expectOne('/api/v1/tasks/t1/move');
    expect(req.request.body).toEqual({ column_id: 'c2', position: 0 });
    req.flush(makeTask('t1', 'c2', 0));
    await settle(harness);
    expect(titles(harness, 'c1')).toEqual(['Tarea t2', 'Tarea t3']);
  });

  it('soltar sobre el área vacía de una columna agrega la tarjeta al final', async () => {
    const { http, harness } = await openBoard();
    const dt = new DataTransfer();
    drag('dragstart', $(harness, '[data-task-id="t2"]'), { dt });
    const list = $(harness, '[data-column-id="c3"] .list');
    drag('dragover', list, { dt });
    drag('drop', list, { dt });
    const req = http.expectOne('/api/v1/tasks/t2/move');
    expect(req.request.body).toEqual({ column_id: 'c3', position: 0 });
    req.flush(makeTask('t2', 'c3', 0));
    await settle(harness);
    expect(titles(harness, 'c3')).toEqual(['Tarea t2']);
  });

  it('reordena dentro de la misma columna y revierte si la API falla', async () => {
    const { http, harness } = await openBoard();
    const dt = new DataTransfer();
    drag('dragstart', $(harness, '[data-task-id="t1"]'), { dt });
    const t3 = $(harness, '[data-task-id="t3"]');
    const r = t3.getBoundingClientRect();
    drag('dragover', t3, { dt, clientY: r.bottom - 1 });
    drag('drop', t3, { dt });
    await settle(harness);
    expect(titles(harness, 'c1')).toEqual(['Tarea t2', 'Tarea t3', 'Tarea t1']);
    const req = http.expectOne('/api/v1/tasks/t1/move');
    expect(req.request.body).toEqual({ column_id: 'c1', position: 2 });
    req.flush({ detail: 'No se pudo mover' }, { status: 500, statusText: 'Server Error' });
    await settle(harness);
    expect(titles(harness, 'c1')).toEqual(['Tarea t1', 'Tarea t2', 'Tarea t3']);
    expect(TestBed.inject(ToastService).toasts()[0].message).toBe('No se pudo mover');
  });

  it('mueve una tarjeta con el teclado (Alt + flecha) y lo anuncia', async () => {
    const { http, harness } = await openBoard();
    const item = $(harness, '[data-task-id="t2"]');
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
    const req = http.expectOne('/api/v1/tasks/t2/move');
    expect(req.request.body).toEqual({ column_id: 'c2', position: 1 });
    req.flush(makeTask('t2', 'c2', 1));
    await settle(harness);
    expect(titles(harness, 'c2')).toEqual(['Tarea t4', 'Tarea t2']);
    expect($(harness, '[aria-live="polite"]').textContent).toContain('movida a Col c2');
    // Alt+Arriba dentro de la columna
    $(harness, '[data-task-id="t2"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    expect(http.expectOne('/api/v1/tasks/t2/move').request.body).toEqual({ column_id: 'c2', position: 0 });
  });

  it('reordena columnas arrastrando y llama a PUT columns/order', async () => {
    const { http, harness } = await openBoard();
    const dt = new DataTransfer();
    drag('dragstart', $(harness, '[data-column-id="c3"] .col-head'), { dt });
    const c1 = $(harness, '[data-column-id="c1"]');
    drag('dragover', c1, { dt, clientX: c1.getBoundingClientRect().left + 1 });
    drag('drop', c1, { dt });
    const req = http.expectOne('/api/v1/boards/b1/columns/order');
    expect(req.request.body).toEqual({ column_ids: ['c3', 'c1', 'c2'] });
    req.flush([]);
    await settle(harness);
    expect($$(harness, '.column').map((c) => c.dataset['columnId'])).toEqual(['c3', 'c1', 'c2']);
  });

  it('filtra por texto y por prioridad', async () => {
    const board = makeBoard();
    board.columns[0].tasks[1].priority = 'urgent';
    const { harness } = await openBoard(board);
    const search = $<HTMLInputElement>(harness, '#f-text');
    search.value = 't3';
    search.dispatchEvent(new Event('input'));
    await settle(harness);
    expect(titles(harness, 'c1')).toEqual(['Tarea t3']);
    $$(harness, 'button').find((b) => b.textContent?.includes('Limpiar'))!.click();
    await settle(harness);
    const sel = $<HTMLSelectElement>(harness, '#f-prio');
    sel.value = 'urgent';
    sel.dispatchEvent(new Event('change'));
    await settle(harness);
    expect(titles(harness, 'c1')).toEqual(['Tarea t2']);
    expect(titles(harness, 'c2')).toEqual([]);
  });

  it('crea una tarjeta rápida al final de la columna', async () => {
    const { http, harness } = await openBoard();
    $<HTMLButtonElement>(harness, '[data-column-id="c3"] .add-card').click();
    await settle(harness);
    const ta = $<HTMLTextAreaElement>(harness, '[data-column-id="c3"] .quick textarea');
    ta.value = 'Mi nueva tarjeta';
    ta.dispatchEvent(new Event('input'));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const req = http.expectOne('/api/v1/columns/c3/tasks');
    expect(req.request.body).toEqual({ title: 'Mi nueva tarjeta' });
    req.flush(makeTask('t9', 'c3', 0, { title: 'Mi nueva tarjeta' }));
    await settle(harness);
    expect(titles(harness, 'c3')).toEqual(['Mi nueva tarjeta']);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(harness);
    expect($$(harness, '.quick').length).toBe(0);
  });

  it('agrega, renombra con WIP y elimina columnas (con confirmación propia)', async () => {
    const { http, harness } = await openBoard();
    // agregar
    $$(harness, 'button').find((b) => b.textContent?.includes('Añadir columna'))!.click();
    await settle(harness);
    const name = $<HTMLInputElement>(harness, '.new-column input');
    name.value = 'Revisión';
    name.dispatchEvent(new Event('input'));
    $(harness, '.new-column form').dispatchEvent(new Event('submit'));
    const add = http.expectOne('/api/v1/boards/b1/columns');
    expect(add.request.body).toEqual({ name: 'Revisión', wip_limit: null });
    add.flush({ id: 'c4', board_id: 'b1', name: 'Revisión', position: 3, wip_limit: null, tasks: [] });
    await settle(harness);
    expect($$(harness, '.column').length).toBe(4);

    // ajustes
    $<HTMLButtonElement>(harness, '[aria-label="Ajustes de la columna Col c1"]').click();
    await settle(harness);
    const inputs = $$<HTMLInputElement>(harness, '#col-form input');
    inputs[0].value = 'Backlog';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[1].value = '2';
    inputs[1].dispatchEvent(new Event('input'));
    $(harness, '#col-form').dispatchEvent(new Event('submit'));
    const patch = http.expectOne('/api/v1/columns/c1');
    expect(patch.request.body).toEqual({ name: 'Backlog', wip_limit: 2 });
    patch.flush({ id: 'c1', board_id: 'b1', name: 'Backlog', position: 0, wip_limit: 2, tasks: [] });
    await settle(harness);
    expect($(harness, '[data-column-id="c1"] h2').textContent).toContain('Backlog');
    expect($(harness, '[data-column-id="c1"]').classList).toContain('over-wip');

    // eliminar
    $<HTMLButtonElement>(harness, '[aria-label="Ajustes de la columna Backlog"]').click();
    await settle(harness);
    $$(harness, '[role="dialog"] button').find((b) => b.textContent?.includes('Eliminar columna'))!.click();
    await settle(harness);
    expect($(harness, '[role="dialog"]').textContent).toContain('3 tarjetas');
    $$(harness, '[role="dialog"] button').find((b) => b.textContent?.trim() === 'Eliminar')!.click();
    http.expectOne('/api/v1/columns/c1').flush(null, { status: 204, statusText: 'x' });
    await settle(harness);
    expect($$(harness, '.column').length).toBe(3);
  });

  it('detalle: edita, asigna, etiqueta, comenta y borra la tarjeta', async () => {
    const { http, harness } = await openBoard();
    $<HTMLElement>(harness, '[data-task-id="t1"] [role="button"]').click();
    await settle(harness);
    http.expectOne('/api/v1/tasks/t1/comments').flush([
      { id: 'cm1', task_id: 't1', author: { id: 'u1', full_name: 'Ana Pérez' }, body: 'Primero', created_at: '2026-10-01T10:00:00Z' },
    ]);
    await settle(harness);
    expect($(harness, '[role="dialog"]').textContent).toContain('Primero');

    // guardar edición
    const title = $<HTMLInputElement>(harness, '#task-form input[type="text"]');
    title.value = 'Título nuevo';
    title.dispatchEvent(new Event('input'));
    $<HTMLSelectElement>(harness, '#td-prio').value = 'high';
    $<HTMLSelectElement>(harness, '#td-prio').dispatchEvent(new Event('change'));
    const due = $<HTMLInputElement>(harness, '#task-form input[type="date"]');
    due.value = '2026-12-31';
    due.dispatchEvent(new Event('input'));

    // asignarme
    $$(harness, '[role="dialog"] button').find((b) => b.textContent?.includes('Asignarme'))!.click();
    let req = http.expectOne('/api/v1/tasks/t1');
    expect(req.request.body).toEqual({ assignee_id: 'u1' });
    req.flush(makeTask('t1', 'c1', 0, { assignee_id: 'u1' }));
    await settle(harness);
    expect($(harness, '[role="dialog"]').textContent).toContain('Asignada a ti');

    // etiqueta existente
    $<HTMLInputElement>(harness, '.labels input[type="checkbox"]').click();
    req = http.expectOne('/api/v1/tasks/t1/labels');
    expect(req.request.body).toEqual({ label_ids: [LABEL.id] });
    req.flush(makeTask('t1', 'c1', 0, { assignee_id: 'u1', labels: [LABEL] }));
    await settle(harness);

    // crear etiqueta
    const ln = $<HTMLInputElement>(harness, '#td-lname');
    ln.value = 'Feature';
    ln.dispatchEvent(new Event('input'));
    $(harness, '.new-label').dispatchEvent(new Event('submit'));
    req = http.expectOne('/api/v1/boards/b1/labels');
    expect(req.request.body).toEqual({ name: 'Feature', color: '#0f6e63' });
    req.flush({ id: 'l2', board_id: 'b1', name: 'Feature', color: '#0f6e63' }, { status: 201, statusText: 'Created' });
    await settle(harness);
    req = http.expectOne('/api/v1/tasks/t1/labels');
    expect(req.request.body).toEqual({ label_ids: ['l1', 'l2'] });
    req.flush(makeTask('t1', 'c1', 0, { assignee_id: 'u1', labels: [LABEL, { id: 'l2', board_id: 'b1', name: 'Feature', color: '#0f6e63' }] }));
    await settle(harness);

    // comentar
    const ta = $<HTMLTextAreaElement>(harness, '#td-comment');
    ta.value = 'Segundo';
    ta.dispatchEvent(new Event('input'));
    $(harness, '.comment-form').dispatchEvent(new Event('submit'));
    req = http.expectOne('/api/v1/tasks/t1/comments');
    expect(req.request.body).toEqual({ body: 'Segundo' });
    req.flush({ id: 'cm2', task_id: 't1', author: { id: 'u1', full_name: 'Ana Pérez' }, body: 'Segundo', created_at: '2026-10-02T10:00:00Z' }, { status: 201, statusText: 'Created' });
    await settle(harness);
    expect($(harness, '.comments').textContent).toContain('Segundo');

    // guardar
    $(harness, '#task-form').dispatchEvent(new Event('submit'));
    req = http.expectOne('/api/v1/tasks/t1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ title: 'Título nuevo', description: null, priority: 'high', due_date: '2026-12-31' });
    req.flush(makeTask('t1', 'c1', 0, { title: 'Título nuevo', priority: 'high', due_date: '2026-12-31', comment_count: 2 }));
    await settle(harness);
    expect($$(harness, '[role="dialog"]').length).toBe(0);
    expect(titles(harness, 'c1')[0]).toBe('Título nuevo');

    // borrar
    $<HTMLElement>(harness, '[data-task-id="t1"] [role="button"]').click();
    await settle(harness);
    http.expectOne('/api/v1/tasks/t1/comments').flush([]);
    await settle(harness);
    $$(harness, '[role="dialog"] button').find((b) => b.textContent?.includes('Eliminar tarjeta'))!.click();
    await settle(harness);
    $$(harness, '[role="dialog"] button').find((b) => b.textContent?.trim() === 'Eliminar')!.click();
    http.expectOne('/api/v1/tasks/t1').flush(null, { status: 204, statusText: 'x' });
    await settle(harness);
    expect(titles(harness, 'c1')).toEqual(['Tarea t2', 'Tarea t3']);
    expect($$(harness, '[role="dialog"]').length).toBe(0);
    (http as HttpTestingController).verify();
  });
});
