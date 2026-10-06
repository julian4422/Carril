import { CDPSession, Locator, Page, expect, test } from '@playwright/test';
import { deleteUser, horizontalOverflow, registerViaUi, uniqueEmail } from './support';

/**
 * Proyecto "mobile" (Pixel 7 a 390×844, táctil). Corre contra el stack real, sin mocks.
 * El arrastre se hace con toques reales del navegador (CDP Input.dispatchTouchEvent),
 * que Chromium convierte en Pointer Events de tipo "touch", igual que en un teléfono.
 */
const email = uniqueEmail('movil');
test.afterAll(() => deleteUser(email));

class Finger {
  private constructor(private readonly cdp: CDPSession) {}
  static async on(page: Page): Promise<Finger> {
    return new Finger(await page.context().newCDPSession(page));
  }
  down(x: number, y: number) {
    return this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  }
  move(x: number, y: number) {
    return this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
  }
  up() {
    return this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  /** Desliza en `steps` movimientos intermedios. */
  async slide(from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
    for (let i = 1; i <= steps; i++) {
      await this.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    }
  }
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('elemento sin caja');
  return b;
}

test('la PWA expone manifest, iconos y metadatos móviles', async ({ page, request }) => {
  await page.goto('/login');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('manifest.webmanifest');
  const res = await request.get(`/${href}`);
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest).toEqual(expect.objectContaining({ name: 'Carril', short_name: 'Carril', display: 'standalone', lang: 'es', start_url: '/boards', scope: '/' }));
  const purposes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  expect(purposes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  for (const icon of manifest.icons) {
    const r = await request.get(`/${icon.src}`);
    expect(r.ok(), icon.src).toBeTruthy();
  }
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');
  expect((await request.get('/icons/apple-touch-icon.png')).ok()).toBeTruthy();
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('flujo táctil: tablero sin scroll horizontal de página, arrastre con el dedo y persistencia', async ({ page }) => {
  const boardName = `Móvil ${Date.now()}`;
  await registerViaUi(page, email, 'Persona Móvil');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Nuevo tablero' }).first().tap();
  await page.getByRole('dialog').getByLabel('Nombre').fill(boardName);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear tablero' }).tap();
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]+$/);
  await expect(page.locator('.column')).toHaveCount(3);

  const column = (name: string) => page.locator('.column', { has: page.getByRole('heading', { name }) });
  const todo = column('Por hacer');
  const doing = column('En curso');

  // objetivos táctiles de 44 px o más
  for (const target of [todo.locator('.grip'), todo.locator('.menu'), todo.locator('.add-card')]) {
    expect((await box(target)).height).toBeGreaterThanOrEqual(44);
  }

  await todo.getByRole('button', { name: /Añadir tarjeta/ }).tap();
  for (const title of ['Tarjeta táctil', 'Se queda']) {
    await todo.locator('.quick textarea').fill(title);
    await todo.locator('.quick textarea').press('Enter');
    await expect(todo.locator('app-task-card', { hasText: title })).toBeVisible();
  }
  await todo.getByRole('button', { name: 'Cerrar' }).tap();

  // el tablero se desplaza dentro de su contenedor, la página no
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const scroller = await page.locator('.columns').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(scroller.sw).toBeGreaterThan(scroller.cw);
  const viewport = page.viewportSize()!;
  expect((await box(doing)).x).toBeGreaterThanOrEqual(viewport.width * 0.7); // "En curso" empieza fuera de pantalla

  // --- arrastre con el dedo: pulsación larga, llevarlo al borde (auto-scroll) y soltar en "En curso" ---
  const finger = await Finger.on(page);
  const card = await box(todo.locator('.item', { hasText: 'Tarjeta táctil' }));
  const start = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
  await finger.down(start.x, start.y);
  await page.waitForTimeout(450); // pulsación larga (250 ms) con margen
  const edge = { x: viewport.width - 6, y: start.y + 40 };
  await finger.slide(start, edge);
  await expect(page.locator('.drag-ghost')).toHaveCount(1);
  // el auto-scroll horizontal trae "En curso" a la vista
  await expect.poll(async () => (await box(doing)).x, { timeout: 5000, intervals: [20] }).toBeLessThan(250);
  const doingBox = await box(doing);
  const target = { x: Math.min(Math.max(doingBox.x + 60, 90), 300), y: edge.y };
  await finger.slide(edge, target, 4);
  await expect(doing.locator('.list')).toHaveClass(/drop-end/);
  await finger.up();
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await expect(doing.locator('app-task-card', { hasText: 'Tarjeta táctil' })).toBeVisible();
  await expect(todo.locator('app-task-card')).toHaveCount(1);
  // soltar no abre el detalle
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // --- recargar: persistió ---
  await page.reload();
  await expect(column('En curso').locator('app-task-card', { hasText: 'Tarjeta táctil' })).toHaveCount(1);
  await expect(column('Por hacer').locator('app-task-card')).toHaveCount(1);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // --- un toque abre el detalle a pantalla completa ---
  await column('Por hacer').locator('app-task-card', { hasText: 'Se queda' }).tap();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const d = await box(dialog);
  expect(d.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(d.height).toBeGreaterThanOrEqual(viewport.height - 1);
  // el cuerpo se desplaza y el pie con las acciones queda siempre a la vista
  await expect(dialog.getByRole('button', { name: 'Guardar cambios' })).toBeInViewport({ ratio: 1 });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await dialog.getByRole('button', { name: 'Cerrar' }).first().tap();
  await expect(dialog).toHaveCount(0);
});

