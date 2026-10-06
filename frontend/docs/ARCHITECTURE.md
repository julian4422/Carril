# Arquitectura del frontend

## Estructura

```
src/app/
├── core/
│   ├── models/api.models.ts      tipos TS del contrato (docs/CONTRACT.md)
│   ├── services/                 auth, token-storage y un servicio HTTP por recurso
│   │                             (boards, columns, tasks, labels, comments)
│   ├── interceptors/             auth (Bearer) y error (401 / toasts)
│   ├── guards/auth.guard.ts      authGuard y guestGuard
│   ├── pwa/                      AppUpdateService (SwUpdate) y ConnectivityService (online/offline)
│   ├── http-error.ts             extrae `detail` de errores de la API
│   └── date.utils.ts             fechas YYYY-MM-DD en hora local
├── features/
│   ├── auth/                     login y registro
│   ├── boards/                   lista de tableros (crear/borrar)
│   └── board/                    página del tablero, BoardStore, board.logic,
│                                 pointer-drag(.logic), tarjeta y detalle de tarjeta
├── shared/
│   ├── ui/                       button, modal, confirm-dialog, input (CVA), chip,
│   │                             toast (servicio + contenedor), app-header,
│   │                             app-status (sin conexión / versión nueva)
│   └── pipes/                    dueStatus, shortDate, initials
├── app.config.ts · app.routes.ts · app.component.ts
```

Las rutas se cargan de forma perezosa (`loadComponent`). `/boards` y `/boards/:id` llevan `authGuard`; `/login` y `/registro` llevan `guestGuard`.

## Flujo de datos

Componente → (store o servicio) → `HttpClient` → interceptores → API. Los servicios devuelven `Observable`. Las páginas simples (login, lista de tableros) usan signals locales. El tablero usa `BoardStore`, provisto a nivel de `BoardPageComponent` (una instancia por tablero abierto) y compartido con el detalle de tarjeta vía inyección.

## BoardStore y `board.logic.ts`

`BoardStore` guarda `board`, `loading`, `error` y los filtros (`filterText`, `filterPriority`) como signals; `view` es un `computed` que aplica filtros y marca `overWip` cuando `tasks.length > wip_limit`. Sus mutadores son `async` y devuelven el resultado o `null`/`false` si falla (el toast ya lo muestra el interceptor).

La lógica pura vive en `board.logic.ts` (sin Angular, fácil de probar): `dropIndex`, `reorderColumns`, `moveTaskInColumns`, `replaceTask`, `matchesFilter`, `withPositions`.

**Actualización optimista**: `moveTask` y `moveColumn` guardan una copia previa, aplican el movimiento al instante, llaman a `POST /tasks/{id}/move` o `PUT /boards/{id}/columns/order`, y si la API falla restauran el estado anterior. Si el movimiento no cambia nada, no se llama a la API. Las posiciones son base 0 y contiguas; `position` enviada es el índice final en la columna destino.

## Arrastre (Pointer Events)

Un solo mecanismo para ratón, dedo y lápiz; sustituye al drag & drop de HTML5 (detalle táctil en [MOBILE.md](MOBILE.md)).

- `pointer-drag.logic.ts` (puro): `gestureOnMove`/`gestureOnLongPress` deciden si el gesto es arrastre, sigue pendiente o es un scroll (ratón: 5 px; dedo/lápiz: pulsación larga de 250 ms con 10 px de margen; asa ⠿: umbral). `dropTarget` da "antes/después" de un elemento por su mitad, `pickColumn` da la columna bajo la `x` (o la más cercana) y `autoScrollSpeed` da la velocidad cerca de los bordes.
- `PointerDragSession` (`pointer-drag.ts`): un gesto completo. Escucha `pointermove/up/cancel` en `window`, crea el fantasma `.drag-ghost`, cancela `touchmove` (listener no pasivo) solo mientras arrastra, hace auto-scroll por `requestAnimationFrame` sobre los contenedores que le pasa la página, cancela con `Esc`/`pointercancel` y suprime el `click` posterior al soltar.
- `BoardPageComponent`: `pointerdown` en `.item` (tarjeta) o en `.col-head` (columna; el botón ⋯ no arrastra). Los callbacks `move` recalculan `taskHint`/`columnHint` con los rectángulos del DOM (excluyendo el elemento arrastrado); `drop` calcula el índice final con `dropIndex` sobre la lista completa de la columna (correcto aunque haya filtros) y llama a `store.moveTask`/`store.moveColumn`. Soltar en el área libre de una lista agrega al final.
- Estado en signals de la página (`drag`, `taskHint`, `columnHint`); mientras hay arrastre `.columns` lleva `is-dragging` (sin scroll-snap).
- Accesibilidad: cada tarjeta es `role="button"` con `aria-roledescription` y `aria-describedby` a una ayuda oculta; alternativa de teclado `Alt + flechas` para mover tarjetas (arriba/abajo reordena, izquierda/derecha cambia de columna) y `Alt + ←/→` en el asa de columna; una región `aria-live` anuncia cada movimiento y su reversión.

## Autenticación y errores

- `AuthService` guarda el JWT, el usuario y su expiración en `localStorage` (`TokenStorage`) y los expone como signals (`isAuthenticated`).
- `authInterceptor` agrega `Authorization: Bearer` a las URLs `/api/`.
- `errorInterceptor`: un 401 (salvo en login/registro) cierra sesión, redirige a `/login` y avisa; el resto de errores se muestran en un toast con el `detail` de la API (también el formato de lista de FastAPI 422). Login y registro muestran su error dentro del formulario. Cada vista tiene estados de carga, vacío y error con reintento.

## Diseño

Variables CSS en `src/styles.scss` (claro/oscuro con `prefers-color-scheme`). La prioridad se codifica con color y forma (▽ ○ △ ◆) más texto; las fechas vencidas se resaltan con color, icono y la palabra "Vencida". En móvil: áreas seguras (`viewport-fit=cover`), objetivos táctiles de 44 px, columnas con scroll-snap y detalle a pantalla completa (ver [MOBILE.md](MOBILE.md)). Foco visible global, labels en todos los campos, modales con `role="dialog"`, foco atrapado y restaurado, y `prefers-reduced-motion`.

## PWA

`provideServiceWorker('ngsw-worker.js')` solo en producción; `ngsw-config.json` cachea el app shell y los estáticos y **nunca** `/api/` (sin `dataGroups`; `navigationUrls` excluye `/api/**`). `AppStatusComponent` (en `AppComponent`) muestra el banner "Sin conexión" (`ConnectivityService`) y el aviso de versión nueva con "Actualizar" (`AppUpdateService`, `SwUpdate`). Ver [MOBILE.md](MOBILE.md).
