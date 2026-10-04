# Pruebas

Markers (registrados en `pyproject.toml`): `unit`, `integration`, `e2e`. Se asignan automáticamente según la carpeta.
`asyncio_mode = auto`.

```bash
cd backend
.venv/bin/pytest -m unit                              # sin BD
.venv/bin/pytest -m "unit or integration" --cov=app   # cobertura (meta >= 85%)
.venv/bin/pytest -m e2e                               # contra la API en Docker
```

## unit (`tests/unit/`)

Servicios y seguridad con repositorios en memoria (`tests/unit/fakes.py`), sin BD ni red: hash/verify, JWT (expirado, firma inválida,
alg none), reglas puras de reordenamiento, mover (misma columna arriba/abajo, entre columnas, acotado), 404 por recurso ajeno,
columnas por defecto, validación de schemas.

## integration (`tests/integration/`)

La app real (`create_app()`) con `httpx.AsyncClient(transport=ASGITransport(app))` contra la BD `carril_test` del contenedor
`db` (`TEST_DATABASE_URL`). Requiere `docker compose up -d db`; si la BD no responde las pruebas se saltan con un mensaje.
Aislamiento: `TRUNCATE users, boards, ... CASCADE` antes y después de cada prueba (con engine `NullPool` por prueba). Se usa TRUNCATE
y no rollback porque cada petición hace su propio commit, y no DELETE de usuarios porque mezclar CASCADE y SET NULL en una
transacción puede dar `ForeignKeyViolation`. Incluye concurrencia (`asyncio.gather` de creaciones, movimientos, borrados y reordenamientos: cero 500, posiciones contiguas) y errores JSON (409/500/503). Las pruebas fijan `JWT_SECRET` válido en `tests/conftest.py`. Cubre cada endpoint: caminos felices, 401, 404 ajeno, 409, 422, posiciones tras
mover/borrar, cascadas, CORS, health 503 y número constante de consultas en `GET /boards/{id}`.

## e2e (`tests/e2e/`)

`httpx` síncrono contra la API real (`E2E_BASE_URL`, defecto `http://localhost:8000`): health, `/docs`, registro de 2 usuarios únicos,
flujo completo de tablero y aislamiento entre usuarios. Se saltan con un mensaje si la API no responde.
Limpieza: al terminar la sesión se borran (vía `docker compose exec -T db psql`) solo los usuarios creados en esa corrida, por su lista exacta de emails, borrando antes sus tableros.
