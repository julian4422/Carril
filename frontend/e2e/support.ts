import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { Page, expect } from '@playwright/test';

/** Raíz del repo (donde está docker-compose.yml). */
const ROOT = path.resolve(__dirname, '..', '..');

/** Correo único por corrida y por archivo, para poder borrarlo al terminar. */
export function uniqueEmail(tag: string): string {
  return `e2e+${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@carril-e2e.dev`;
}

/**
 * Ejecuta SQL en la BD principal vía el contenedor db. Si trabajas desde un worktree,
 * exporta COMPOSE_PROJECT_NAME=carril para que `docker compose` encuentre el contenedor.
 */
function psql(sql: string): string {
  return execFileSync(
    'docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'carril', '-d', 'carril', '-tA', '-c', sql],
    { cwd: ROOT, encoding: 'utf8' },
  ).trim();
}

/** Borra los tableros del usuario (CASCADE a columnas, tarjetas, etiquetas y comentarios) y luego el usuario. */
export function deleteUser(email: string): void {
  const owner = `(SELECT id FROM users WHERE email = '${email}')`;
  psql(`DELETE FROM boards WHERE owner_id = ${owner}`);
  psql(`DELETE FROM users WHERE email = '${email}'`);
}

/** Registro por la interfaz; termina en /boards. */
export async function registerViaUi(page: Page, email: string, name = 'Usuario E2E'): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link', { name: 'Regístrate' }).click();
  await page.getByLabel('Nombre completo').fill(name);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill('clave-segura-123');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/boards$/);
}

/** Ancho que sobra de la página: > 0 significa que hay scroll horizontal. */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
