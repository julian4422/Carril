import { expect, test } from '@playwright/test';
import { deleteUser, registerViaUi, uniqueEmail } from './support';

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const email = uniqueEmail('');

// Limpieza: borra el usuario creado y sus tableros.
test.afterAll(() => deleteUser(email));

/** Flujo completo contra la API real. Usuario único por corrida. */
test('registro, tablero, tarjetas, drag & drop, detalle y borrado', async ({ page }) => {
  const boardName = `Tablero E2E ${stamp}`;

  // --- registro ---
  await registerViaUi(page, email);
  await expect(page.getByRole('heading', { name: 'Aún no tienes tableros' })).toBeVisible();

  // --- crear tablero: 3 columnas por defecto ---
  await page.getByRole('button', { name: 'Nuevo tablero' }).first().click();
  await page.getByRole('dialog').getByLabel('Nombre').fill(boardName);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear tablero' }).click();
  await expect(page).toHaveURL(/\/boards\/[0-9a-f-]+$/);
  await expect(page.locator('.column')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Por hacer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'En curso' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hecho' })).toBeVisible();

  // --- crear tarjetas ---
  const todo = page.locator('.column', { has: page.getByRole('heading', { name: 'Por hacer' }) });
  const doing = page.locator('.column', { has: page.getByRole('heading', { name: 'En curso' }) });
  await todo.getByRole('button', { name: /Añadir tarjeta/ }).click();
  // el formulario rápido queda abierto tras crear, para encadenar tarjetas
  for (const title of ['Escribir pruebas', 'Preparar demo']) {
    await todo.locator('.quick textarea').fill(title);
    await todo.locator('.quick textarea').press('Enter');
    await expect(todo.locator('app-task-card', { hasText: title })).toBeVisible();
  }
  await expect(todo.locator('app-task-card')).toHaveCount(2);

  // --- arrastrar una tarjeta a "En curso" con el ratón (Pointer Events) ---
  const card = todo.locator('.item', { hasText: 'Escribir pruebas' });
  await card.dragTo(doing.locator('.list'));
  await expect(doing.locator('app-task-card', { hasText: 'Escribir pruebas' })).toBeVisible();
  await expect(todo.locator('app-task-card')).toHaveCount(1);

  // --- recargar: persistió ---
  await page.reload();
  const doingAfter = page.locator('.column', { has: page.getByRole('heading', { name: 'En curso' }) });
  await expect(doingAfter.locator('app-task-card', { hasText: 'Escribir pruebas' })).toBeVisible();
  await expect(page.locator('.column', { has: page.getByRole('heading', { name: 'Por hacer' }) }).locator('app-task-card')).toHaveCount(1);

  // --- detalle: editar, etiqueta y comentario ---
  await doingAfter.locator('app-task-card', { hasText: 'Escribir pruebas' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título').fill('Escribir pruebas e2e');
  await dialog.getByLabel('Prioridad').selectOption('high');
  await dialog.getByRole('button', { name: 'Asignarme' }).click();
  await expect(dialog.getByText('Asignada a ti')).toBeVisible();
  await dialog.getByLabel('Nombre de la etiqueta nueva').fill('Urgente QA');
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(dialog.locator('.labels')).toContainText('Urgente QA');
  await dialog.getByLabel('Nuevo comentario').fill('Primer comentario e2e');
  await dialog.getByRole('button', { name: 'Comentar' }).click();
  await expect(dialog.locator('.comments')).toContainText('Primer comentario e2e');
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog).toHaveCount(0);
  const edited = page.locator('app-task-card', { hasText: 'Escribir pruebas e2e' });
  await expect(edited).toContainText('Alta');
  await expect(edited).toContainText('Urgente QA');

  // --- volver y borrar el tablero con modal propio ---
  await page.getByRole('link', { name: '← Tableros' }).click();
  await expect(page).toHaveURL(/\/boards$/);
  const boardCard = page.locator('li.card', { hasText: boardName });
  await expect(boardCard).toContainText('3 columnas · 2 tarjetas');
  await boardCard.getByRole('button', { name: /Eliminar tablero/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.locator('li.card', { hasText: boardName })).toHaveCount(0);
});
