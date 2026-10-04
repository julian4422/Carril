# Base de datos de Carril

Esquema PostgreSQL 16 definido en `docs/CONTRACT.md` (raíz del repo), que es la fuente de verdad.

## Contenido

| Ruta | Descripción |
|---|---|
| `ddl/001_extensions.sql` | `pgcrypto`, `citext` |
| `ddl/002_types.sql` | enum `task_priority` |
| `ddl/003_tables.sql` | tablas, CHECKs, FKs, UNIQUE diferibles, comentarios |
| `ddl/004_indexes.sql` | índices en FKs y `(column_id, position)`, `(board_id, position)` |
| `ddl/005_triggers.sql` | función `set_updated_at()` y triggers |
| `seed/001_demo.sql` | usuario `demo@carril.dev` / `demo1234`, tablero "Lanzamiento v1" |
| `init/00_init.sh` | init del contenedor: crea `$POSTGRES_TEST_DB`, aplica DDL a ambas BD y seed solo a la principal |
| `tests/` | pruebas pytest (`unit`, `integration`, `e2e`) |

Todo el DDL y el seed son reejecutables.

## Levantar

Desde la raíz del repo:

```bash
docker compose up -d db      # primera vez: el init crea carril_test y aplica DDL + seed
docker compose down -v       # borra el volumen para reinicializar desde cero
```

El init solo corre con el volumen vacío. Para reaplicar a mano: `docker compose exec -T db psql -U carril -d carril -f /carril/ddl/003_tables.sql`.

## Pruebas

```bash
cd database
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest -m unit
.venv/bin/pytest -m integration
.venv/bin/pytest -m e2e
```

Requieren el contenedor `db` arriba en localhost; leen credenciales de `../.env`. Ver [TESTING.md](TESTING.md).

## Otros documentos

[DATA_DICTIONARY.md](DATA_DICTIONARY.md) · [ER.md](ER.md) · [TESTING.md](TESTING.md)

## Notas

- Las UNIQUE de posición son `DEFERRABLE INITIALLY DEFERRED`: reordene en una transacción. Postgres no admite `ON CONFLICT` genérico sobre ellas (use `ON CONFLICT (id)`).
- Un `UPDATE` de posiciones que haga swap solo se valida al `COMMIT`.
