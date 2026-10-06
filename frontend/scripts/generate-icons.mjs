// Genera los PNG de la PWA a partir de los SVG propios, rasterizándolos con el Chromium de Playwright.
//   npm run icons
// Fuentes: public/icons/icon.svg (icono normal) y scripts/icons/icon-maskable.svg (maskable, a sangre).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'icons');
const svgs = {
  any: readFileSync(join(root, 'public', 'icons', 'icon.svg'), 'utf8'),
  maskable: readFileSync(join(root, 'scripts', 'icons', 'icon-maskable.svg'), 'utf8'),
};

const targets = [
  { svg: 'any', size: 192, file: join(out, 'icon-192.png') },
  { svg: 'any', size: 512, file: join(out, 'icon-512.png') },
  { svg: 'maskable', size: 192, file: join(out, 'icon-maskable-192.png') },
  { svg: 'maskable', size: 512, file: join(out, 'icon-maskable-512.png') },
  // iOS recorta las esquinas por su cuenta: usa la versión a sangre.
  { svg: 'maskable', size: 180, file: join(out, 'apple-touch-icon.png') },
  { svg: 'any', size: 32, file: null }, // favicon.ico
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgs[t.svg]).toString('base64')}`;
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="${dataUrl}" width="${t.size}" height="${t.size}" style="display:block"></body></html>`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  if (t.file) {
    writeFileSync(t.file, png);
  } else {
    writeFileSync(join(root, 'public', 'favicon.ico'), icoFromPng(png, t.size));
  }
  console.log(`✓ ${t.file ?? 'public/favicon.ico'} (${t.size}px)`);
}
await browser.close();

/** ICO con una sola imagen PNG embebida (formato admitido por todos los navegadores actuales). */
function icoFromPng(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: icono
  header.writeUInt16LE(1, 4); // una imagen
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // paleta
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4); // planos
  entry.writeUInt16LE(32, 6); // bits por píxel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // desplazamiento
  return Buffer.concat([header, entry, png]);
}
