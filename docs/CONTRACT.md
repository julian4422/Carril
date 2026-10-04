# Carril: contrato compartido

Este archivo es la fuente de verdad entre `database/`, `backend/` y `frontend/`. Si un proyecto necesita cambiarlo, lo decide el orquestador.

## Infraestructura

- `docker-compose.yml` (raíz) levanta `db` (postgres:16-alpine) y `api` (build `./backend`).
- Variables en `.env` (plantilla `.env.example`). Valores locales por defecto: usuario/clave/BD `carril`/`carril`/`carril`, BD de pruebas `carril_test`, puertos 5432 (Postgres), 8000 (API), 4200 (Angular, fuera de Docker).
- Postgres monta `database/init` en `/docker-entrypoint-initdb.d`, `database/ddl` en `/carril/ddl` y `database/seed` en `/carril/seed`. `database/init/00_init.sh` crea `$POSTGRES_TEST_DB`, aplica `ddl/*.sql` en orden a ambas BD y `seed/*.sql` solo a la principal.
- La API corre en el contenedor con `DATABASE_URL=postgresql+asyncpg://...@db:5432/carril`, `JWT_SECRET` (obligatorio, ≥ 32 caracteres; la API no arranca con un secreto vacío, corto o de ejemplo), `JWT_EXPIRES_MINUTES`, `CORS_ORIGINS` (lista separada por comas).
- El frontend usa `proxy.conf.json`: `/api` → `http://localhost:8000`.

## Esquema (PostgreSQL 16)

Extensiones: `pgcrypto`, `citext`. PK UUID `DEFAULT gen_random_uuid()`. Timestamps `timestamptz NOT NULL DEFAULT now()`.

```
TYPE task_priority AS ENUM ('low','medium','high','urgent')

users         (id, email citext UNIQUE NOT NULL, full_name text NOT NULL (1..120),
               password_hash text NOT NULL, created_at, updated_at)
boards        (id, owner_id → users ON DELETE CASCADE NOT NULL, name text NOT NULL (1..120),
               description text NULL, color text NOT NULL DEFAULT '#0f6e63' CHECK ~ '^#[0-9a-fA-F]{6}$',
               archived_at timestamptz NULL, created_at, updated_at)
board_columns (id, board_id → boards ON DELETE CASCADE NOT NULL, name text NOT NULL (1..60),
               position int NOT NULL CHECK >= 0, wip_limit int NULL CHECK > 0, created_at, updated_at,
               UNIQUE (board_id, position) DEFERRABLE INITIALLY DEFERRED)
tasks         (id, column_id → board_columns ON DELETE CASCADE NOT NULL, title text NOT NULL (1..200),
               description text NULL, priority task_priority NOT NULL DEFAULT 'medium', due_date date NULL,
               position int NOT NULL CHECK >= 0, assignee_id → users ON DELETE SET NULL NULL,
               created_by → users ON DELETE SET NULL NULL, created_at, updated_at,
               UNIQUE (column_id, position) DEFERRABLE INITIALLY DEFERRED)
labels        (id, board_id → boards ON DELETE CASCADE NOT NULL, name text NOT NULL (1..40),
               color text NOT NULL CHECK ~ '^#[0-9a-fA-F]{6}$', created_at, UNIQUE (board_id, name))
task_labels   (task_id → tasks ON DELETE CASCADE, label_id → labels ON DELETE CASCADE, PRIMARY KEY (task_id, label_id))
task_comments (id, task_id → tasks ON DELETE CASCADE NOT NULL, author_id → users ON DELETE SET NULL NULL,
               body text NOT NULL (1..2000), created_at, updated_at)
```

Trigger `set_updated_at()` BEFORE UPDATE en toda tabla con `updated_at`. Las posiciones son base 0 y contiguas dentro de su padre; quien reordena lo hace en una transacción (las UNIQUE son diferibles para permitirlo).

## API REST `/api/v1`

JSON, UUID como string, fechas ISO 8601 (`due_date` como `YYYY-MM-DD`). Auth: `Authorization: Bearer <jwt>` en todo excepto `POST /auth/register`, `POST /auth/login` y `GET /health`. Sin token o token inválido → 401. Recurso inexistente o de otro usuario → 404. Errores: `{"detail": "mensaje"}`; validación: 422 con el formato estándar de FastAPI.

### Tipos

```ts
UserOut      { id, email, full_name, created_at }
TokenOut     { access_token, token_type: "bearer", expires_in: number /*segundos*/, user: UserOut }
LabelOut     { id, board_id, name, color }
TaskOut      { id, column_id, title, description: string|null, priority: "low"|"medium"|"high"|"urgent",
               due_date: string|null, position, assignee_id: string|null, labels: LabelOut[],
               comment_count: number, created_at, updated_at }
ColumnOut    { id, board_id, name, position, wip_limit: number|null, tasks: TaskOut[] /*por position*/ }
BoardSummary { id, name, description: string|null, color, created_at, updated_at, column_count, task_count }
BoardDetail  { id, name, description: string|null, color, created_at, updated_at,
               columns: ColumnOut[] /*por position*/, labels: LabelOut[] /*por name*/ }
CommentOut   { id, task_id, author: { id, full_name } | null, body, created_at }
```

### Endpoints

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | /auth/register | `{email, full_name, password}` (password ≥ 8) | 201 UserOut · 409 email ya registrado |
| POST | /auth/login | `{email, password}` (JSON) | 200 TokenOut · 401 credenciales inválidas |
| GET | /auth/me | | 200 UserOut |
| GET | /boards | | 200 BoardSummary[] (no archivados, `created_at` desc) |
| POST | /boards | `{name, description?, color?}` | 201 BoardDetail; crea columnas "Por hacer", "En curso", "Hecho" (posiciones 0,1,2) |
| GET | /boards/{id} | | 200 BoardDetail |
| PATCH | /boards/{id} | `{name?, description?, color?}` | 200 BoardDetail |
| DELETE | /boards/{id} | | 204 |
| POST | /boards/{id}/columns | `{name, wip_limit?}` | 201 ColumnOut (al final, `tasks: []`) |
| PUT | /boards/{id}/columns/order | `{column_ids: string[]}` (exactamente todas las del tablero) | 200 ColumnOut[] · 422 si el conjunto no coincide |
| PATCH | /columns/{id} | `{name?, wip_limit?}` (`wip_limit: null` lo quita) | 200 ColumnOut |
| DELETE | /columns/{id} | | 204 (borra sus tareas y compacta posiciones) |
| POST | /columns/{id}/tasks | `{title, description?, priority?, due_date?, assignee_id?}` | 201 TaskOut (al final de la columna) |
| GET | /tasks/{id} | | 200 TaskOut |
| PATCH | /tasks/{id} | `{title?, description?, priority?, due_date?, assignee_id?}` | 200 TaskOut |
| DELETE | /tasks/{id} | | 204 (compacta posiciones) |
| POST | /tasks/{id}/move | `{column_id, position}` | 200 TaskOut; columna inexistente o de otro usuario → 404; columna propia de otro tablero → 422; `position` se acota a `0..n` |
| PUT | /tasks/{id}/labels | `{label_ids: string[]}` | 200 TaskOut; cualquier etiqueta que no sea de este tablero (inexistente, ajena u otro tablero) → 422 |
| GET | /boards/{id}/labels | | 200 LabelOut[] |
| POST | /boards/{id}/labels | `{name, color}` | 201 LabelOut · 409 nombre repetido en el tablero |
| DELETE | /labels/{id} | | 204 |
| GET | /tasks/{id}/comments | | 200 CommentOut[] (`created_at` asc) |
| POST | /tasks/{id}/comments | `{body}` | 201 CommentOut |
| GET | /health | | 200 `{status:"ok", database:"ok"}` · 503 `{status:"error", database:"error"}` si la BD no responde |

`assignee_id`, si viene, solo puede ser el dueño del tablero (no hay tableros compartidos en v1); otro valor → 422.

## Reglas añadidas tras la validación (v1.1)

- Crear, mover o borrar tareas y columnas en paralelo sobre el mismo padre no debe dar 500: el servicio bloquea la fila padre (`SELECT ... FOR UPDATE` sobre la columna o el tablero) antes de recalcular posiciones; si aun así hay `IntegrityError`, responde 409 `{"detail": ...}`.
- Todo error no controlado responde JSON `{"detail": "Error interno"}` con 500 (o 503 si la BD no está disponible), nunca texto plano.
- Campos de texto obligatorios (`name`, `title`, `body`, `full_name`) se recortan con `strip()` y no pueden quedar vacíos (422).
- El límite WIP es informativo: se guarda y el frontend lo marca, pero la API no bloquea por él.
