#!/usr/bin/env bash
# Init de Carril: corre una sola vez (volumen vacío) dentro de postgres:16-alpine.
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER")

echo "[carril] creando BD de pruebas $POSTGRES_TEST_DB"
"${PSQL[@]}" --dbname postgres <<SQL
SELECT format('CREATE DATABASE %I OWNER %I', '$POSTGRES_TEST_DB', '$POSTGRES_USER')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_TEST_DB')
\gexec
SQL

for db in "$POSTGRES_DB" "$POSTGRES_TEST_DB"; do
  for f in /carril/ddl/*.sql; do
    echo "[carril] DDL $f -> $db"
    "${PSQL[@]}" --dbname "$db" -f "$f"
  done
done

for f in /carril/seed/*.sql; do
  echo "[carril] seed $f -> $POSTGRES_DB"
  "${PSQL[@]}" --dbname "$POSTGRES_DB" -f "$f"
done
echo "[carril] init completo"
