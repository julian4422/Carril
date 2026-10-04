# Carril

Gestor de tareas tipo Kanban: tableros, columnas y tarjetas arrastrables.

| Carpeta | Qué es | Docs |
|---|---|---|
| `database/` | DDL de PostgreSQL 16, datos de ejemplo y pruebas del esquema | [database/docs](database/docs/README.md) |
| `backend/` | API REST con FastAPI (corre en Docker) | [backend/docs](backend/docs/README.md) |
| `frontend/` | Aplicación Angular 19 (corre local con `ng serve`) | [frontend/docs](frontend/docs/README.md) |
| `docs/` | Arquitectura (`arquitectura.html`) y contrato compartido (`CONTRACT.md`) | |

## Requisitos

- Docker Desktop (con Docker Compose v2)
- Node 20.11+ y npm
- Python 3.12+ (solo para correr las pruebas de `database/` y `backend/` fuera de Docker)

## Levantar todo

```bash
cp .env.example .env          # una sola vez, y luego define JWT_SECRET en .env:
python3 -c "import secrets;print(secrets.token_urlsafe(48))"   # pega el valor en JWT_SECRET
docker compose up -d --build  # PostgreSQL :5432 + API :8000
cd frontend && npm install && npm start   # http://localhost:4200
```

- API: http://localhost:8000/docs (Swagger)
- Usuario de ejemplo: `demo@carril.dev` / `demo1234`

El esquema se aplica solo en el primer arranque del volumen. Para recrear la base desde cero: `docker compose down -v && docker compose up -d --build`.

## Pruebas

Cada proyecto tiene pruebas unitarias, de integración y end to end. Cómo correrlas está en el `docs/TESTING.md` de cada carpeta.
