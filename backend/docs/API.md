# API `/api/v1`

Fuente de verdad del contrato: `docs/CONTRACT.md` (raíz). Swagger interactivo en `/docs`.
JSON, UUID como string, fechas ISO 8601 (`due_date` = `YYYY-MM-DD`). Autenticación `Authorization: Bearer <jwt>` en todo salvo
`/auth/register`, `/auth/login` y `/health`.

## Errores

| Código | Cuándo | Cuerpo |
|---|---|---|
| 401 | sin token, inválido o expirado; credenciales inválidas | `{"detail": "No autenticado"}` |
| 404 | recurso inexistente **o de otro usuario** | `{"detail": "Tablero no encontrado"}` |
| 409 | email ya registrado; etiqueta repetida en el tablero; conflicto de BD (`IntegrityError`) residual | `{"detail": "El email ya está registrado"}` |
| 422 | validación (formato estándar de FastAPI) o regla de negocio | `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}` o `{"detail": "..."}` |
| 500 | error no controlado | `{"detail": "Error interno"}` (siempre JSON) |
| 503 | `/health` sin BD; cualquier endpoint si la BD no está disponible | `/health`: `{"status":"error","database":"error"}`; resto: `{"detail": "Base de datos no disponible"}` |

## Endpoints

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | /auth/register | `{email, full_name, password>=8}` | 201 UserOut · 409 · 422 |
| POST | /auth/login | `{email, password}` | 200 TokenOut · 401 |
| GET | /auth/me | | 200 UserOut |
| GET | /boards | | 200 BoardSummary[] (no archivados, `created_at` desc) |
| POST | /boards | `{name, description?, color?}` | 201 BoardDetail (columnas Por hacer / En curso / Hecho) |
| GET | /boards/{id} | | 200 BoardDetail |
| PATCH | /boards/{id} | `{name?, description?, color?}` | 200 BoardDetail |
| DELETE | /boards/{id} | | 204 |
| POST | /boards/{id}/columns | `{name, wip_limit?}` | 201 ColumnOut (al final) |
| PUT | /boards/{id}/columns/order | `{column_ids}` | 200 ColumnOut[] · 422 si no coincide |
| PATCH | /columns/{id} | `{name?, wip_limit?}` (`null` quita el límite) | 200 ColumnOut |
| DELETE | /columns/{id} | | 204 (borra tareas y compacta) |
| POST | /columns/{id}/tasks | `{title, description?, priority?, due_date?, assignee_id?}` | 201 TaskOut |
| GET | /tasks/{id} | | 200 TaskOut |
| PATCH | /tasks/{id} | campos opcionales | 200 TaskOut |
| DELETE | /tasks/{id} | | 204 (compacta) |
| POST | /tasks/{id}/move | `{column_id, position}` | 200 TaskOut · 422 otro tablero |
| PUT | /tasks/{id}/labels | `{label_ids}` | 200 TaskOut · 422 |
| GET | /boards/{id}/labels | | 200 LabelOut[] |
| POST | /boards/{id}/labels | `{name, color}` | 201 LabelOut · 409 |
| DELETE | /labels/{id} | | 204 |
| GET | /tasks/{id}/comments | | 200 CommentOut[] (asc) |
| POST | /tasks/{id}/comments | `{body}` | 201 CommentOut |
| GET | /health | | 200 `{"status":"ok","database":"ok"}` · 503 |

Notas: en los PATCH, un campo ausente no cambia; `null` explícito borra `description`, `due_date`, `assignee_id`, `wip_limit`
(`name`, `title`, `priority`, `color` no admiten null: 422). `assignee_id` solo puede ser el dueño del tablero (422 si no).
`position` en `move` se acota a `0..n`. Mover a una columna ajena o inexistente da 404; a una columna propia de otro tablero, 422.

## Ejemplos

```bash
curl -X POST localhost:8000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"ana@ejemplo.dev","full_name":"Ana","password":"secret123"}'
# 201 {"id":"6f1c...","email":"ana@ejemplo.dev","full_name":"Ana","created_at":"2026-10-02T20:00:00Z"}

curl -X POST localhost:8000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"ana@ejemplo.dev","password":"secret123"}'
# 200 {"access_token":"eyJ...","token_type":"bearer","expires_in":43200,"user":{...}}
```

Crear tablero y tarea:

```bash
curl -X POST localhost:8000/api/v1/boards -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"name":"Sprint 1","color":"#2563eb"}'
# 201 {"id":"...","name":"Sprint 1","description":null,"color":"#2563eb","created_at":"...","updated_at":"...",
#      "columns":[{"id":"...","board_id":"...","name":"Por hacer","position":0,"wip_limit":null,"tasks":[]}, ...],
#      "labels":[]}

curl -X POST localhost:8000/api/v1/columns/$COL/tasks -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"title":"Diseñar login","priority":"high","due_date":"2026-11-01"}'
# 201 {"id":"...","column_id":"...","title":"Diseñar login","description":null,"priority":"high","due_date":"2026-11-01",
#      "position":0,"assignee_id":null,"labels":[],"comment_count":0,"created_at":"...","updated_at":"..."}
```

Mover una tarea y errores típicos:

```bash
curl -X POST localhost:8000/api/v1/tasks/$TASK/move -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"column_id":"<otra columna>","position":0}'        # 200 TaskOut con column_id y position nuevos
# 401 {"detail":"No autenticado"}                           (sin token)
# 404 {"detail":"Tarea no encontrada"}                      (inexistente o de otro usuario)
# 409 {"detail":"Ya existe una etiqueta con ese nombre en el tablero"}
# 422 {"detail":"La columna destino debe pertenecer al mismo tablero"}
```

Comentario: `POST /tasks/{id}/comments {"body":"Listo"}` -> `201 {"id":"...","task_id":"...","author":{"id":"...","full_name":"Ana"},"body":"Listo","created_at":"..."}`
(`author` es `null` si el usuario fue eliminado).

## Reglas v1.1

- **404 frente a 422.** `POST /tasks/{id}/move`: columna destino inexistente o de otro usuario -> 404; columna propia de otro tablero -> 422.
  `PUT /tasks/{id}/labels`: cualquier etiqueta que no sea de este tablero (inexistente, ajena o de otro tablero) -> 422.
  Ninguna de las dos respuestas revela si el recurso ajeno existe.
- **Concurrencia.** Crear, mover o borrar tareas y columnas y reordenar columnas bloquean la fila del tablero (`SELECT ... FOR UPDATE`)
  antes de calcular posiciones, así que peticiones paralelas se serializan y las posiciones quedan contiguas. Un `IntegrityError`
  residual responde 409 `{"detail": ...}`, nunca 500.
- **Errores.** Todo error no controlado es JSON: 500 `{"detail":"Error interno"}`; 503 `{"detail":"Base de datos no disponible"}`
  si falla la conexión a la BD.
- **Textos obligatorios** (`name`, `title`, `body`, `full_name`) se recortan con `strip()`; si quedan vacíos -> 422.
- **WIP** es informativo: se guarda pero la API no bloquea por él.
- **Arranque.** La API no arranca si `JWT_SECRET` falta, tiene menos de 32 caracteres o es un valor de ejemplo
  (`change-me-in-production`, `secret`, `changeme`). Genera uno con `openssl rand -hex 32`.

## Reglas v1.2 (móvil)

No cambian endpoints ni tipos; estos cambios son transparentes para el cliente.

- **Compresión.** Las respuestas de 1000 bytes o más se comprimen con GZip si la petición envía `Accept-Encoding: gzip`
  (`Content-Encoding: gzip` y `Vary: Accept-Encoding`). Las más pequeñas salen sin comprimir. Aplica también a las respuestas de error.
- **CORS en errores.** Todas las respuestas, incluidas 500 y 503, llevan `Access-Control-Allow-Origin` cuando el `Origin` de la
  petición está en `CORS_ORIGINS`, así que el navegador puede leer el `detail`. Con un origen no permitido, o sin `Origin`, no se envía ninguna cabecera CORS.
- **Proxy inverso.** Detrás de un proxy HTTPS, la API respeta `X-Forwarded-Proto` y `X-Forwarded-For` si la IP del proxy está en
  `FORWARDED_ALLOW_IPS`. Ver [DEPLOYMENT.md](DEPLOYMENT.md).
