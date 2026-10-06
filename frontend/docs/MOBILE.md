# Carril en el móvil (PWA, v1.2)

Carril se usa desde el teléfono como **PWA instalable**: es el mismo frontend Angular con un manifest, un service worker oficial (`@angular/service-worker`), arrastre táctil por Pointer Events y un diseño pensado para el dedo. No hay app nativa ni publicación en tiendas. Ver la sección "Móvil (v1.2)" de `docs/CONTRACT.md`.

## Instalar la PWA

Se necesita el build de producción servido por **HTTPS** (o `localhost`), porque el service worker solo funciona en un contexto seguro. En producción, el proxy inverso sirve el frontend y la API desde el mismo origen (`/api` va a la API; el resto, a los estáticos con fallback a `index.html`).

- **Android (Chrome, Edge, Samsung Internet):** abre Carril, inicia sesión y usa el aviso "Instalar aplicación" o el menú ⋮ > *Instalar aplicación* / *Añadir a pantalla de inicio*. Se abre en ventana propia (`display: standalone`) con el icono maskable.
- **iOS / iPadOS (Safari):** botón *Compartir* > *Añadir a pantalla de inicio*. Safari usa `apple-touch-icon.png` y las meta `apple-mobile-web-app-*` de `index.html`. En iOS, cada PWA instalada tiene su propio almacenamiento: hay que iniciar sesión otra vez dentro de la app instalada.
- **Escritorio (Chrome/Edge):** icono de instalar en la barra de direcciones.

El manifest (`public/manifest.webmanifest`) está en español: `name`/`short_name` "Carril", `start_url` `/boards`, `scope` `/`, `theme_color` `#0f6e63` (el acento de la paleta) y `background_color` `#f4f2ec` (el fondo claro). `index.html` añade `theme-color` para claro (`#ffffff`, la cabecera) y oscuro (`#1b2226`).

### Iconos

Diseño propio: dos rieles con traviesas y una tarjeta que avanza por ellos, en los colores de la paleta.

- `public/icons/icon.svg`: fuente del icono normal (también se usa como favicon SVG).
- `scripts/icons/icon-maskable.svg`: versión maskable, con fondo a sangre y el dibujo dentro de la zona segura (círculo de radio 40 %).
- `npm run icons` rasteriza ambos SVG con el Chromium de Playwright y genera `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180 px, a sangre: iOS redondea las esquinas) y `public/favicon.ico` (32 px). Los PNG generados están versionados; solo hay que volver a correrlo si cambian los SVG.

## Arrastre táctil (Pointer Events)

Un solo camino para ratón, dedo y lápiz: sustituye al drag & drop de HTML5. Piezas:

- `features/board/pointer-drag.logic.ts`: funciones puras (umbral, pulsación larga, destino de soltado, columna bajo el puntero, velocidad de auto-scroll).
- `features/board/pointer-drag.ts`: `PointerDragSession`, un gesto desde `pointerdown` hasta soltar o cancelar. Maneja el temporizador, el fantasma, el auto-scroll y los eventos del navegador.
- `BoardPageComponent`: crea la sesión en el `pointerdown` de una tarjeta (`.item`) o de la cabecera de una columna, calcula el destino con los rectángulos del DOM y al soltar reutiliza `dropIndex` → `store.moveTask` / `store.moveColumn` (optimista, con reversión si la API falla).

Cuándo empieza el arrastre:

| Entrada | Inicio |
|---|---|
| Ratón | al moverse 5 px con el botón principal pulsado (un clic sigue abriendo el detalle) |
| Dedo o lápiz sobre una tarjeta o la cabecera | **pulsación larga de 250 ms** sin moverse más de 10 px. Si el dedo se mueve antes, el gesto se cancela y el navegador hace su scroll normal (vertical en la columna, horizontal en el tablero) |
| Dedo o lápiz sobre el asa ⠿ de una columna | por umbral, sin esperar: el asa tiene `touch-action: none` |

Durante el arrastre:

- Un **fantasma** (clon del elemento, `.drag-ghost`, `pointer-events: none`) sigue al dedo; el original queda atenuado en su sitio.
- El **indicador de inserción** (barra de acento antes/después de una tarjeta o columna, o borde punteado si se suelta al final de la lista) se calcula por la mitad del elemento bajo el puntero. La columna destino es la que está bajo la `x` del puntero o la más cercana.
- **Auto-scroll** en cada cuadro (`requestAnimationFrame`): a menos de 56 px de un borde, el tablero se desplaza en horizontal y la lista de la columna en vertical, más rápido cuanto más cerca del borde (máximo 18 px por cuadro). El `scroll-snap` se desactiva mientras se arrastra para no pelear con el auto-scroll.
- Un listener de `touchmove` **no pasivo** cancela el scroll del navegador solo mientras hay arrastre; también se bloquean el menú contextual de la pulsación larga y la selección de texto. Hay una vibración corta al empezar, si el dispositivo la admite.
- `Esc` o `pointercancel` cancelan sin mover nada. Tras soltar, se suprime el `click` que el navegador dispara sobre la tarjeta, para que no se abra el detalle.

Se mantienen la alternativa por teclado (Alt + flechas) y la región `aria-live` que anuncia cada movimiento y cada reversión.

## Diseño móvil

- `viewport-fit=cover` y `env(safe-area-inset-*)` en la cabecera, el tablero, los modales, los toasts y los avisos.
- Objetivos táctiles de 44 px o más (`@media (pointer: coarse), (max-width: 640px)`): botones, asa y menú de columna, "Añadir tarjeta", campos y cierre de modales y toasts.
- En pantallas de 640 px o menos, cada columna mide `min(85vw, 22rem)` y el tablero usa `scroll-snap-type: x mandatory`. El tablero ocupa la altura de la ventana (`100dvh`) y cada columna desplaza su propia lista.
- El detalle de tarjeta se abre a pantalla completa, con la cabecera arriba, el cuerpo desplazable y el pie (Guardar, Eliminar) siempre visible.
- La página nunca tiene scroll horizontal a 390×844; solo el contenedor del tablero se desplaza (el e2e móvil lo comprueba).

## Service worker: qué se cachea y qué no

Config en `ngsw-config.json`; se activa solo en el build de producción (`provideServiceWorker(..., { enabled: !isDevMode() })`, registro `registerWhenStable:30000`).

| Grupo | Contenido | Estrategia |
|---|---|---|
| `app` (prefetch) | `index.html`, `manifest.webmanifest`, `favicon.ico`, JS y CSS con hash | se descarga al instalar; la app abre sin red |
| `assets` (lazy, update prefetch) | iconos, imágenes y fuentes | se cachean al pedirlos por primera vez |
| `/api/**` | **nada**: no hay `dataGroups` | siempre va a la red |

**Por qué no se cachea la API.** Los datos son privados por usuario y cambian a menudo; las respuestas dependen del token `Authorization`. Una caché podría mostrar datos de otra sesión en un dispositivo compartido o datos viejos tras un movimiento optimista, y no hay sincronización offline de escrituras. Por eso, sin conexión se ve la app, pero las peticiones fallan y lo dicen: el banner "Sin conexión" avisa, y los movimientos optimistas se revierten con su toast. Además, `navigationUrls` excluye `/api/**` para que el service worker no responda con `index.html` a una navegación hacia la API.

**Versiones nuevas.** `AppUpdateService` escucha `SwUpdate.versionUpdates` y, ante `VERSION_READY`, muestra un aviso "Hay una versión nueva de Carril" con **Actualizar** (llama a `activateUpdate()` y recarga) y **Más tarde**. Busca versiones al volver a la pestaña (`visibilitychange`) y cada 30 minutos. Si el service worker queda en estado irrecuperable (`unrecoverable`), pide recargar. `ConnectivityService` expone `online`/`offline` como signal para el banner.

## Probar la PWA en local

`ng serve` no registra el service worker. Hay que usar el build de producción servido como estáticos, con la API en el mismo origen. `localhost` cuenta como contexto seguro, así que no hace falta HTTPS en el ordenador:

```bash
npm run build                       # dist/frontend/browser con ngsw.json y manifest.webmanifest
# Servir dist/frontend/browser con fallback a index.html y /api -> :8000. Por ejemplo, con Caddy:
caddy run --config - --adapter caddyfile <<'EOF'
:8080 {
  handle /api/* { reverse_proxy localhost:8000 }
  handle { root * dist/frontend/browser; try_files {path} /index.html; file_server }
}
EOF
# abrir http://localhost:8080  →  DevTools > Application > Manifest / Service workers
```

Cualquier servidor estático con fallback a `index.html` y proxy de `/api` sirve igual (nginx, Caddy). Un servidor estático sin proxy basta para revisar el manifest y el service worker, pero la app no podrá hablar con la API. Desde el **teléfono** se necesita HTTPS real: un túnel (`cloudflared tunnel --url http://localhost:8080`, `ngrok http 8080`) o un certificado de confianza (`mkcert`) en el proxy. Para el arrastre táctil sin teléfono, sirve el modo dispositivo de Chrome DevTools o `npm run test:e2e` (proyecto `mobile`).

Para comprobar una actualización: con la app abierta, cambia algo, `npm run build` otra vez y vuelve a la pestaña. Aparece el aviso "Actualizar".

## Limitaciones

- **Sin modo offline de datos:** sin red se ve la app, pero no se cargan ni se guardan tableros, y no hay cola de cambios pendientes.
- **iOS:** sin aviso de instalación automático (es manual desde Compartir); la vibración no está disponible; el almacenamiento (y la sesión) de la PWA instalada es independiente del de Safari y el sistema puede borrarlo tras semanas sin uso.
- El arrastre con el dedo requiere pulsación larga: un deslizamiento rápido siempre hace scroll. Para mover sin esperar, se usa el asa ⠿ (columnas) o el teclado.
- El auto-scroll actúa sobre el tablero y la lista de la columna bajo el dedo, no sobre la página.
- HTTPS es obligatorio fuera de `localhost`: por HTTP no se registra el service worker ni se puede instalar.
- Multitáctil: solo cuenta el puntero principal; un segundo dedo no inicia otro arrastre.
