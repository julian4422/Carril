# Estrategia de pruebas

Tres capas. Unitarias e integración usan Jasmine + Karma con ChromeHeadless; e2e usa Playwright (Chromium: escritorio y móvil emulado).

## 1. Unitarias (`*.spec.ts`)

Cubren la lógica aislada: `board.logic` (reordenar, mover entre columnas, índice de soltado, filtros), `BoardStore` (movimientos optimistas y reversión con `HttpTestingController`), servicios HTTP, `AuthService`, `TokenStorage`, interceptores, guards, pipes, utilidades de fecha/errores y componentes de UI aislados (botón, chip, modal, confirm, input, toast, header, tarjeta).

Arrastre y PWA: `pointer-drag.logic.spec.ts` (umbral, pulsación larga, cancelación por scroll, destino de soltado, columna más cercana, velocidad de auto-scroll), `pointer-drag.spec.ts` (`PointerDragSession` con `PointerEvent` sintéticos, `jasmine.clock()` para la pulsación larga y un programador de cuadros falso para el auto-scroll: fantasma, `touchmove` cancelado, menú contextual, `Esc`, `pointercancel`, supresión del click) y `core/pwa/pwa.spec.ts` (`AppUpdateService` con un `SwUpdate` falso: `VERSION_READY`, activar y recargar, irrecuperable, búsqueda periódica; `ConnectivityService`; `AppStatusComponent` con el banner y el aviso).

```bash
npm run test:unit
```

Corre una vez, headless, con cobertura (`coverage/`) y excluye `*.integration.spec.ts`. `karma.conf.js` falla si las líneas bajan del 80 % (variable `KARMA_COVERAGE_CHECK`, activada por el script). La cobertura del script cuenta los archivos importados por esas pruebas (lógica, store, servicios, UI); las páginas se cubren en integración.

## 2. Integración (`*.integration.spec.ts`)

Componentes de feature reales + servicios reales + router (`RouterTestingHarness`) + `HttpTestingController` (solo la red está simulada), con los interceptores reales. Ver `src/app/integration-helpers.ts`. Casos: login completo que navega a `/boards`, errores de login/registro, guard que redirige a `/login`, 401 que cierra sesión, lista de tableros (carga, vacío, error, crear, borrar con modal), carga del tablero, arrastre de tarjetas y columnas con `PointerEvent` de tipo `touch` (pulsación larga), `mouse` y `pen`: la llamada a `/move` y `/columns/order` lleva el cuerpo correcto y se revierte ante un 500; también fantasma e indicadores, cancelación si el dedo se mueve antes de tiempo (scroll), `Esc` y supresión del click al soltar, movimiento por teclado, filtros, alta rápida de tarjetas, ajustes de columna y detalle de tarjeta (editar, asignar, etiquetas, comentarios, borrar).

```bash
npm run test:integration
```

Para ver la cobertura combinada: `npx ng test --watch=false --browsers=ChromeHeadless --code-coverage`.

## 3. End to end (`e2e/`)

Playwright contra el stack REAL, sin mocks: `ng serve` (lo levanta `playwright.config.ts` con `reuseExistingServer`) y la API en `:8000`. El formulario de tarjeta rápida queda abierto tras crear una tarjeta (para encadenar varias), así que el test lo abre una sola vez. Cada corrida registra un usuario único (`e2e+<timestamp>@carril-e2e.dev`) y un `afterAll` lo borra al terminar (primero sus tableros y luego el usuario, con `docker compose exec -T db psql` desde la raíz del repo; requiere Docker). Hay dos proyectos:

- `chromium` (`kanban.spec.ts`, escritorio con ratón): registra, crea un tablero, verifica las 3 columnas por defecto, crea tarjetas, arrastra una a "En curso" con el ratón (`dragTo`, que genera Pointer Events), recarga y comprueba la persistencia, edita el detalle, agrega etiqueta y comentario, y borra el tablero.
- `mobile` (`mobile.spec.ts`, `devices['Pixel 7']` a 390×844, táctil): comprueba que el manifest se sirve y está enlazado (nombre, `display`, iconos 192/512/maskable descargables, `viewport-fit=cover`, `apple-touch-icon`); registra y crea un tablero; verifica objetivos de 44 px y que **no hay scroll horizontal de página** en lista, tablero y detalle; arrastra una tarjeta con **toques reales** (CDP `Input.dispatchTouchEvent`: pulsación larga, deslizar al borde para que el auto-scroll traiga "En curso", soltar), recarga y comprueba que persistió; abre el detalle con un toque y verifica que ocupa la pantalla con el pie visible.

Los helpers comunes (usuario único, registro, borrado y medida del desbordamiento) están en `e2e/support.ts`. Desde un **git worktree**, exporta `COMPOSE_PROJECT_NAME=carril` para que `docker compose exec` encuentre el contenedor `db` del stack que ya corre.

```bash
docker compose up -d            # raíz del repo: db + api
curl -s localhost:8000/api/v1/health
npx playwright install chromium # una vez
npm run test:e2e                # escritorio + móvil
npx playwright test --project mobile   # solo móvil
npx playwright test --list      # solo listar
```
