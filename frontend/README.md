# Carril · frontend

La app de Carril: cliente Angular 19 del gestor Kanban, instalable en el celular como PWA.

<p>
  <img src="../docs/screenshots/board-mobile.png" width="200" alt="Tablero en el celular">
  <img src="../docs/screenshots/task-mobile.png" width="200" alt="Detalle de tarjeta">
</p>

- Angular "puro": componentes standalone, signals, control flow nuevo e `inject()`. Sin Angular Material/CDK, PrimeNG, Tailwind, Bootstrap ni librerías de gestos.
- Arrastre propio con Pointer Events: ratón, dedo (pulsación larga) y lápiz, con auto-scroll y actualización optimista. Alternativa por teclado: Alt + flechas.
- PWA con `@angular/service-worker`: cachea el app shell y los estáticos, **nunca** las respuestas de `/api/`. Avisos de nueva versión y de "sin conexión".
- Modo claro y oscuro, diseño táctil (objetivos de 44 px o más, áreas seguras).

## Desarrollo

Requisitos: Node 20.12+, Chrome (para Karma) y la API en `http://localhost:8000` (`docker compose up -d` en la raíz).

```bash
npm install
npm start                  # http://localhost:4200; proxy /api -> http://localhost:8000
npm run build              # build de producción en dist/ (incluye manifest y service worker)
```

El service worker solo se activa en el build de producción. Para probar la PWA en el celular, mira [`../docs/PREVIEW.md`](../docs/PREVIEW.md).

## Pruebas

```bash
npm run test:unit          # Karma headless con cobertura (umbral de líneas 80 %)
npm run test:integration   # *.integration.spec.ts: páginas reales, solo la red simulada
npm run test:e2e           # Playwright contra el stack real, en escritorio y en un Pixel 7 emulado
```

## Documentación

[docs/README](docs/README.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) (rutas, store, arrastre, auth, cómo añadir una pantalla) · [TESTING](docs/TESTING.md) · [MOBILE](docs/MOBILE.md) (PWA, arrastre táctil, service worker)
