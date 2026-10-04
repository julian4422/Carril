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

## Variables de entorno

| Variable | Defecto | Descripción |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://carril:carril@localhost:5432/carril` | Conexión async a Postgres |
| `JWT_SECRET` | (obligatoria) | Secreto HS256, mínimo 32 caracteres y no un valor de ejemplo; la API no arranca si no cumple. `openssl rand -hex 32` |
| `JWT_EXPIRES_MINUTES` | `720` | Vigencia del token |
| `CORS_ORIGINS` | `http://localhost:4200` | Orígenes permitidos, separados por comas |
| `BCRYPT_ROUNDS` | `12` | Coste de bcrypt (las pruebas usan 4) |
| `TEST_DATABASE_URL` | `postgresql+asyncpg://carril:carril@localhost:5432/carril_test` | Solo pruebas de integración |
| `E2E_BASE_URL` | `http://localhost:8000` | Solo pruebas e2e |
