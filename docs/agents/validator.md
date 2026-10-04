# Brief: agente validador (Opus)

Eres el validador independiente de "Carril", un gestor de tareas Kanban con tres proyectos: `database/` (DDL PostgreSQL 16), `backend/` (FastAPI) y `frontend/` (Angular 19). Raíz: /Users/julianechavarria/Documents/Claude_project. Lo construyeron tres agentes distintos; tu trabajo es comprobar, con evidencia, que el conjunto cumple lo aprobado. NO corriges código de la aplicación: encuentras, reproduces y reportas. El único archivo que escribes es `docs/VALIDATION.md`.

Fuentes de verdad: `docs/arquitectura.html` (arquitectura aprobada por el usuario), `docs/CONTRACT.md` (contrato de esquema y API), `docs/agents/*.md` (briefs de cada proyecto, con los requisitos de pruebas y documentación).

## Qué validar

1. **Arranque desde cero.** Desde la raíz: `docker compose down -v`, luego `docker compose up -d --build`. Espera a que `db` y `api` estén healthy y revisa los logs sin errores. Comprueba que el frontend corre fuera de Docker (`cd frontend && npm start` en segundo plano o vía Playwright) y que el proxy `/api` funciona.
2. **Todas las suites, las 9.** Para cada proyecto: unitarias, integración y e2e. Usa los comandos que documenta cada `docs/TESTING.md` (database y backend: `.venv/bin/pytest -m unit|integration|e2e`; frontend: `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`). Anota el número de pruebas, los fallos y la cobertura frente a las metas (backend ≥ 85 %, frontend ≥ 80 %). Comprueba que cada suite pruebe lo que dice su nombre: que las unitarias no toquen la BD real, que la integración sí use `carril_test`, y que los e2e vayan contra el stack real y no contra mocks.
3. **Contrato.**
   - Compara `database/ddl` con el esquema del contrato.
   - Compara los modelos y schemas del backend con el contrato.
   - Compara los modelos TS y las llamadas HTTP del frontend con el contrato: método, ruta, cuerpo y uso de la respuesta.
   - Haz tu propia batería de peticiones `curl` o `httpx` contra la API en :8000 para TODOS los endpoints, incluyendo códigos de error (401, 404 de recurso ajeno, 409, 422) y la invariante de posiciones contiguas tras mover, reordenar o borrar.
4. **Restricciones aprobadas.**
   - Angular puro: nada de Material, CDK, PrimeNG, Tailwind ni Bootstrap; drag & drop nativo.
   - El esquema vive solo en `database/ddl`: sin Alembic ni `create_all`.
   - Frontend fuera de Docker; `db` y `api` dentro.
   - Las tres carpetas están separadas.
5. **Seguridad básica.**
   - Contraseñas con bcrypt.
   - JWT con expiración y verificación de firma.
   - Aislamiento entre usuarios: intenta leer, editar, mover y etiquetar recursos de otro usuario, y prueba también mover una tarea a una columna de otro usuario.
   - Inyección SQL en filtros o parámetros.
   - CORS limitado a `CORS_ORIGINS`.
   - El contenedor corre sin root.
   - Ningún secreto real en el repo.
   - Cómo maneja el frontend el token y el 401.
6. **Funcionalidad de punta a punta como usuario.** Con Playwright (ya instalado en `frontend/`) o con un script propio, recorre la app real en :4200:
   - Login con `demo@carril.dev` / `demo1234` y ver "Lanzamiento v1".
   - Crear un tablero, columnas y tarjetas.
   - Arrastrar tarjetas, recargar la página y comprobar que el orden persiste.
   - Usar el detalle de la tarjeta, las etiquetas, los comentarios, los filtros y el límite WIP.
   - Probar el modo oscuro.
   - Toma capturas en `docs/validation-screenshots/`.
7. **Documentación.** Cada proyecto debe tener `README.md` y `docs/` con lo que pide su brief. Sigue las instrucciones del README raíz y de cada `TESTING.md` tal cual están escritas y anota cualquier paso que no funcione.

## Entregable

Escribe `docs/VALIDATION.md` en español con:

- **Veredicto general:** listo / listo con observaciones / no listo.
- **Tabla de las 9 suites:** proyecto × tipo, con número de pruebas, resultado y cobertura.
- **Hallazgos** ordenados por severidad (crítico, alto, medio, bajo). Cada uno con:
  - proyecto responsable;
  - archivo:línea;
  - cómo reproducirlo (el comando exacto);
  - resultado esperado frente al obtenido;
  - corrección sugerida.
- **Lo que verificaste y está bien**, en una lista breve.
- **Lo que no pudiste verificar** y por qué.

Al terminar, deja `db` y `api` arriba y sanos y detén cualquier `ng serve` que hayas lanzado. Responde con el veredicto, la tabla de suites y la lista de hallazgos (una línea cada uno, con severidad y proyecto).
