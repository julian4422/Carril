import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BoardSummary } from '../../core/models/api.models';
import { ToastService } from '../../shared/ui/toast.service';
import { $, $$, settle, setupIntegration } from '../../integration-helpers';
import { makeBoard } from '../../testing';

const SUMMARY = (id: string, name: string): BoardSummary => ({
  id, name, description: 'desc', color: '#0f6e63', created_at: '', updated_at: '', column_count: 3, task_count: 1,
});

describe('Lista de tableros (integración)', () => {
  it('muestra estado de carga, luego los tableros con conteos', async () => {
    const { http } = setupIntegration(true);
    const harness = await RouterTestingHarness.create('/boards');
    expect(harness.routeNativeElement!.textContent).toContain('Cargando');
    http.expectOne('/api/v1/boards').flush([SUMMARY('b1', 'Alfa'), SUMMARY('b2', 'Beta')]);
    await settle(harness);
    expect($$(harness, '.card').length).toBe(2);
    expect(harness.routeNativeElement!.textContent).toContain('3 columnas · 1 tarjeta');
  });

  it('estado vacío', async () => {
    const { http } = setupIntegration(true);
    const harness = await RouterTestingHarness.create('/boards');
    http.expectOne('/api/v1/boards').flush([]);
    await settle(harness);
    expect(harness.routeNativeElement!.textContent).toContain('Aún no tienes tableros');
  });

  it('estado de error con reintento y toast', async () => {
    const { http } = setupIntegration(true);
    const harness = await RouterTestingHarness.create('/boards');
    http.expectOne('/api/v1/boards').flush({ detail: 'BD caída' }, { status: 503, statusText: 'x' });
    await settle(harness);
    expect($(harness, '[role="alert"]').textContent).toContain('BD caída');
    expect(TestBed.inject(ToastService).toasts()[0].message).toBe('BD caída');
    $$(harness, 'button').find((b) => b.textContent?.includes('Reintentar'))!.click();
    http.expectOne('/api/v1/boards').flush([SUMMARY('b1', 'Alfa')]);
    await settle(harness);
    expect($$(harness, '.card').length).toBe(1);
  });

  it('crea un tablero con nombre, descripción y color, y navega a él', async () => {
    const { http } = setupIntegration(true);
    const harness = await RouterTestingHarness.create('/boards');
    http.expectOne('/api/v1/boards').flush([]);
    await settle(harness);
    $$(harness, 'button').find((b) => b.textContent?.includes('Nuevo tablero'))!.click();
    await settle(harness);
    const name = $<HTMLInputElement>(harness, '#board-form input[type="text"]');
    name.value = 'Sprint 1';
    name.dispatchEvent(new Event('input'));
    $<HTMLTextAreaElement>(harness, '#board-form textarea').value = 'Meta';
    $<HTMLTextAreaElement>(harness, '#board-form textarea').dispatchEvent(new Event('input'));
    const radios = $$<HTMLInputElement>(harness, '#board-form input[type="radio"]');
    radios[2].click();
    $(harness, '#board-form').dispatchEvent(new Event('submit'));
    const req = http.expectOne('/api/v1/boards');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Sprint 1', description: 'Meta', color: '#7b4fb8' });
    req.flush({ ...makeBoard(), id: 'nuevo' }, { status: 201, statusText: 'Created' });
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/boards/nuevo');
    http.expectOne('/api/v1/boards/nuevo').flush(makeBoard());
  });

  it('exige nombre al crear', async () => {
    const { http } = setupIntegration(true);
    const harness = await RouterTestingHarness.create('/boards');
    http.expectOne('/api/v1/boards').flush([]);
    await settle(harness);
    $$(harness, 'button').find((b) => b.textContent?.includes('Crear tablero'))!.click();
    await settle(harness);
    $(harness, '#board-form').dispatchEvent(new Event('submit'));
    await settle(harness);
    expect($(harness, '#board-form').textContent).toContain('obligatorio');
  });

  it('borra con confirmación propia (modal), no confirm()', async () => {
    const { http } = setupIntegration(true);
    const confirmSpy = spyOn(window, 'confirm');
    const harness = await RouterTestingHarness.create('/boards');
    http.expectOne('/api/v1/boards').flush([SUMMARY('b1', 'Alfa'), SUMMARY('b2', 'Beta')]);
    await settle(harness);
    $<HTMLButtonElement>(harness, '[aria-label="Eliminar tablero Alfa"]').click();
    await settle(harness);
    expect($(harness, '[role="dialog"]').textContent).toContain('«Alfa»');
    // cancelar no borra
    $$(harness, '[role="dialog"] button').find((b) => b.textContent?.includes('Cancelar'))!.click();
    await settle(harness);
    expect($$(harness, '.card').length).toBe(2);
    $<HTMLButtonElement>(harness, '[aria-label="Eliminar tablero Alfa"]').click();
    await settle(harness);
    $$(harness, '[role="dialog"] button').find((b) => b.textContent?.includes('Eliminar'))!.click();
    http.expectOne('/api/v1/boards/b1').flush(null, { status: 204, statusText: 'No Content' });
    await settle(harness);
    expect($$(harness, '.card').length).toBe(1);
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
