# Carril backend

## Requisitos

- Docker y Docker Compose (Postgres 16 + API).
- Para desarrollo local: Python 3.12 o superior (probado con 3.12 y 3.13).

## Correr en Docker (desde la raíz del repo)

```bash
docker compose up -d --build        # db + api
docker compose ps                   # api y db deben estar healthy
curl localhost:8000/api/v1/health   # {"status":"ok","database":"ok"}
```

Swagger: http://localhost:8000/docs · OpenAPI: http://localhost:8000/openapi.json.
El esquema y los datos demo los aplica el contenedor `db` desde `database/ddl` y `database/seed`
(usuario demo: `demo@carril.dev` / `demo1234`). El backend nunca crea ni migra tablas.

## Correr local

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
docker compose up -d db             # desde la raíz
export JWT_SECRET=$(openssl rand -hex 32)
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Producción (HTTPS, frontend y API en el mismo origen detrás de un proxy inverso): [DEPLOYMENT.md](DEPLOYMENT.md).

## Variables de entorno

| Variable | Defecto | Descripción |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://carril:carril@localhost:5432/carril` | Conexión async a Postgres |
| `JWT_SECRET` | (obligatoria) | Secreto HS256, mínimo 32 caracteres y no un valor de ejemplo (`change-me-in-production`, `change-me`, `secret`, `changeme`); la API no arranca si no cumple. `openssl rand -hex 32` |
| `JWT_ALGORITHM` | `HS256` | Algoritmo de firma del JWT; el compose no lo pasa, no suele cambiarse |
| `JWT_EXPIRES_MINUTES` | `720` | Vigencia del token |
| `CORS_ORIGINS` | `http://localhost:4200` | Orígenes permitidos, separados por comas. Se aplica también a las respuestas 500 y 503. Con frontend y API en el mismo origen el navegador no necesita CORS; basta con el origen público |
| `FORWARDED_ALLOW_IPS` | `127.0.0.1` (imagen Docker) | IPs o subredes (CIDR) del proxy inverso de las que Uvicorn acepta `X-Forwarded-Proto/For`, separadas por comas; `*` confía en cualquiera. La lee Uvicorn, no la app. Ver [DEPLOYMENT.md](DEPLOYMENT.md) |
| `BCRYPT_ROUNDS` | `12` | Coste de bcrypt (las pruebas usan 4) |
| `TEST_DATABASE_URL` | `postgresql+asyncpg://carril:carril@localhost:5432/carril_test` | Solo pruebas de integración |
| `E2E_BASE_URL` | `http://localhost:8000` | Solo pruebas e2e |

La app no lee archivos `.env`: en local exporta las variables en el shell; en Docker las pasa el compose desde el `.env` de la raíz.

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `docker compose up` falla con "Define JWT_SECRET en .env" | el compose exige la variable | `cp .env.example .env` y pon `openssl rand -hex 32` en `JWT_SECRET` |
| El contenedor `api` se reinicia y `docker compose logs api` muestra `[carril] Configuración inválida: JWT_SECRET: JWT_SECRET debe tener al menos 32 caracteres y no ser un valor de ejemplo (genera uno con `openssl rand -hex 32`)` | `JWT_SECRET` falta, mide menos de 32 caracteres o es un valor de ejemplo. El compose solo exige que no esté vacío; la longitud la valida la API al arrancar (`get_settings()` sale con ese mensaje, sin traza ni el valor recibido) | Pon en `.env` un secreto válido (`openssl rand -hex 32`) y `docker compose up -d api` |
| `503 {"detail":"Base de datos no disponible"}` en cualquier endpoint, o `/health` con `{"status":"error","database":"error"}` | la API no conecta a Postgres (`OperationalError`, `InterfaceError` u `OSError`) | `docker compose ps` (db debe estar healthy); en local revisa `DATABASE_URL`. La API se recupera sola al volver la BD (`pool_pre_ping`) |
| Las pruebas de integración o e2e salen como `skipped` | sin BD `carril_test` (`TEST_DATABASE_URL`) o sin API en `E2E_BASE_URL`; el motivo aparece en el mensaje del skip | `docker compose up -d db` (el DDL de `carril_test` solo se aplica con volumen vacío: `docker compose down -v` si no existe) y, para e2e, `docker compose up -d api` |
| Un script o import fuera de `pytest` termina con `[carril] Configuración inválida: JWT_SECRET: ...` | no hay `JWT_SECRET` válido en el entorno | `tests/conftest.py` lo fija para las pruebas; para scripts sueltos exporta uno |
| El navegador muestra error de red en vez del `detail` de un 500/503 | el `Origin` no está en `CORS_ORIGINS`, así que no hay cabeceras CORS | añade el origen (separados por comas, sin barra final) y reinicia la API |
| Detrás de Caddy, `request.url` es `http` o la IP es la del proxy | la IP del proxy no está en `FORWARDED_ALLOW_IPS` | ver [DEPLOYMENT.md](DEPLOYMENT.md) |
