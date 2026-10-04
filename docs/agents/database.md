# Brief: agente `database/`

Eres el agente de codificación del proyecto `database/` de "Carril", un gestor de tareas Kanban. Raíz del repo: /Users/julianechavarria/Documents/Claude_project. Trabajas SOLO dentro de `database/` (no edites docker-compose.yml, docs/, backend/ ni frontend/; si algo del contrato te parece mal, repórtalo en tu respuesta final en vez de cambiarlo).

Lee primero: `docs/CONTRACT.md` (fuente de verdad del esquema), `docker-compose.yml` y `.env`. La arquitectura aprobada está en `docs/arquitectura.html`.

## Entregables

1. `database/init/00_init.sh` (bash, ejecutable, `set -euo pipefail`): corre dentro del contenedor postgres:16-alpine en `/docker-entrypoint-initdb.d`. Crea la BD `$POSTGRES_TEST_DB`, aplica `/carril/ddl/*.sql` en orden a `$POSTGRES_DB` y a `$POSTGRES_TEST_DB` con `psql -v ON_ERROR_STOP=1`, y aplica `/carril/seed/*.sql` solo a `$POSTGRES_DB`.
2. `database/ddl/`: `001_extensions.sql`, `002_types.sql`, `003_tables.sql`, `004_indexes.sql`, `005_triggers.sql`. Deben implementar EXACTAMENTE el esquema del contrato (nombres, tipos, nulabilidad, defaults, CHECKs con longitudes, FKs con su ON DELETE, UNIQUE diferibles). Todo reejecutable: `IF NOT EXISTS`, `CREATE OR REPLACE`, el enum con un bloque `DO` que ignore duplicate_object, triggers con `DROP TRIGGER IF EXISTS` antes. Índices en todas las FK y en `(column_id, position)`, `(board_id, position)` donde aporte. Comentarios `COMMENT ON` en tablas y columnas clave.
3. `database/seed/001_demo.sql`: usuario demo `demo@carril.dev` / contraseña `demo1234` (hash bcrypt real con prefijo `$2b$`, genéralo con Python `bcrypt` y pégalo), un tablero "Lanzamiento v1" con las 3 columnas por defecto ("Por hacer", "En curso", "Hecho"), ~8 tareas realistas en español con distintas prioridades y fechas, 3 etiquetas y algunos comentarios. Idempotente (`ON CONFLICT DO NOTHING` con UUIDs fijos).
4. Pruebas con pytest + psycopg 3, en `database/tests/`, con `database/requirements-dev.txt` y un venv local en `database/.venv` (Python 3.13 está instalado). Se conectan al Postgres de Compose en localhost usando las variables de `.env` (cárgalas en `conftest.py`). Para no ensuciar `carril` ni `carril_test`, cada sesión crea una BD temporal `carril_dbtest_<random>` y la borra al final.
   - `tests/unit/`: una prueba por restricción (email único y case-insensitive por citext, cada FK, enum inválido, CHECK de color, CHECK de longitudes, position < 0, wip_limit <= 0, UNIQUE de posiciones, que la UNIQUE diferible permite intercambiar posiciones dentro de una transacción, trigger de updated_at, defaults).
   - `tests/integration/`: aplicar todos los DDL en orden a una BD vacía, aplicarlos una segunda vez sin error (idempotencia), aplicar el seed dos veces y verificar conteos; verificar en `information_schema`/`pg_catalog` que existen todas las tablas, columnas, índices y triggers del contrato. Además, una prueba que confirme que en el contenedor real `carril_test` y `carril` tienen el esquema y que `carril` tiene el seed.
   - `tests/e2e/`: flujo completo en SQL: registrar usuario → crear tablero → 3 columnas → tareas → mover una tarea a otra columna reordenando posiciones en transacción → etiquetar → comentar → borrar el tablero y verificar la cascada; borrar el usuario y verificar SET NULL / CASCADE según el contrato.
   - Marca las pruebas con markers `unit`, `integration`, `e2e` registrados en `pytest.ini`.
5. Documentación en `database/docs/`: `README.md` (qué hay, cómo levantar, cómo correr cada suite), `DATA_DICTIONARY.md` (cada tabla y columna con tipo, nulabilidad, default, restricción y descripción), `ER.md` (diagrama mermaid erDiagram), `TESTING.md` (estrategia y cómo correr). Y un `database/README.md` corto que apunte a docs/.

## Verificación obligatoria antes de terminar

- Desde la raíz: `docker compose down -v`, luego `docker compose up -d db` (NO `up` a secas: el backend puede no tener Dockerfile todavía), espera healthy, y revisa `docker compose logs db` sin errores del init.
- Corre las tres suites y que pasen todas: `.venv/bin/pytest -m unit`, `-m integration`, `-m e2e`.
- Deja el contenedor `db` arriba y sano al terminar (el agente de backend lo usará).

Responde al final con: lista de archivos creados, salida resumida de las tres suites (número de pruebas pasadas), y cualquier desviación o duda sobre el contrato.
