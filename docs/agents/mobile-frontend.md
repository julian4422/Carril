# Brief: agente `frontend/` · móvil (v1.2)

Eres el agente del proyecto `frontend/` de "Carril" (Kanban; Angular 19). Esta iteración convierte el frontend en una **PWA instalable y usable con el dedo**. Trabajas en un **git worktree** propio (tu directorio actual), en una rama aparte. Solo editas `frontend/`. En paralelo, otro agente trabaja en `backend/`; la API **no cambia** para ti.

## Contexto (léelo primero)

- `CLAUDE.md` (raíz): comandos y arquitectura.
- `docs/CONTRACT.md`, sobre todo la sección **Móvil (v1.2)**: es la fuente de verdad.
- `frontend/docs/` (README, ARCHITECTURE, TESTING): explican el `BoardStore`, `board.logic.ts` y el drag & drop actual.
- `docs/agents/frontend.md`: el brief original, con sus restricciones vigentes.

## Restricciones (siguen vigentes)

- Angular 19 con Node 20.12.2. Usa los binarios locales o `npx -y @angular/cli@19`.
- PROHIBIDO Angular Material/CDK, PrimeNG, Tailwind, Bootstrap, Hammer.js o librerías de gestos y de UI. Sí está permitido `@angular/service-worker` (oficial de Angular).
- Signals, standalone, control flow nuevo, `inject()`. URLs relativas `/api/v1/...`.

## Tareas

1. **Arrastre con Pointer Events** para tarjetas y columnas, que funcione con ratón, dedo y lápiz:
   - Con el dedo, el arrastre empieza tras una pulsación larga (unos 250 ms) o un umbral de movimiento razonable, sin romper el scroll vertical de la columna ni el horizontal del tablero.
   - "Fantasma" que sigue al dedo, indicador de inserción y auto-scroll horizontal y vertical cerca de los bordes.
   - Reutiliza `dropIndex`/`moveTaskInColumns`/`reorderColumns` y la actualización optimista con reversión.
   - Puedes sustituir el HTML5 DnD o convivir con él, pero el comportamiento con ratón debe seguir igual. Se mantiene el teclado (Alt + flechas) y la región `aria-live`.
2. **PWA:**
   - `@angular/service-worker` (`ng add @angular/pwa@19`, luego revisa lo que genera). `ngsw-config.json` cachea app shell y estáticos; **ningún** `dataGroup` para `/api/`.
   - Manifest en español: `name` "Carril", `short_name`, `theme_color`/`background_color` coherentes con la paleta, `display: standalone`, `start_url`/`scope`.
   - Iconos propios 192/512 y una versión `maskable`, generados a partir de un SVG que diseñes tú. Añade `apple-touch-icon` y las meta de iOS.
   - Aviso de nueva versión con `SwUpdate` (toast con "Actualizar") y banner de "Sin conexión" (`online`/`offline`).
3. **Diseño móvil:**
   - `viewport-fit=cover` y `env(safe-area-inset-*)`; objetivos táctiles de 44 px o más.
   - En pantallas estrechas, columnas con `scroll-snap` horizontal.
   - El detalle de tarjeta se ve bien a pantalla completa.
   - Sin scroll horizontal de página a 390×844 (el tablero sí puede desplazarse dentro de su contenedor).
4. **Documentación:**
   - Crea `frontend/docs/MOBILE.md`: cómo instalar la PWA (Android/iOS), cómo funciona el arrastre táctil, la estrategia del service worker (qué se cachea y qué no, y por qué), cómo probar la PWA en local (build de producción servido estático en HTTPS o en localhost) y sus limitaciones.
   - Actualiza `README.md`, `ARCHITECTURE.md` (drag & drop) y `TESTING.md`.

## Pruebas (obligatorias)

- Unitarias: la lógica nueva de arrastre por punteros (umbral/pulsación larga, cálculo de destino, auto-scroll) separada en funciones puras o en un servicio testeable; `SwUpdate` y el aviso de conexión.
- Integración: arrastrar una tarjeta y una columna con `PointerEvent` de tipo `touch` despacha la llamada correcta (`/move`, `/columns/order`) y se revierte ante un 500. El arrastre con ratón sigue funcionando.
- E2E (Playwright, stack real sin mocks):
  - añade un proyecto móvil con emulación táctil (por ejemplo, `devices['Pixel 7']`) con un flujo que arrastra una tarjeta por eventos táctiles o de puntero, recarga y comprueba que persistió;
  - comprueba que el `manifest` se sirve y que no hay scroll horizontal de página;
  - el e2e de escritorio existente debe seguir en verde;
  - cada corrida borra los usuarios que crea, como ya se hace.
- Cobertura de líneas en `test:unit` ≥ 80 %.

## Entorno (importante: trabajas en un worktree)

- La API ya corre en Docker en `http://localhost:8000` (proyecto compose `carril`, levantado desde `/Users/julianechavarria/Documents/Claude_project`). **No** ejecutes `docker compose up/down/build`.
- Copia `/Users/julianechavarria/Documents/Claude_project/.env` a la raíz de tu worktree (está en `.gitignore`; no lo subas). Exporta `COMPOSE_PROJECT_NAME=carril` al correr los e2e, para que su limpieza con `docker compose exec -T db psql` encuentre el contenedor.
- `npm install` en `frontend/` de tu worktree. El puerto 4200 es tuyo.

## Verificación antes de terminar

- `npx ng build` sin errores y `dist/` contiene `ngsw.json` y `manifest.webmanifest`.
- `npm run test:unit` (con cobertura) y `npm run test:integration` en verde.
- `npm run test:e2e` en verde: escritorio y móvil.

## Al terminar

- Haz commit en tu rama, sin push. El mensaje termina con:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CWDUhxbiLE153XuypNZym7
  ```
- Responde con: cambios hechos, resultados de cada suite (número de pruebas y cobertura), qué verificaste en e2e, nombre de la rama, y desviaciones o dudas sobre el contrato.
