# Carril · frontend

Interfaz en español de un gestor de tareas Kanban. Angular 19 "puro": componentes standalone, signals, nuevo control flow, `inject()`, Reactive Forms, interceptores y guards funcionales. Sin Angular Material/CDK, PrimeNG, Tailwind ni Bootstrap. El arrastre usa Pointer Events (ratón, dedo y lápiz), sin librerías de gestos. Es una **PWA** instalable (`@angular/service-worker`, el paquete oficial): ver [MOBILE.md](MOBILE.md).

## Requisitos

- Node 20.12+ (Angular 19; Angular 20 no es compatible con esta versión de Node)
- Google Chrome (Karma usa ChromeHeadless; en macOS se detecta en `/Applications`)
- API de Carril en `http://localhost:8000` para usar la app y para los e2e (`docker compose up -d` en la raíz del repo)

## Instalar y ejecutar

```bash
cd frontend
npm install
npm start               # ng serve en :4200
```

`proxy.conf.json` (configurado en `angular.json > serve`) reenvía `/api` a `http://localhost:8000`; el código usa URLs relativas `/api/v1/...`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm start` | `ng serve` en :4200 |
| `npm run build` | build de producción en `dist/` (incluye `ngsw.json`, `ngsw-worker.js` y `manifest.webmanifest`) |
| `npm run test:unit` | pruebas unitarias, una vez, headless, con cobertura (umbral de líneas 80 %) |
| `npm run test:integration` | solo `*.integration.spec.ts` |
| `npm run test:e2e` | Playwright contra el stack real (requiere API en :8000): proyectos `chromium` (escritorio) y `mobile` (Pixel 7, táctil) |
| `npm run icons` | regenera los PNG de la PWA y `favicon.ico` a partir de los SVG |

Ver [TESTING.md](TESTING.md), [ARCHITECTURE.md](ARCHITECTURE.md) y [MOBILE.md](MOBILE.md) (instalar la PWA, service worker y cómo probarla en local con el build de producción).
