# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Carril: gestor de tareas Kanban en tres proyectos independientes que comparten un contrato.

- `database/`: DDL de PostgreSQL 16 (`ddl/*.sql`), seed y pruebas del esquema.
- `backend/`: API REST con FastAPI async, SQLAlchemy y asyncpg. Corre en Docker.
- `frontend/`: Angular 19. Corre local con `ng serve`, fuera de Docker.

`docs/CONTRACT.md` es la fuente de verdad entre los tres: esquema, tipos de la API, endpoints y reglas v1.1. Si un cambio toca el esquema o la API, actualiza primero el contrato y luego `database/ddl`, los modelos y schemas del backend (`app/db/models.py`, `app/schemas/`) y los tipos del frontend (`src/app/core/models/api.models.ts`). La documentación y la interfaz están en español.

## Comandos

Stack completo (desde la raíz; `.env` necesita un `JWT_SECRET` de 32 caracteres o más, la API no arranca sin él):

```bash
cp .env.example .env && openssl rand -hex 32     # pega el valor en JWT_SECRET
docker compose up -d --build                     # db :5432 + api :8000 (Swagger en /docs)
cd frontend && npm install && npm start          # :4200, proxy /api -> :8000
docker compose down -v && docker compose up -d --build   # recrea la BD (el init solo corre con volumen vacío)
```

Usuario demo: `demo@carril.dev` / `demo1234`.

Backend (`cd backend`; instalar con `python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'`):

```bash
.venv/bin/pytest -m unit                              # sin BD
.venv/bin/pytest -m integration                       # requiere `docker compose up -d db` (usa carril_test)
.venv/bin/pytest -m e2e                               # requiere la API en Docker
.venv/bin/pytest -m "unit or integration" --cov=app   # meta de cobertura >= 85 %
.venv/bin/pytest tests/unit/test_services.py -k move  # una prueba concreta
```

Database (`cd database`; instalar con `python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`): `.venv/bin/pytest -m unit|integration|e2e`. Requiere el contenedor `db` y lee credenciales de `../.env`. Cada sesión crea y borra una BD temporal `carril_dbtest_<random>`.

Frontend (`cd frontend`, Node 20.12+, Chrome para Karma):

```bash
npm run build
npm run test:unit          # Karma headless, excluye *.integration.spec.ts, falla si líneas < 80 %
npm run test:integration   # solo *.integration.spec.ts
npm run test:e2e           # Playwright contra ng serve + API real en :8000
npx ng test --watch=false --browsers=ChromeHeadless --include 'src/app/features/board/board.logic.spec.ts'   # un archivo
```

No hay linters configurados.

## Arquitectura

### Base de datos
- El esquema vive solo en `database/ddl`. El backend nunca crea ni migra tablas: no hay Alembic ni `create_all`. `database/init/00_init.sh` (montado en el contenedor) aplica el DDL a `carril` y `carril_test`, y el seed solo a `carril`.
- Las posiciones (`board_columns.position`, `tasks.position`) son base 0 y contiguas dentro de su padre. Sus UNIQUE son `DEFERRABLE INITIALLY DEFERRED`, así que un reordenamiento puede pasar por duplicados dentro de la transacción y solo se valida al COMMIT.

### Backend (`backend/app`)
- Capas: routers (`api/v1/routers`, solo HTTP) → services (reglas, autorización por dueño, commit explícito con `UnitOfWork`) → repositories (todo el SQL) → `db` (modelos ORM, sesión, uow). Los servicios reciben repositorios por constructor; por eso las pruebas unitarias usan fakes en memoria (`tests/unit/fakes.py`). El cableado está en `api/deps.py`.
- Autorización: cada consulta filtra por dueño con un join hasta `boards.owner_id`. Un recurso ajeno o inexistente da el mismo 404. Excepciones documentadas: mover a una columna propia de otro tablero da 422, y una etiqueta que no es del tablero en `PUT /tasks/{id}/labels` da 422.
- Reordenamiento: funciones puras en `services/ordering.py`. Antes de leer posiciones, los servicios bloquean la fila del tablero (`BoardRepository.lock`, `SELECT … FOR UPDATE`) y vuelven a resolver los recursos. Un `IntegrityError` residual se responde con 409.
- Las relaciones ORM usan `lazy="raise"`: hay que cargar con `selectinload` de forma explícita. `GET /boards/{id}` hace un número fijo de consultas y hay una prueba que lo verifica.
- Errores: los `DomainError` (`core/errors.py`) se traducen a `{"detail": ...}`. Todo error no controlado devuelve JSON: 500, o 503 si la BD no responde.
- Pruebas de integración: se aíslan con TRUNCATE antes y después de cada prueba, no con rollback, porque cada petición hace su propio commit.

### Frontend (`frontend/src/app`)
- Angular 19 con componentes standalone, signals, control flow nuevo e `inject()`. Prohibido: Angular Material/CDK, PrimeNG, Tailwind y Bootstrap. El drag & drop usa la API nativa de HTML5.
- `core/`: modelos del contrato, un servicio HTTP por recurso, interceptores (`auth` añade el Bearer a `/api/`; `error` cierra la sesión ante un 401 y muestra un toast con el `detail`) y guards.
- El tablero usa `BoardStore` (signals), provisto en `BoardPageComponent`, con actualizaciones optimistas que se revierten si la API falla. La lógica pura está en `features/board/board.logic.ts`.
- Pruebas: unitarias e integración simulan solo la red con `HttpTestingController`. El e2e usa el stack real y borra el usuario que crea.

## Documentación

Cada proyecto tiene `docs/` (ARCHITECTURE, TESTING y, según el caso, API, DATA_DICTIONARY o ER). `docs/arquitectura.html` es la visión general y `docs/VALIDATION.md` el informe de validación con sus hallazgos. Si cambias el comportamiento, actualiza el `docs/` correspondiente y `docs/CONTRACT.md`.
