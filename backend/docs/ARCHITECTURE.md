# Arquitectura

## Capas

```
routers (app/api/v1/routers)   HTTP: parseo, códigos de estado, sin lógica
   v
services (app/services)        reglas de negocio, autorización por dueño, reordenamiento, commit
   v
repositories (app/repositories) consultas SQLAlchemy; devuelven objetos ORM
   v
db (app/db)                    modelos, engine/sesión, UnitOfWork
```

Soporte: `app/core` (config con pydantic-settings, `security` con bcrypt y JWT, `errors` con errores de dominio),
`app/schemas` (Pydantic v2, idénticos a los tipos de `docs/CONTRACT.md`), `app/api/deps.py` (cableado de dependencias).

Regla de dependencias: los routers solo conocen servicios y schemas; los servicios reciben repositorios y un
`UnitOfWork` por constructor (por eso se prueban con repositorios falsos); solo los repositorios escriben SQL.

## Mapa de módulos

| Carpeta (`app/`) | Qué vive ahí |
|---|---|
| `main.py` | `create_app()`: registra middlewares, manejadores de errores y el router; `lifespan` libera el engine al apagar |
| `core/` | `config.py` (`Settings`, `get_settings` cacheada, validación de `JWT_SECRET`), `security.py`, `errors.py` |
| `api/` | `deps.py` (cableado); `v1/__init__.py` monta el prefijo `/api/v1`; `v1/routers/` un archivo por recurso (`auth`, `boards`, `columns`, `tasks`, `labels`, `health`) |
| `services/` | un servicio por recurso (`auth_service`, `board_service`, `column_service`, `task_service`, `label_service`, `comment_service`) y `ordering.py` |
| `repositories/` | todo el SQL: `boards`, `columns`, `tasks`, `labels`, `comments`, `users` |
| `db/` | `models.py` (ORM, `lazy="raise"`), `session.py` (engine, sesión por petición), `uow.py` |
| `schemas/` | modelos Pydantic de entrada y salida (`auth`, `boards`, `tasks`, `labels`, `common`) |

| Pieza | Archivo | Qué hace |
|---|---|---|
| Cableado de dependencias | `api/deps.py` | `get_session` -> repositorios -> servicio (`get_*_service`); `get_current_user` (Bearer) y alias `CurrentUser`, `*ServiceDep` |
| Unidad de trabajo | `db/uow.py` | `UnitOfWork(session)` con `commit()` y `rollback()`; los servicios deciden cuándo confirmar |
| Sesión y engine | `db/session.py` | engine perezoso con `pool_pre_ping=True`, `expire_on_commit=False`; `get_session` es la dependencia que las pruebas de integración sustituyen |
| Reordenamiento | `services/ordering.py` | funciones puras: `clamp_position`, `insert_at`, `remove_item`, `move_within`, `move_between`, `same_members`, `renumber` |
| Errores | `core/errors.py` | `DomainError` y subclases (`NotFoundError` 404, `ConflictError` 409, `UnauthorizedError` 401, `ValidationError` 422), `register_error_handlers`, `UnhandledErrorMiddleware` |
| Seguridad | `core/security.py` | `hash_password`/`verify_password` (bcrypt), `create_access_token`/`decode_access_token` (JWT) |
| Configuración | `core/config.py` | variables `DATABASE_URL`, `JWT_SECRET`, `JWT_ALGORITHM` (`HS256`), `JWT_EXPIRES_MINUTES`, `CORS_ORIGINS`, `BCRYPT_ROUNDS`; no lee `.env` (`env_file=None`); si la validación falla, `get_settings()` sale con `SystemExit` y `[carril] Configuración inválida: <VARIABLE>: <motivo>`, sin traza ni el valor recibido |

## Flujo de una petición

1. `HTTPBearer` extrae el token; `get_current_user` lo valida (`AuthService.authenticate`) y carga el usuario (401 si falla).
2. FastAPI construye la sesión (`get_session`, una por petición), los repositorios y el servicio.
3. El servicio busca el recurso **filtrando por dueño** en la propia consulta (join hasta `boards.owner_id`):
   un recurso inexistente o ajeno produce el mismo `NotFoundError` -> 404, sin filtrar su existencia.
4. El servicio aplica reglas, muta objetos ORM y llama `uow.commit()`.
5. Tras el commit, el servicio relee el recurso (`populate_existing`, con etiquetas y `comment_count`) y devuelve el schema.
6. Los `DomainError` se traducen a `{"detail": "..."}` con su código (401, 404, 409, 422). La validación de Pydantic produce el 422 estándar.
   Cualquier otra excepción da 500 JSON, o 503 si es de conexión a la BD (ver Middlewares).

## Middlewares

`create_app()` (`app/main.py`) los registra con `add_middleware`, que apila hacia fuera: el último añadido es el más externo.
De fuera hacia dentro:

```
ServerErrorMiddleware (Starlette)   respaldo: solo ve errores de los propios middlewares
  GZipMiddleware                    comprime respuestas >= 1000 bytes si el cliente acepta gzip
    CORSMiddleware                  cabeceras CORS para los orígenes de CORS_ORIGINS; responde los preflight
      UnhandledErrorMiddleware      (app/core/errors.py) excepción no controlada -> 500 {"detail":"Error interno"}
        ExceptionMiddleware         DomainError, IntegrityError (409), OperationalError/InterfaceError/OSError (503), 422
          routers
```

Por qué este orden:

- Starlette atiende el manejador de `Exception` en `ServerErrorMiddleware`, por fuera de CORS, así que ese 500 salía sin
  `Access-Control-Allow-Origin` y el navegador lo veía como error de red. `UnhandledErrorMiddleware`, dentro de CORS, registra la
  excepción con `logger.exception` y la convierte en el 500 JSON antes de que salga: CORS y GZip la tratan como cualquier otra
  respuesta. Si la respuesta ya había empezado a enviarse, vuelve a lanzar la excepción.
- Los 4xx y el 503 ya se resolvían en `ExceptionMiddleware`, que queda dentro de CORS.
- GZip va por fuera de CORS para comprimir también los errores. Cada uno añade su valor a `Vary` (`Accept-Encoding`, `Origin`).

Antes de la app, Uvicorn aplica los `X-Forwarded-*` (`--proxy-headers` y `FORWARDED_ALLOW_IPS`, por defecto `127.0.0.1` en la
imagen): con un proxy de confianza, `request.url.scheme` es `https` y `request.client` es la IP real del cliente.

## Transacciones y reordenamiento

- El commit es explícito en el servicio (una operación de negocio = una transacción). Si hay una excepción, la sesión se cierra y se revierte.
- Las UNIQUE `(board_id, position)` y `(column_id, position)` son `DEFERRABLE INITIALLY DEFERRED`: dentro de la transacción las
  posiciones pueden pasar por estados duplicados y solo se validan al `COMMIT`.
- Las reglas son funciones puras en `app/services/ordering.py` (`move_within`, `move_between`, `clamp_position`, `renumber`).
  El servicio carga la lista ordenada, calcula el nuevo orden y `renumber` reasigna `0..n-1` solo donde cambia.
- Mover: `position` se acota a `0..n` (n = tamaño del destino sin la tarea). Misma columna: quitar e insertar. Otra columna:
  se compacta el origen y se inserta en el destino (debe ser del mismo tablero: 422; ajena: 404).
- Borrar columna/tarea: borrado por SQL (las FK hacen CASCADE) y compactación inmediata de los hermanos.
- Reordenar columnas: `column_ids` debe ser exactamente el conjunto de columnas del tablero (sin repetidos), si no 422.

- **Concurrencia:** antes de leer posiciones, los servicios bloquean la fila del tablero (`BoardRepository.lock`, `SELECT ... FOR UPDATE`)
  en crear/mover/borrar tareas y columnas y en el reorder; tras el bloqueo vuelven a resolver los recursos (pudieron borrarse mientras esperaban).
  Un único candado por tablero evita interbloqueos.

## Rendimiento

- `GET /boards/{id}` usa `selectinload` encadenado (columnas -> tareas -> etiquetas, y etiquetas del tablero): número constante de consultas.
- `comment_count` es un `column_property` (subconsulta escalar en el mismo SELECT de tareas); `column_count`/`task_count` de `GET /boards` se calculan con subconsultas en una sola consulta.
- Las relaciones ORM usan `lazy="raise"` para detectar cualquier carga perezosa accidental (en async fallaría).

## Autenticación

- Registro: bcrypt directo (sin passlib; se trunca a 72 bytes, límite del algoritmo). Email `citext`: único sin distinguir mayúsculas.
- Login devuelve JWT HS256 con `sub` = id de usuario, `iat`, `exp`. Se exige `exp` y `sub`; expirado, firma inválida o malformado -> 401.
- En login con email inexistente se hace igualmente una verificación bcrypt para igualar tiempos.
- El esquema vive solo en `database/ddl`; el backend no usa Alembic ni `create_all`.
