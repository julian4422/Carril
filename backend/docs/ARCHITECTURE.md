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

## Flujo de una petición

1. `HTTPBearer` extrae el token; `get_current_user` lo valida (`AuthService.authenticate`) y carga el usuario (401 si falla).
2. FastAPI construye la sesión (`get_session`, una por petición), los repositorios y el servicio.
3. El servicio busca el recurso **filtrando por dueño** en la propia consulta (join hasta `boards.owner_id`):
   un recurso inexistente o ajeno produce el mismo `NotFoundError` -> 404, sin filtrar su existencia.
4. El servicio aplica reglas, muta objetos ORM y llama `uow.commit()`.
5. Tras el commit, el servicio relee el recurso (`populate_existing`, con etiquetas y `comment_count`) y devuelve el schema.
6. Los `DomainError` se traducen a `{"detail": "..."}` con su código (401, 404, 409, 422). La validación de Pydantic produce el 422 estándar.

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
