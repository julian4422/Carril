# Brief: agente `frontend/`

Eres el agente de codificación del proyecto `frontend/` de "Carril", un gestor de tareas Kanban. Raíz del repo: /Users/julianechavarria/Documents/Claude_project. Trabajas SOLO dentro de `frontend/` (no edites docker-compose.yml, docs/, backend/ ni database/). Otro agente puede estar construyendo el backend en paralelo; puede que todavía NO haya API corriendo.

Lee primero `docs/CONTRACT.md` (contrato exacto de la API, fuente de verdad) y `docs/arquitectura.html` (arquitectura aprobada).

## Restricciones

- Angular 19 (la máquina tiene Node 20.12.2; Angular 20 no es compatible). No hay CLI global: usa `npx -y @angular/cli@19 ...` o los binarios locales de `node_modules`.
- "Angular puro": PROHIBIDO Angular Material, CDK, PrimeNG, Tailwind, Bootstrap o cualquier librería de UI/estado. Componentes standalone, signals, nuevo control flow (`@if`, `@for`), `inject()`, HttpClient con interceptores funcionales, guards funcionales, Reactive Forms. Drag & drop con la API nativa de HTML5 (dragstart/dragover/drop), incluyendo reordenar dentro de una columna y mover entre columnas, con actualización optimista y reversión si la API falla.
- Ejecución local fuera de Docker con `ng serve` en :4200 y `proxy.conf.json` que mande `/api` a `http://localhost:8000` (configúralo en angular.json para `serve`). Las URLs de la API son relativas (`/api/v1/...`).

## Funcionalidad

- Registro e inicio de sesión (token JWT en localStorage, interceptor que agrega `Authorization`, al recibir 401 cierra sesión y manda a /login). Guard en rutas privadas.
- `/boards`: lista de tableros (BoardSummary) con conteos, crear tablero (nombre, descripción, color), borrar con confirmación propia (modal, no `confirm()`).
- `/boards/:id`: tablero con columnas horizontales y tarjetas; agregar/renombrar/borrar columnas, reordenar columnas arrastrando, límite WIP visible (la columna se marca cuando lo supera); crear tarjeta rápida al final de una columna; arrastrar tarjetas; filtro por texto y por prioridad.
- Panel/modal de detalle de tarjeta: editar título, descripción, prioridad, fecha límite, asignarme/quitarme, etiquetas (crear etiqueta del tablero y marcar/desmarcar), comentarios (listar y agregar), borrar tarjeta.
- Estados de carga, vacío y error en cada vista; toasts para errores de la API (mensaje de `detail`).
- Diseño: libertad total, pero cuidado y propio. Interfaz en español. Paleta definida con variables CSS, modo claro y oscuro según `prefers-color-scheme`, prioridad codificada con color y forma (chip), tarjetas con fecha vencida resaltada, accesible (foco visible, labels, aria en drag & drop, navegación por teclado razonable), responsive.

## Arquitectura de carpetas

`src/app/core/` (auth service, token storage, interceptores, guard, modelos TS del contrato, servicios por recurso), `src/app/features/auth/`, `features/boards/`, `features/board/` (estado del tablero en un store basado en signals), `src/app/shared/ui/` (botón, modal, input, toast, chip).

## Pruebas (obligatorias)

- Unitarias (`*.spec.ts`, Jasmine + Karma con ChromeHeadless; Chrome está instalado en /Applications): servicios, store del tablero (lógica de reordenamiento y mover entre columnas, reversión optimista), guard, interceptores, pipes, componentes de UI aislados. Script `npm run test:unit` headless una sola vez con cobertura (`--watch=false --browsers=ChromeHeadless --code-coverage`). Meta: cobertura de líneas ≥ 80%.
- Integración (`*.integration.spec.ts`, misma herramienta): componentes de feature + servicios reales + `HttpTestingController` + router (login completo que navega a /boards, carga de tablero y movimiento de tarjeta que dispara la llamada correcta, guard redirigiendo). Script `npm run test:integration` que corra solo esos archivos; `test:unit` debe excluirlos.
- End to end con Playwright en `frontend/e2e/` (`@playwright/test`, solo chromium, `npx playwright install chromium`). Deben correr contra el stack REAL (ng serve + API en :8000), sin mocks: registrar usuario único por corrida, crear tablero, ver 3 columnas por defecto, crear tarjetas, arrastrar una tarjeta a "En curso", recargar y verificar que persistió, editar detalle, agregar etiqueta y comentario, borrar tablero. `playwright.config.ts` con `webServer` que levante `ng serve` (reuseExistingServer) y `baseURL` http://localhost:4200. Script `npm run test:e2e`. Si la API no está arriba en :8000 (compruébalo con `curl -s localhost:8000/api/v1/health`), NO los ejecutes: verifica que se listan con `npx playwright test --list`. El orquestador los ejecutará cuando el backend esté listo.

## Documentación en `frontend/docs/`

`README.md` (requisitos, instalar, `npm start`, scripts de prueba), `ARCHITECTURE.md` (estructura, flujo de datos, store, drag & drop, manejo de auth/errores), `TESTING.md` (estrategia de las tres capas y cómo correrlas). Reemplaza el README generado por el CLI por uno corto que apunte a docs/.

## Verificación obligatoria antes de terminar

- `npx ng build` sin errores.
- `npm run test:unit` y `npm run test:integration` pasan todos; reporta la cobertura.
- `npx playwright test --list` lista las pruebas e2e.

Responde al final con: estructura creada, resultados de las suites (número de pruebas y cobertura), cómo correr e2e, y cualquier duda o desviación sobre el contrato.
