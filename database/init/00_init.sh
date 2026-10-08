#!/usr/bin/env bash
# Init de Carril: corre una sola vez (volumen vacío) dentro de postgres:16-alpine.
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER")

# POSTGRES_TEST_DB vacío o sin definir (producción): no se crea la BD de pruebas.
DBS=("$POSTGRES_DB")
if [ -n "${POSTGRES_TEST_DB:-}" ]; then
  echo "[carril] creando BD de pruebas $POSTGRES_TEST_DB"
  "${PSQL[@]}" --dbname postgres <<SQL
SELECT format('CREATE DATABASE %I OWNER %I', '$POSTGRES_TEST_DB', '$POSTGRES_USER')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_TEST_DB')
\gexec
SQL
  DBS+=("$POSTGRES_TEST_DB")
fi

for db in "${DBS[@]}"; do
  for f in /carril/ddl/*.sql; do
    echo "[carril] DDL $f -> $db"
    "${PSQL[@]}" --dbname "$db" -f "$f"
  done
done

# CARRIL_SEED=0 omite los datos de demo (producción). Sin archivos en seed/ tampoco falla.
shopt -s nullglob
if [ "${CARRIL_SEED:-1}" = "0" ]; then
  echo "[carril] seed omitido (CARRIL_SEED=0)"
else
  for f in /carril/seed/*.sql; do
    echo "[carril] seed $f -> $POSTGRES_DB"
    "${PSQL[@]}" --dbname "$POSTGRES_DB" -f "$f"
  done
fi
echo "[carril] init completo"
