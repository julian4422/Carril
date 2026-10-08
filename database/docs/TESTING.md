# Estrategia de pruebas

Pytest + psycopg 3 contra el Postgres de Compose (localhost, variables de `../.env`, cargadas en `tests/conftest.py`).

## Aislamiento

Cada sesión de pytest crea una BD temporal `carril_dbtest_<random>` (`temp_db`), le aplica `ddl/*.sql` (`schema_db`) y la borra al final (`DROP DATABASE ... WITH (FORCE)`). Las pruebas unitarias y e2e usan una conexión (`conn`/`db`) con transacción que se revierte al terminar cada prueba, salvo las que confirman a propósito (ver Notas). Las de integración que aplican DDL/seed usan una BD temporal vacía propia por prueba (`scratch_db`). Las únicas que tocan `carril` y `carril_test` lo hacen en solo lectura (`test_real_containers_schema`). Host, puerto y credenciales salen de `../.env` (`POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_TEST_DB`), con los valores locales por defecto si faltan.

## Suites

| Marker | Pruebas | Carpeta | Cubre |
|---|---|---|---|
| `unit` | 63 | `tests/unit/` | una prueba por restricción: email único y case-insensitive, FKs, enum, CHECK de color y longitudes, `position >= 0`, `wip_limit > 0`, UNIQUE de posiciones, swap en transacción gracias a UNIQUE diferible, trigger `updated_at`, defaults, SET NULL/CASCADE. Archivos: `test_constraints.py`, `test_triggers_defaults.py` |
| `integration` | 5 | `tests/integration/` | DDL en orden, idempotencia (2 aplicaciones), seed dos veces con conteos, catálogo (`information_schema`/`pg_catalog`: tablas, columnas, FKs, índices, triggers, extensiones), la contraseña del seed (bcrypt) y posiciones contiguas, y los contenedores reales `carril`/`carril_test` (esquema en ambas; seed en `carril`) |
| `e2e` | 3 | `tests/e2e/` | flujo registrar → tablero → columnas → tareas → mover/reordenar → etiquetar → comentar → borrar tablero (cascada); borrado de usuario (CASCADE/SET NULL); borrado de columna (cascada a tareas y comentarios) |

Total: 71 (`pytest --collect-only -q`); los `parametrize` cuentan como una prueba por caso. Todas las pruebas deben estar marcadas; `pytest.ini` define los tres markers y `testpaths = tests`.

## Ejecutar

```bash
cd database
.venv/bin/pytest -m unit
.venv/bin/pytest -m integration
.venv/bin/pytest -m e2e
.venv/bin/pytest            # todo (71)
```

Instalación del entorno: `python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt` (pytest, psycopg 3, python-dotenv, bcrypt). `test_real_containers_schema` espera el seed en `carril`, así que requiere `CARRIL_SEED=1`. `integration` y `e2e` fallan si el contenedor `db` no está arriba o si faltan `carril`/`carril_test` (volumen creado sin el init, o sin `POSTGRES_TEST_DB`, como en producción).

## Notas

- Postgres omite la comprobación de FK en filas creadas en la misma transacción; para probar `DELETE FROM users` con SET NULL + CASCADE sobre las mismas filas, la prueba confirma (`commit`) el setup y limpia al final.
- Para probar UNIQUE diferibles se usa `SET CONSTRAINTS ALL IMMEDIATE` o se comprueba al `COMMIT`.
- `test_delete_user_cascade_and_set_null` hace `commit` y limpia sus filas al final; trabaja en la BD temporal de la sesión, nunca en `carril`.
