# Arquitectura del frontend

## Estructura

```
src/app/
├── core/
│   ├── models/api.models.ts      tipos TS del contrato (docs/CONTRACT.md)
│   ├── services/                 auth, token-storage y un servicio HTTP por recurso
│   │                             (boards, columns, tasks, labels, comments)
│   ├── interceptors/             auth (Bearer) y error (401 / toasts)
│   ├── guards/auth.guard.ts      authGuard (→ /login) y guestGuard (→ /boards)
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
│   └── pipes/                    dueStatus, shortDate, initials, plural
├── app.config.ts · app.routes.ts · app.component.ts
└── testing.ts · integration-helpers.ts   fábricas de datos y arranque de las pruebas de integración
```

Las rutas (`app.routes.ts`) se cargan de forma perezosa (`loadComponent`) y cada una lleva `title`:

| Ruta | Guard | Componente |
|---|---|---|
| `''` | redirige a `boards` | |
| `/login`, `/registro` | `guestGuard` | `LoginComponent`, `RegisterComponent` |
| `/boards` | `authGuard` | `BoardsPageComponent` |
| `/boards/:id` | `authGuard` | `BoardPageComponent` |
| `**` | redirige a `boards` | |

## Flujo de datos

Componente → (store o servicio) → `HttpClient` → interceptores → API. Los servicios devuelven `Observable`. Las páginas simples (login, lista de tableros) usan signals locales. El tablero usa `BoardStore`, provisto a nivel de `BoardPageComponent` (una instancia por tablero abierto) y compartido con el detalle de tarjeta vía inyección.

## BoardStore y `board.logic.ts`

`BoardStore` guarda `board`, `loading`, `error` y los filtros (`filterText`, `filterPriority`) como signals; `columns`, `labels` y `filtering` son `computed`, y `view`, también un `computed`, que aplica filtros y marca `overWip` cuando `tasks.length > wip_limit`. Sus métodos (`load`, `addColumn`, `updateColumn`, `deleteColumn`, `moveColumn`, `createTask`, `updateTask`, `setTaskLabels`, `deleteTask`, `moveTask`, `createLabel`, `adjustCommentCount`) son `async` y devuelven el resultado o `null`/`false` si falla (el toast ya lo muestra el interceptor).

La lógica pura vive en `board.logic.ts` (sin Angular, fácil de probar): `dropIndex`, `reorderColumns`, `moveTaskInColumns`, `replaceTask`, `matchesFilter`, `withPositions`.

**Actualización optimista**: `moveTask` y `moveColumn` guardan una copia previa, aplican el movimiento al instante, llaman a `POST /tasks/{id}/move` o `PUT /boards/{id}/columns/order`, y si la API falla restauran el estado anterior. Si el movimiento no cambia nada, no se llama a la API. Las posiciones son base 0 y contiguas; `position` enviada es el índice final en la columna destino.

## Arrastre (Pointer Events)

Un solo mecanismo para ratón, dedo y lápiz; sustituye al drag & drop de HTML5 (detalle táctil en [MOBILE.md](MOBILE.md)).

- `pointer-drag.logic.ts` (puro): `needsLongPress`, `gestureOnMove` y `gestureOnLongPress` deciden si el gesto es arrastre (`drag`), sigue `pending` o se `cancel`a porque es un scroll. Constantes: `DRAG_THRESHOLD_PX` = 5 (ratón y asa ⠿), `LONG_PRESS_MS` = 250 y `TOUCH_SLOP_PX` = 10 (dedo/lápiz), `AUTOSCROLL_EDGE_PX` = 56 y `AUTOSCROLL_MAX_SPEED` = 18 px por cuadro. `dropTarget` da "antes/después" de un elemento por su mitad, `pickColumn` da la columna bajo la `x` (o la más cercana) y `autoScrollSpeed` da la velocidad (negativa/positiva según el borde) en la franja de 56 px junto a los bordes.
- `PointerDragSession` (`pointer-drag.ts`): un gesto completo. Escucha `pointermove/up/cancel` en `window`, crea el fantasma `.drag-ghost`, cancela `touchmove` (listener no pasivo) solo mientras arrastra, bloquea `contextmenu` (si no es ratón) y `selectstart` durante el gesto, vibra 8 ms al empezar con dedo/lápiz, hace auto-scroll por `requestAnimationFrame` sobre los contenedores que le pasa la página, cancela con `Esc`/`pointercancel` y suprime el `click` posterior al soltar.
- `BoardPageComponent`: `pointerdown` en `.item` (tarjeta) o en `.col-head` (columna; el botón ⋯ no arrastra). Los callbacks `move` recalculan `taskHint`/`columnHint` con los rectángulos del DOM (excluyendo el elemento arrastrado); `drop` calcula el índice final con `dropIndex` sobre la lista completa de la columna (correcto aunque haya filtros) y llama a `store.moveTask`/`store.moveColumn`. Soltar en el área libre de una lista agrega al final.
- Estado en signals de la página (`drag`, `taskHint`, `columnHint`); mientras hay arrastre `.columns` lleva `is-dragging` (sin scroll-snap).
- Accesibilidad: cada tarjeta es `role="button"` con `aria-roledescription` y `aria-describedby` a una ayuda oculta; alternativa de teclado `Alt + flechas` para mover tarjetas (arriba/abajo reordena, izquierda/derecha cambia de columna) y `Alt + ←/→` en el asa de columna; una región `aria-live` anuncia cada movimiento y su reversión.

## Autenticación y errores

- `AuthService` guarda el JWT, el usuario y su expiración en `localStorage` (`TokenStorage`) y los expone como signals (`isAuthenticated`).
- `authInterceptor` agrega `Authorization: Bearer` a las URLs `/api/`.
- `errorInterceptor`: un 401 (salvo en login/registro) cierra sesión (`AuthService.logout`, que redirige a `/login`) y avisa con un toast; el resto de errores se muestran en un toast con el `detail` de la API (también el formato de lista de FastAPI 422). Login y registro muestran su error dentro del formulario. Cada vista tiene estados de carga, vacío y error con reintento.

## Diseño

Variables CSS en `src/styles.scss` (claro/oscuro con `prefers-color-scheme`). La prioridad se codifica con color y forma (▽ ○ △ ◆) más texto; las fechas vencidas se resaltan con color, icono y la palabra "Vencida". En móvil: áreas seguras (`viewport-fit=cover`), objetivos táctiles de 44 px, columnas con scroll-snap y detalle a pantalla completa (ver [MOBILE.md](MOBILE.md)). Foco visible global, labels en todos los campos, modales con `role="dialog"`, foco atrapado y restaurado, y `prefers-reduced-motion`.

## PWA

`provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })`, es decir, solo en el build de producción; `ngsw-config.json` cachea el app shell y los estáticos y **nunca** `/api/` (sin `dataGroups`; `navigationUrls` excluye `/api/**`). `AppStatusComponent` (en `AppComponent`) muestra el banner "Sin conexión" (`ConnectivityService`) y el aviso de versión nueva con "Actualizar" (`AppUpdateService`, `SwUpdate`). Ver [MOBILE.md](MOBILE.md).

## Añadir una pantalla o un recurso

Pasos, siguiendo los patrones existentes. Si el recurso es nuevo en la API, primero se actualiza [`docs/CONTRACT.md`](../../docs/CONTRACT.md) (el orden completo está en `CLAUDE.md`).

1. **Tipos** en `core/models/api.models.ts`, calcados del contrato (`XxxOut`, `XxxCreate`, `XxxUpdate`; ver `LabelOut` / `LabelCreate`).
2. **Servicio HTTP** en `core/services/xxx.service.ts`: `@Injectable({ providedIn: 'root' })`, `inject(HttpClient)`, métodos que devuelven `Observable<T>` y URLs relativas `/api/v1/...` (así las toma `authInterceptor`, que solo añade el Bearer a `/api/`). Modelo: `LabelsService`.

   ```ts
   @Injectable({ providedIn: 'root' })
   export class XxxService {
     private readonly http = inject(HttpClient);
     list(boardId: string): Observable<XxxOut[]> {
       return this.http.get<XxxOut[]>(`/api/v1/boards/${boardId}/xxx`);
     }
   }
   ```
3. **Pantalla** en `features/<nombre>/<nombre>-page.component.ts`: standalone, `ChangeDetectionStrategy.OnPush`, signals para `loading`/`error`/datos, `inject()` y Reactive Forms. Reutiliza `ui-app-header`, `uiButton`, `ui-modal`, `ui-confirm-dialog`, `ui-input` y los pipes de `shared/`. Cubre los estados de carga, vacío y error con "Reintentar" (ver `BoardsPageComponent`). Los errores HTTP ya los muestra el `errorInterceptor` en un toast; en formularios usa `apiErrorMessage` (`core/http-error.ts`). Si la pantalla tiene estado compartido entre varios componentes (como el tablero), crea un store `@Injectable()` con signals y proporciónalo en el componente de la página (`providers: [Store]`), no en `root`.
4. **Ruta** en `app.routes.ts`, perezosa y con guard y `title`:

   ```ts
   {
     path: 'xxx',
     canActivate: [authGuard],            // guestGuard solo para pantallas sin sesión
     title: 'Xxx · Carril',
     loadComponent: () => import('./features/xxx/xxx-page.component').then((m) => m.XxxPageComponent),
   },
   ```
   Ponla antes del comodín `**`, que redirige a `boards`.
5. **Pruebas**: spec unitario del servicio con `HttpTestingController` (patrón en `core/core.spec.ts`) y, si hay página, un `*.integration.spec.ts` con `setupIntegration(true)` de `integration-helpers.ts`. Esa función usa `TEST_ROUTES` (una copia de las rutas con `component` en lugar de `loadComponent`): añade ahí la ruta nueva. Datos de ejemplo en `testing.ts`. Ver [TESTING.md](TESTING.md).
6. **Documentación**: contrato, este archivo y, si cambia el comportamiento, `CLAUDE.md`.

Para un recurso nuevo en el tablero, además, añade el método al `BoardStore` (copia/actualiza `board` con `signal.update`, y si es un movimiento sigue el patrón optimista de `moveTask`).
