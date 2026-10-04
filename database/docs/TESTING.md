# Estrategia de pruebas

Pytest + psycopg 3 contra el Postgres de Compose (localhost, variables de `../.env`, cargadas en `tests/conftest.py`).

## Aislamiento

Cada sesión de pytest crea una BD temporal `carril_dbtest_<random>`, le aplica `ddl/*.sql` y la borra al final. No se ensucian `carril` ni `carril_test`. Las pruebas unitarias y e2e usan una conexión con transacción que se revierte al terminar cada prueba; las de integración que aplican DDL/seed usan una BD temporal propia (`scratch_db`).

## Suites

| Marker | Carpeta | Cubre |
|---|---|---|
| `unit` | `tests/unit/` | una prueba por restricción: email único y case-insensitive, FKs, enum, CHECK de color y longitudes, `position >= 0`, `wip_limit > 0`, UNIQUE de posiciones, swap en transacción gracias a UNIQUE diferible, trigger `updated_at`, defaults, SET NULL/CASCADE |
| `integration` | `tests/integration/` | DDL en orden, idempotencia (2 aplicaciones), seed dos veces con conteos, catálogo (`information_schema`/`pg_catalog`: tablas, columnas, FKs, índices, triggers, extensiones), y los contenedores reales `carril`/`carril_test` |
| `e2e` | `tests/e2e/` | flujo registrar → tablero → columnas → tareas → mover/reordenar → etiquetar → comentar → borrar tablero (cascada); borrado de usuario (CASCADE/SET NULL) |

## Ejecutar

```bash
cd database
.venv/bin/pytest -m unit
.venv/bin/pytest -m integration
.venv/bin/pytest -m e2e
.venv/bin/pytest            # todo
```

## Notas

- Postgres omite la comprobación de FK en filas creadas en la misma transacción; para probar `DELETE FROM users` con SET NULL + CASCADE sobre las mismas filas, la prueba confirma (`commit`) el setup y limpia al final.
- Para probar UNIQUE diferibles se usa `SET CONSTRAINTS ALL IMMEDIATE` o se comprueba al `COMMIT`.
