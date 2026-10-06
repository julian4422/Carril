# Brief: agente `backend/` · móvil (v1.2)

Eres el agente del proyecto `backend/` de "Carril" (Kanban; FastAPI async + SQLAlchemy + asyncpg). Esta iteración prepara la API para el uso móvil como PWA. Trabajas en un **git worktree** propio (tu directorio actual), en una rama aparte. Solo editas `backend/`. Si algo del contrato o del compose te parece mal, repórtalo al final. En paralelo, otro agente trabaja en `frontend/`.

## Contexto (léelo primero)

- `CLAUDE.md` (raíz): comandos y arquitectura.
- `docs/CONTRACT.md`, sobre todo la sección **Móvil (v1.2)**: es la fuente de verdad.
- `backend/docs/` (README, ARCHITECTURE, API, TESTING).
- `docs/VALIDATION.md`: el "pendiente conocido" de CORS en los 500.

## Tareas

1. **CORS también en los 500.** Hoy un error no controlado sale sin `Access-Control-Allow-Origin` y el navegador lo ve como error de red. Haz que la respuesta 500 `{"detail":"Error interno"}` (y la 503) lleven las cabeceras CORS para los orígenes permitidos, y ninguna para orígenes no permitidos.
2. **GZip** (`GZipMiddleware`, `minimum_size=1000`). Comprueba que funciona junto con CORS y con los manejadores de error.
3. **Detrás de un proxy HTTPS.** Uvicorn ya lee `X-Forwarded-Proto/For` si la IP del proxy está en `FORWARDED_ALLOW_IPS`. Haz que el contenedor lo respete, con valor por defecto `127.0.0.1` y configurable por env. No toques `docker-compose.yml`: si hace falta pasar la variable, dilo en tu respuesta y lo añade el orquestador.
4. **Documentación:**
   - Crea `backend/docs/DEPLOYMENT.md`: cómo desplegar en producción con frontend y API en el mismo origen. Incluye un ejemplo de proxy inverso con **Caddy** (HTTPS automático): `/api/*` a la API y el resto al build estático con fallback a `index.html`. Variables (`JWT_SECRET`, `CORS_ORIGINS`, `FORWARDED_ALLOW_IPS`, `DATABASE_URL`) y comprobaciones tras el despliegue.
   - Actualiza `backend/docs/README.md` (variables), `ARCHITECTURE.md` (middlewares y su orden) y `TESTING.md` (pruebas nuevas). En `API.md`, menciona la compresión y la regla de CORS en errores.

## Pruebas (obligatorias)

- Integración: 500 con origen permitido → lleva `access-control-allow-origin`; con origen no permitido → no la lleva. Respuesta grande (`GET /boards/{id}` con datos) con `Accept-Encoding: gzip` → `content-encoding: gzip`; respuesta pequeña → sin comprimir.
- Unit donde aplique (configuración).
- Se mantienen la cobertura ≥ 85 % (unit + integration) y todas las pruebas existentes en verde.

## Entorno (importante: trabajas en un worktree)

- Docker ya está arriba con `db` y `api` (proyecto compose `carril`, levantado desde la raíz principal `/Users/julianechavarria/Documents/Claude_project`). **No** ejecutes `docker compose up/down/build` del proyecto `carril` ni `down -v`: el agente de frontend usa la API de :8000 para sus e2e.
- Copia `/Users/julianechavarria/Documents/Claude_project/.env` a la raíz de tu worktree (está en `.gitignore`; no lo subas). Si ejecutas `docker compose exec` (por ejemplo, la limpieza de e2e), exporta `COMPOSE_PROJECT_NAME=carril`.
- Venv propio en `backend/.venv` de tu worktree (`python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'`).
- Integración contra `carril_test` (la BD por defecto de las pruebas).
- Para el e2e de tu versión: construye la imagen con otra etiqueta (`docker build -t carril-api-mobile backend`) y córrela en **:8001**, en la red del compose (`docker network ls`; probablemente `carril_default`), con `DATABASE_URL=postgresql+asyncpg://carril:carril@db:5432/carril` y el `JWT_SECRET` del `.env`. Luego `E2E_BASE_URL=http://localhost:8001 .venv/bin/pytest -m e2e` y verifica a mano `curl -H 'Accept-Encoding: gzip' -I` y las cabeceras CORS. Al terminar, detén y borra ese contenedor.

## Al terminar

- Haz commit en tu rama, sin push. El mensaje termina con:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CWDUhxbiLE153XuypNZym7
  ```
- Responde con: cambios hechos, resultados de cada suite (número de pruebas y cobertura), qué verificaste en el contenedor de :8001, nombre de la rama, y cualquier cambio que el orquestador deba hacer fuera de `backend/` (compose, contrato).
