# Brief: agente `backend/`

Eres el agente de codificación del proyecto `backend/` de "Carril", un gestor de tareas Kanban. Raíz del repo: /Users/julianechavarria/Documents/Claude_project. Trabajas SOLO dentro de `backend/` (no edites docker-compose.yml, docs/, database/ ni frontend/; si algo del contrato o del compose te parece mal, repórtalo en tu respuesta final).

Lee primero: `docs/CONTRACT.md` (contrato exacto: esquema y API, fuente de verdad), `docker-compose.yml` (servicio `api`: build `./backend`, puerto 8000, variables `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_MINUTES`, `CORS_ORIGINS`, healthcheck a `/api/v1/health`), `.env`, y el DDL real en `database/ddl/*.sql` (ya aplicado en el contenedor `db`, en las BD `carril` y `carril_test`). La arquitectura aprobada está en `docs/arquitectura.html`.

## Stack

Python 3.12 en Docker (localmente hay Python 3.13; el código debe funcionar en ambos), FastAPI, uvicorn, SQLAlchemy 2.x async + asyncpg, Pydantic v2 + pydantic-settings, PyJWT, bcrypt (directo, sin passlib), pytest, pytest-asyncio, httpx, pytest-cov. Dependencias en `pyproject.toml` (extras `dev` para pruebas). Venv local en `backend/.venv`.

## Reglas

- El esquema vive SOLO en `database/ddl`. Prohibido Alembic y `metadata.create_all`. Los modelos ORM mapean las tablas existentes (enum `task_priority` con `create_type=False`).
- Capas: `app/api/v1/routers/` (HTTP, sin lógica) → `app/services/` (reglas de negocio, autorización por dueño, reordenamiento) → `app/repositories/` (SQLAlchemy). `app/core/` (config con pydantic-settings, security: hash + JWT, errores de dominio mapeados a HTTP), `app/db/` (engine, `get_session`), `app/schemas/` (Pydantic, coincidiendo exactamente con los tipos del contrato), `app/main.py` (app, CORS desde `CORS_ORIGINS`, routers bajo `/api/v1`).
- Implementa TODOS los endpoints del contrato con los códigos de estado exactos. Recurso de otro usuario → 404. Crear tablero crea "Por hacer", "En curso", "Hecho". Mover/reordenar/borrar mantienen posiciones contiguas base 0 dentro de una transacción (las UNIQUE son DEFERRABLE INITIALLY DEFERRED). `comment_count`, `column_count`, `task_count` calculados. Evita N+1 en `GET /boards/{id}` (selectinload o consultas agregadas).
- `GET /api/v1/health` hace `SELECT 1`; 503 si falla.
- `Dockerfile` multi-stage con `python:3.12-slim`, usuario no root, `uvicorn app.main:app --host 0.0.0.0 --port 8000`. `.dockerignore` (excluye .venv, tests de caché, etc.).

## Pruebas (obligatorias), en `backend/tests/` con markers `unit`, `integration`, `e2e` registrados

- `tests/unit/`: services y security con repositorios falsos/mocks, sin BD: hash/verify, JWT (expirado, firma inválida), reglas de reordenamiento (acotar posición, mover dentro de la misma columna hacia arriba y abajo, entre columnas), validaciones de autorización (404 para ajeno), creación de columnas por defecto, validación de schemas.
- `tests/integration/`: la app real con `httpx.AsyncClient(transport=ASGITransport(app))` contra la BD `carril_test` del contenedor (`postgresql+asyncpg://carril:carril@localhost:5432/carril_test`, configurable por env `TEST_DATABASE_URL`). Aísla cada prueba (TRUNCATE de todas las tablas entre pruebas o transacción con rollback; elige lo que funcione bien con las UNIQUE diferibles). Cubre cada endpoint: casos felices, 401, 404 de recurso ajeno, 409, 422, posiciones tras mover/borrar, cascadas.
- `tests/e2e/`: contra la API REAL corriendo en Docker (`E2E_BASE_URL`, por defecto http://localhost:8000) con httpx síncrono: health, registrar 2 usuarios únicos, flujo completo de tablero (crear, columnas por defecto, crear tareas, mover entre columnas, reordenar columnas, etiquetas, comentarios, editar, borrar), y aislamiento entre usuarios. Las pruebas e2e se saltan con un mensaje claro si la API no responde.
- Meta: cobertura ≥ 85% en `app/` (unit + integration). `pytest.ini` o `[tool.pytest.ini_options]` con `asyncio_mode = auto`.

## Documentación en `backend/docs/`

`README.md` (requisitos, correr local y en Docker, variables), `ARCHITECTURE.md` (capas, flujo de una petición, transacciones y reordenamiento, auth), `API.md` (todos los endpoints con ejemplos de request/response y errores; Swagger en /docs), `TESTING.md` (las tres capas y cómo correrlas). Un `backend/README.md` corto que apunte a docs/.

## Verificación obligatoria antes de terminar

- El contenedor `db` ya está arriba (si no, `docker compose up -d db` desde la raíz).
- `.venv/bin/pytest -m unit` y `-m integration --cov=app` pasan; reporta la cobertura.
- `docker compose up -d --build api` desde la raíz; `docker compose ps` muestra `api` healthy; `curl localhost:8000/api/v1/health` responde ok; `curl localhost:8000/docs` responde 200.
- `.venv/bin/pytest -m e2e` pasa contra el contenedor.
- Login con el usuario del seed (`demo@carril.dev` / `demo1234`) funciona contra el contenedor y `GET /boards` devuelve el tablero "Lanzamiento v1".
- Deja `db` y `api` arriba y sanos.

Responde al final con: estructura creada, resultados de las tres suites (número de pruebas y cobertura) y cualquier desviación o duda sobre el contrato.
