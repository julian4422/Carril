# Base de datos de Carril

Esquema PostgreSQL 16 definido en `docs/CONTRACT.md` (raíz del repo), que es la fuente de verdad.

## Contenido

| Ruta | Descripción |
|---|---|
| `ddl/001_extensions.sql` | `pgcrypto`, `citext` |
| `ddl/002_types.sql` | enum `task_priority` |
| `ddl/003_tables.sql` | tablas, CHECKs, FKs, UNIQUE diferibles, comentarios |
| `ddl/004_indexes.sql` | 10 índices: uno por FK, más `(owner_id, created_at DESC)` parcial y `(task_id, created_at)` |
| `ddl/005_triggers.sql` | función `set_updated_at()` y triggers |
| `seed/001_demo.sql` | usuario `demo@carril.dev` / `demo1234` y el tablero "Lanzamiento v1" (ver [Seed de demo](#seed-de-demo)) |
| `init/00_init.sh` | init del contenedor: crea `$POSTGRES_TEST_DB` (si está definido), aplica DDL a la principal y a la de pruebas y, salvo con `CARRIL_SEED=0`, el seed solo a la principal |
| `tests/` | pruebas pytest (`unit`, `integration`, `e2e`) |

El DDL y el seed son reejecutables (`IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT`), pero el DDL no es una migración: si una tabla ya existe no se altera. Un cambio de esquema en una BD con datos exige un `ALTER` manual (o recrear el volumen en desarrollo).

## Levantar

Desde la raíz del repo:

```bash
docker compose up -d db      # primera vez: el init crea carril_test (si `POSTGRES_TEST_DB` está definido) y aplica DDL + seed (CARRIL_SEED=1 por defecto)
docker compose down -v       # borra el volumen (pgdata) para reinicializar desde cero
```

El init solo corre con el volumen vacío. Para reaplicar a mano: `docker compose exec -T db psql -U carril -d carril -f /carril/ddl/003_tables.sql`.

### Qué hace `init/00_init.sh`

Corre una sola vez, con `set -euo pipefail` y `ON_ERROR_STOP=1` (un fallo aborta el arranque):

1. Si `$POSTGRES_TEST_DB` (`carril_test` en el compose de desarrollo) está definido y no vacío, la crea si no existe. Si está vacío o sin definir, no se crea ninguna BD de pruebas.
2. Aplica `/carril/ddl/*.sql`, en orden alfabético, a `$POSTGRES_DB` (`carril`) y, si existe, a `$POSTGRES_TEST_DB`.
3. Aplica `/carril/seed/*.sql` **solo** a `$POSTGRES_DB`, salvo que `CARRIL_SEED=0`: entonces imprime `[carril] seed omitido (CARRIL_SEED=0)` y no carga nada. Usa `nullglob`: si `seed/` no tiene archivos, no falla.

En producción (ver [`backend/docs/DEPLOYMENT.md`](../../backend/docs/DEPLOYMENT.md)) no se define `POSTGRES_TEST_DB`: el init deja solo la BD `carril`.

`CARRIL_SEED` (por defecto `1`) llega al servicio `db` desde `docker-compose.yml` y se documenta en `.env.example`.

## Seed de demo

Con `CARRIL_SEED=1` (valor por defecto) el init carga `seed/001_demo.sql` en la BD principal; con `CARRIL_SEED=0` se omite y la BD queda sin usuarios. Lo que crea:

| Tabla | Filas |
|---|---|
| `users` | 1 (`demo@carril.dev` / `demo1234`, hash bcrypt) |
| `boards` | 1 ("Lanzamiento v1") |
| `board_columns` | 3 ("Por hacer", "En curso", "Hecho") |
| `tasks` | 8 (las fechas límite son relativas a `current_date` del momento del init) |
| `labels` | 3 ("Backend", "Frontend", "Diseño") |
| `task_labels` | 7 |
| `task_comments` | 4 |

Implicaciones para producción:

- Con el valor por defecto, un primer arranque deja en la BD real un usuario con credenciales públicas (`demo@carril.dev` / `demo1234`). En producción define `CARRIL_SEED=0` antes del primer arranque.
- Si el seed ya se cargó, borra al usuario demo: `DELETE FROM users WHERE email = 'demo@carril.dev'` elimina también su tablero y todo lo que cuelga (CASCADE).
- Cambiar `CARRIL_SEED`, el compose o el seed después del primer arranque no tiene efecto: el init no vuelve a correr con un volumen con datos. Para aplicarlo hay que `docker compose down -v`, que borra los datos.

Pasos de despliegue y recomendaciones: [`backend/docs/DEPLOYMENT.md`](../../backend/docs/DEPLOYMENT.md) (ahí se indica usar `CARRIL_SEED=0` en producción).

## Backup y restore

Con el contenedor `db` arriba, desde la raíz del repo. `sh -c` hace que `$POSTGRES_USER` y `$POSTGRES_DB` se resuelvan dentro del contenedor, así que sirve con cualquier valor de `.env`. Se usa `-T` para que la redirección no se corrompa con un TTY.

```bash
# Backup (SQL plano o formato custom comprimido)
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' > carril_$(date +%F).sql
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc -d "$POSTGRES_DB"' > carril_$(date +%F).dump

# Restore: detén la API para que no haya conexiones abiertas
docker compose stop api
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < carril_2026-01-01.sql
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < carril_2026-01-01.dump
docker compose start api
```

- Usa el `.sql` (con `--clean --if-exists`, que antepone los `DROP`) o el `.dump`, no los dos.
- El restore sobre una BD con datos reemplaza las tablas del respaldo. Para probar sin riesgo, restaura en otra BD: `docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE carril_restore"'` y usa `-d carril_restore`.
- Para una BD vacía (volumen nuevo) basta con levantar `db` y restaurar; el init ya habrá creado el esquema (y el seed, si `CARRIL_SEED=1`), y `--clean` los sustituye.
- El respaldo cubre solo la BD principal. `carril_test` (solo en desarrollo) se recrea con el init y no lo necesita.
- Guarda los respaldos fuera del volumen `pgdata`: `docker compose down -v` lo borra.

## Pruebas

```bash
cd database
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest -m unit
.venv/bin/pytest -m integration
.venv/bin/pytest -m e2e
```

Requieren el contenedor `db` arriba en localhost (puerto `POSTGRES_PORT`, 5432 por defecto); leen credenciales de `../.env` y, si faltan, usan `carril`/`carril`. Hoy: 71 pruebas (63 `unit`, 5 `integration`, 3 `e2e`). Ver [TESTING.md](TESTING.md).

## Otros documentos

[DATA_DICTIONARY.md](DATA_DICTIONARY.md) · [ER.md](ER.md) · [TESTING.md](TESTING.md)

## Notas

- Las UNIQUE de posición son `DEFERRABLE INITIALLY DEFERRED`: reordene en una transacción. Postgres no admite `ON CONFLICT` genérico sobre ellas (use `ON CONFLICT (id)`).
- Un `UPDATE` de posiciones que haga swap solo se valida al `COMMIT`.
- `idx_board_columns_board_pos` e `idx_tasks_column_pos` duplican los índices de las UNIQUE `(board_id, position)` y `(column_id, position)`. Se mantienen por claridad; los índices de PK/UNIQUE son implícitos.
- El esquema es el del contrato: [`docs/CONTRACT.md`](../../docs/CONTRACT.md). Si algo cambia, se actualiza primero ahí.
