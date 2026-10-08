# Pruebas

Conteos al 2026-10 (`pytest --collect-only -q -m <marker>`): 67 unit, 70 integration, 6 e2e.
Markers (registrados en `pyproject.toml`): `unit`, `integration`, `e2e`. Se asignan automáticamente según la carpeta.
`asyncio_mode = auto`. `tests/conftest.py` fija `BCRYPT_ROUNDS=4` (si no está definido) y un `JWT_SECRET` válido de prueba.

```bash
cd backend
.venv/bin/pytest -m unit                              # sin BD
.venv/bin/pytest -m "unit or integration" --cov=app   # cobertura (meta >= 85%)
.venv/bin/pytest -m e2e                               # contra la API en Docker
```

## unit (`tests/unit/`)

67 pruebas: `test_services` 19, `test_ordering` 15, `test_config` 14, `test_security` 10, `test_schemas` 5, `test_middleware` 4.

Servicios y seguridad con repositorios en memoria (`tests/unit/fakes.py`), sin BD ni red: hash/verify, JWT (expirado, firma inválida,
alg none), reglas puras de reordenamiento, mover (misma columna arriba/abajo, entre columnas, acotado), 404 por recurso ajeno,
columnas por defecto, validación de schemas y configuración (`JWT_SECRET`, lista de `CORS_ORIGINS`).
`test_config.py` también cubre `get_settings()`: con un secreto corto o de ejemplo, o sin `JWT_SECRET`, sale con `SystemExit` y el mensaje `[carril] Configuración inválida: ...` (sin traza ni el valor recibido); con un secreto válido carga la configuración.
`test_middleware.py`: orden de la pila (GZip -> CORS -> UnhandledError) y `minimum_size=1000`; `UnhandledErrorMiddleware`
convierte una excepción en 500 JSON, la vuelve a lanzar si la respuesta ya empezó y deja pasar los scopes que no son HTTP.

## integration (`tests/integration/`)

70 pruebas: `test_tasks` 19, `test_auth_health` 12, `test_boards` 11, `test_concurrency_errors` 10, `test_mobile` 10, `test_columns` 8.

La app real (`create_app()`) con `httpx.AsyncClient(transport=ASGITransport(app))` contra la BD `carril_test` del contenedor
`db` (`TEST_DATABASE_URL`). Requiere `docker compose up -d db`; si la BD no responde las pruebas se saltan con un mensaje.
Aislamiento: `TRUNCATE users, boards, ... CASCADE` antes y después de cada prueba (con engine `NullPool` por prueba). Se usa TRUNCATE
y no rollback porque cada petición hace su propio commit, y no DELETE de usuarios porque mezclar CASCADE y SET NULL en una
transacción puede dar `ForeignKeyViolation`. Incluye concurrencia (`asyncio.gather` de creaciones, movimientos, borrados y reordenamientos: cero 500, posiciones contiguas) y errores JSON (409/500/503). Las pruebas fijan `JWT_SECRET` válido en `tests/conftest.py`. Cubre cada endpoint: caminos felices, 401, 404 ajeno, 409, 422, posiciones tras
mover/borrar, cascadas, CORS, health 503 y número constante de consultas en `GET /boards/{id}`.

`test_mobile.py` (v1.2): 500 y 503 con origen permitido llevan `access-control-allow-origin` y `Vary: Origin`; con origen no
permitido o sin `Origin`, no llevan cabeceras CORS. Usa `ASGITransport` con `raise_app_exceptions=True`, así que una excepción que
escapara de la app haría fallar la prueba. `GET /boards/{id}` con 15 tareas y `Accept-Encoding: gzip` -> `content-encoding: gzip`
junto con CORS y `Vary: Accept-Encoding, Origin`; el mismo tablero con `identity` y `/health` (respuesta pequeña) salen sin
comprimir; el preflight sigue funcionando.

Verificación manual del contenedor (ver [DEPLOYMENT.md](DEPLOYMENT.md)): `curl -sI -H 'Accept-Encoding: gzip'` sobre un tablero
grande debe mostrar `content-encoding: gzip`.

## e2e (`tests/e2e/`)

6 pruebas.

`httpx` síncrono contra la API real (`E2E_BASE_URL`, defecto `http://localhost:8000`): health, `/docs`, registro de 2 usuarios únicos,
flujo completo de tablero y aislamiento entre usuarios. Se saltan con un mensaje si la API no responde.
Limpieza: al terminar la sesión se borran (vía `docker compose exec -T db psql`) solo los usuarios creados en esa corrida, por su lista exacta de emails, borrando antes sus tableros.
