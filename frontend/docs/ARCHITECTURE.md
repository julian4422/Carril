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
│   ├── http-error.ts             extrae `detail` de errores de la API
│   └── date.utils.ts             fechas YYYY-MM-DD en hora local
├── features/
│   ├── auth/                     login y registro
│   ├── boards/                   lista de tableros (crear/borrar)
│   └── board/                    página del tablero, BoardStore, board.logic,
│                                 tarjeta y detalle de tarjeta
├── shared/
│   ├── ui/                       button, modal, confirm-dialog, input (CVA), chip,
│   │                             toast (servicio + contenedor), app-header
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

## Drag & drop (HTML5 nativo)

- Tarjetas: cada `.item` es `draggable`. `dragover` sobre una tarjeta decide "antes/después" según la mitad vertical bajo el puntero y pinta un indicador; `drop` calcula el índice final con `dropIndex` sobre la lista completa de la columna (correcto aunque haya filtros activos). Soltar en el área libre de la lista agrega al final (también en columnas vacías).
- Columnas: la cabecera es `draggable`; `dragover` decide antes/después por la mitad horizontal; `drop` llama a `store.moveColumn`.
- Estado de arrastre en signals de la página (`drag`, `taskHint`, `columnHint`); se limpia en `dragend`/`drop`.
- Accesibilidad: cada tarjeta es `role="button"` con `aria-roledescription` y `aria-describedby` a una ayuda oculta; alternativa de teclado `Alt + flechas` para mover tarjetas (arriba/abajo reordena, izquierda/derecha cambia de columna) y `Alt + ←/→` en el asa de columna; una región `aria-live` anuncia cada movimiento y su reversión.

## Autenticación y errores

- `AuthService` guarda el JWT, el usuario y su expiración en `localStorage` (`TokenStorage`) y los expone como signals (`isAuthenticated`).
- `authInterceptor` agrega `Authorization: Bearer` a las URLs `/api/`.
- `errorInterceptor`: un 401 (salvo en login/registro) cierra sesión, redirige a `/login` y avisa; el resto de errores se muestran en un toast con el `detail` de la API (también el formato de lista de FastAPI 422). Login y registro muestran su error dentro del formulario. Cada vista tiene estados de carga, vacío y error con reintento.

## Diseño

Variables CSS en `src/styles.scss` (claro/oscuro con `prefers-color-scheme`). La prioridad se codifica con color y forma (▽ ○ △ ◆) más texto; las fechas vencidas se resaltan con color, icono y la palabra "Vencida". Foco visible global, labels en todos los campos, modales con `role="dialog"`, foco atrapado y restaurado, y `prefers-reduced-motion`.
