# Carril: informe de validación

Validador independiente, 2 oct 2026. Todo lo que sigue lo ejecuté yo; no copié ninguna cifra de los informes de los agentes.

## Veredicto general

**Listo con observaciones.**

No hay hallazgos críticos ni altos. Las 9 suites pasan, las coberturas superan las metas, el contrato se cumple en esquema, API y cliente, y el recorrido de usuario funciona de punta a punta. Antes de usarlo en serio conviene corregir dos hallazgos medios:

- peticiones concurrentes sobre la misma columna devuelven 500;
- la API acepta en silencio el `JWT_SECRET` por defecto.

## Las 9 suites

| Proyecto | Tipo | Pruebas | Resultado | Cobertura | Comando |
|---|---|---|---|---|---|
| database | unit | 63 | 63 pasan | n/a (SQL) | `database/.venv/bin/pytest -m unit` |
| database | integration | 5 | 5 pasan | n/a | `.venv/bin/pytest -m integration` |
| database | e2e | 3 | 3 pasan | n/a | `.venv/bin/pytest -m e2e` |
| backend | unit | 49 | 49 pasan | 86 % por sí sola | `backend/.venv/bin/pytest -m unit` |
| backend | integration | 50 | 50 pasan | 81 % por sí sola | `.venv/bin/pytest -m integration` |
| backend | unit + integration | 99 | pasan | **96 %** (meta ≥ 85 %) | `.venv/bin/pytest -m "unit or integration" --cov=app` |
| backend | e2e | 6 | 6 pasan | n/a | `.venv/bin/pytest -m e2e` (API en Docker) |
| frontend | unit | 86 | 86 pasan | líneas **99,2 %** (meta ≥ 80 %), ramas 84,7 % | `npm run test:unit` |
| frontend | integration | 25 | 25 pasan | n/a | `npm run test:integration` |
| frontend | unit + integration | 111 | pasan | líneas 96,2 %, ramas 72,6 % | `npx ng test --watch=false --browsers=ChromeHeadless --code-coverage` |
| frontend | e2e | 1 | 1 pasa (5,6 s) | n/a | `npm run test:e2e` (ng serve + API real) |

Totales: database 71, backend 105, frontend 112 (86 + 25 + 1). Coinciden con lo que reportaron los agentes. El 96 % del backend corresponde a unit e integración juntas. El 99 % unitario del frontend solo mide los archivos que importan las pruebas unitarias; las páginas quedan fuera y se cubren en integración (ver H-11).

**¿Cada suite prueba lo que dice su nombre?**

- **database.** Las tres suites usan una BD temporal `carril_dbtest_<random>` y la borran al terminar. Lo comprobé en `pg_database` después de correrlas. Además, `test_real_containers_schema` revisa que `carril` y `carril_test` reales tengan el esquema y el seed.
- **backend unit.** No usa BD: pasa igual con `DATABASE_URL` apuntando a `127.0.0.1:1`. Los repositorios son falsos (`tests/unit/fakes.py`).
- **backend integration.** Usa `create_app()` con `ASGITransport` contra `carril_test` y hace TRUNCATE entre pruebas.
- **backend e2e.** Usa httpx contra `localhost:8000`, es decir, el contenedor real.
- **frontend unit e integración.** Usan `HttpTestingController`: solo la red está simulada.
- **frontend e2e.** Usa Playwright contra `ng serve` y la API real, sin `page.route` ni mocks.

## Hallazgos

### Críticos

Ninguno.

### Altos

Ninguno.

### Medios

**H-1 · Peticiones concurrentes sobre la misma columna devuelven 500** (backend)

- **Dónde:** `backend/app/services/task_service.py:33` (create), `:72-93` (move) y `backend/app/services/column_service.py:25` (create column).
- **Cómo reproducirlo:** desde `backend/`, `.venv/bin/python /tmp/carril_api_battery.py`. La función `concurrency()` lanza 10 `POST /columns/{id}/tasks` simultáneos y luego 4 `POST /tasks/{id}/move` simultáneos a la misma columna. Equivale a esto:

  ```bash
  for i in $(seq 10); do curl -s -o /dev/null -w '%{http_code} ' -X POST localhost:8000/api/v1/columns/$COL/tasks -H "Authorization: Bearer $T" -H 'content-type: application/json' -d "{\"title\":\"c$i\"}" & done; wait
  ```
- **Esperado:** todas 201/200, o un 409 controlado con `{"detail": ...}`.
- **Obtenido:** creación `[201,201,201,500,500,201,500,500,201,201]`; moves `[200,200,200,500]`. En `docker compose logs api` aparece `UniqueViolationError ... "tasks_column_position_key"`. Cada petición lee `len(siblings)` o la lista de la columna sin bloqueo, y la UNIQUE diferible falla al hacer COMMIT. Los datos no se corrompen (la transacción se revierte y las posiciones siguen contiguas), pero el cliente recibe un 500 en texto plano sin cabeceras CORS. En la UI basta con arrastrar rápido o con dos pestañas abiertas.
- **Corrección:** bloquear la columna (o el tablero, al reordenar columnas) antes de leer las posiciones, con `SELECT ... FROM board_columns WHERE id = :id FOR UPDATE` o `with_for_update()` en `ColumnRepository.get`. En un move entre columnas, bloquear ambas en orden de id para evitar interbloqueos. Como red de seguridad, mapear `IntegrityError` a 409 en `register_error_handlers`. Añadir una prueba de integración con `asyncio.gather`.

**H-2 · La API arranca y firma tokens con el `JWT_SECRET` público por defecto** (backend y orquestador)

- **Dónde:** `backend/app/core/config.py:10` (`jwt_secret = "change-me-in-production"`), `.env.example:7` y `docker-compose.yml:31` (`${JWT_SECRET:-change-me-in-production}`).
- **Cómo reproducirlo:**

  ```bash
  python -c "import jwt,time;print(jwt.encode({'sub':'00000000-0000-4000-8000-000000000001','exp':int(time.time())+600},'change-me-in-production','HS256'))"
  ```

  Luego, `curl -H "Authorization: Bearer <token>" localhost:8000/api/v1/auth/me`.
- **Esperado:** que un despliegue con el secreto de ejemplo no acepte tokens forjados, o que no arranque.
- **Obtenido:** 200 con el usuario demo. Cualquiera puede suplantar a cualquier usuario si se despliega con los valores por defecto. En local es aceptable; el riesgo aparece si se reutiliza el compose. No es un secreto real filtrado: es un placeholder.
- **Corrección:** en `Settings`, validar que `jwt_secret` tenga al menos 32 bytes y no sea el valor de ejemplo. Si no se cumple, fallar al arrancar o, como mínimo, registrar un warning ruidoso. Quitar el default del compose y generar el valor en `.env` con `openssl rand -hex 32`, documentándolo en el README raíz.

### Bajos

**H-3 · Comentarios formados solo por espacios se aceptan** (backend)

- **Dónde:** `backend/app/schemas/tasks.py:60` (`body: str = Field(min_length=1, ...)`, sin `strip`).
- **Cómo reproducirlo:** `curl -X POST localhost:8000/api/v1/tasks/$TASK/comments -H "Authorization: Bearer $T" -H 'content-type: application/json' -d '{"body":"   "}'`
- **Esperado:** 422, coherente con `title` y `name`, que usan `trimmed()`.
- **Obtenido:** 201. El frontend sí recorta y valida (`task-detail.component.ts:223`), así que solo afecta a clientes directos de la API.
- **Corrección:** `body: trimmed(2000)`.

**H-4 · Con la BD caída, los endpoints devuelven 500 en texto plano** (backend)

- **Dónde:** `backend/app/core/errors.py:40`: no hay manejador genérico.
- **Cómo reproducirlo:** `docker compose stop db`, luego `curl -X POST localhost:8000/api/v1/auth/login -H 'content-type: application/json' -d '{"email":"demo@carril.dev","password":"demo1234"}'`, y al final `docker compose start db`.
- **Esperado:** un JSON `{"detail": ...}` (503 o 500) para que el toast del frontend muestre algo útil.
- **Obtenido:** `Internal Server Error` con código 500 y `text/plain`. `/health` sí responde 503 y la API se recupera sola al volver la BD.
- **Corrección:** añadir manejadores para `sqlalchemy.exc.OperationalError` y `DBAPIError` que devuelvan 503 con `{"detail":"Base de datos no disponible"}`, y para `IntegrityError` que devuelvan 409 (cubre también H-1).

**H-5 · Las pruebas e2e dejan usuarios en la BD principal `carril`** (backend y frontend)

- **Dónde:** `backend/tests/e2e/conftest.py:26` (`e2e-*@carril-e2e.dev`) y `frontend/e2e/kanban.spec.ts:6` (`e2e+<stamp>@example.com`).
- **Cómo reproducirlo:** correr `.venv/bin/pytest -m e2e` y `npm run test:e2e`, y luego `docker compose exec -T db psql -U carril -d carril -c "select email from users"`.
- **Esperado:** el demo intacto, sin residuos.
- **Obtenido:** tras una corrida de cada suite quedan 4 usuarios `e2e-*`, 1 `e2e+…@example.com` y el tablero "Privado". No afectan al demo porque cada usuario solo ve lo suyo, pero se acumulan.
- **Corrección:** como la API no tiene `DELETE /users`, añadir en el `conftest` e2e un teardown con `docker compose exec db psql ... DELETE FROM users WHERE email LIKE 'e2e-%@carril-e2e.dev'`, borrando primero los tableros por la nota de CASCADE y SET NULL. Otra opción es usar el dominio reservado `.test` y documentar un comando de limpieza. Lo mismo aplica al e2e del frontend. Ver también la decisión D-3.

**H-6 · Pluralización en textos y aria-labels: "1 tarjetas", "1 comentarios"** (frontend)

- **Dónde:** `frontend/src/app/features/board/board-page.component.html:63` (aria-label del contador), `:147` ("y sus 1 tarjetas") y `frontend/src/app/features/board/task-card.component.ts:40` ("1 comentarios").
- **Cómo reproducirlo:** abrir un tablero con una columna de 1 tarjeta e inspeccionar `.count[aria-label]`, o pedir que se borre esa columna.
- **Esperado:** "1 tarjeta" y "1 comentario".
- **Obtenido:** "1 tarjetas", "1 comentarios". `boards-page.component.ts:54` ya lo resuelve bien.
- **Corrección:** usar el mismo ternario o un pipe `plural`.

**H-7 · En móvil, el nombre del tablero se corta sin elipsis** (frontend)

- **Dónde:** `frontend/src/app/features/board/board-page.component.scss:5`: `.board-name` es `display:flex`, y `text-overflow` no actúa sobre el nodo de texto.
- **Cómo reproducirlo:** viewport de 390×844 en `/boards/:id`. Ver la captura `docs/validation-screenshots/14-mobile-board.png`.
- **Esperado:** "Validación Q…".
- **Obtenido:** "Valic", cortado en seco. No hay scroll horizontal en la página (0 px).
- **Corrección:** envolver el texto en un `<span>` con `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0`.

**H-8 · Healthcheck de `db` con posible carrera durante el init** (orquestador)

- **Dónde:** `docker-compose.yml:21` (`pg_isready -U ... -d ...` sin `-h`).
- **Cómo reproducirlo:** no se reprodujo en esta corrida porque el init tarda unos 2 s. Es una carrera teórica: `pg_isready` sin `-h` usa el socket Unix, y el servidor temporal del entrypoint lo atiende mientras corre `00_init.sh`. `api` podría arrancar antes de que existan las tablas.
- **Esperado:** healthy solo cuando el servidor definitivo escucha por TCP.
- **Obtenido:** en la práctica, sin impacto (la API conecta de forma perezosa y su propio healthcheck reintenta).
- **Corrección:** `pg_isready -h 127.0.0.1 -U $${POSTGRES_USER} -d $${POSTGRES_DB}`.

**H-9 · Errores de "recurso ajeno" inconsistentes entre move y labels** (backend, documentación)

- **Dónde:** `task_service.py:78-80` (columna ajena o inexistente → 404) frente a `task_service.py:102-103` (etiqueta ajena o inexistente → 422).
- **Cómo reproducirlo:** `POST /tasks/{id}/move` con la `column_id` de otro usuario da 404; `PUT /tasks/{id}/labels` con la `label_id` de otro usuario da 422.
- **Observación:** ninguno de los dos filtra información, porque ajeno e inexistente responden igual. Solo es una inconsistencia de contrato.
- **Corrección:** documentarlo en `CONTRACT.md` (ver D-1) o unificar.

**H-10 · Desviaciones menores frente a `arquitectura.html`** (backend)

- **Modelos ORM.** Están en `app/db/models.py` y no en `app/models/`.
- **Aislamiento de integración.** Se hace con TRUNCATE por prueba y no con rollback. Está justificado en `backend/docs/TESTING.md`: cada petición hace commit, y mezclar CASCADE con SET NULL complica el rollback.
- **Corrección:** ninguna obligatoria. Basta con anotarlo en la arquitectura.

**H-11 · La cobertura unitaria del frontend excluye las páginas** (frontend, informativo)

- **Dónde:** `frontend/karma.conf.js` y el script `test:unit`.
- **Detalle:** el 99,2 % solo cuenta los archivos importados por las specs unitarias; `board-page`, `task-detail`, `login` y similares no están en el denominador. La meta del 80 % se cumple de todos modos con la cobertura combinada (96,2 % de líneas). Las ramas combinadas están en 72,6 %.
- **Corrección:** documentarlo así (ya lo indica `TESTING.md`), o medir la meta sobre la corrida combinada.

## Decisiones del backend fuera del contrato

| # | Decisión | Evaluación |
|---|---|---|
| D-1 | Mover a una columna inexistente o de otro usuario da 404; a una columna propia de otro tablero, 422 | **Aprobada.** Respeta la regla general del contrato (ajeno o inexistente → 404) y no revela si existe la columna de otro usuario. La regla de "otro tablero → 422" queda para el caso legítimo. Verificado: 404, 404, 422, y la columna ajena no se modifica. Hay que añadirla a `CONTRACT.md` y anotar la diferencia con labels (H-9). |
| D-2 | El límite WIP se guarda pero no se aplica | **Aprobada.** Es lo que dice `arquitectura.html`: "wip_limit es opcional y el frontend lo marca cuando una columna lo supera". Verificado: con `wip_limit=1`, crear una segunda tarea da 201, y la UI marca la columna con "Límite WIP superado" y "3 / 2" (captura 11). |
| D-3 | Las pruebas e2e dejan usuarios `e2e-*` en la BD principal | **Aceptable con corrección pendiente** (H-5). Probar contra la API real obliga a usar la BD `carril`, porque el contenedor apunta ahí. Lo que falta es la limpieza. El e2e del frontend hace lo mismo. |
| D-4 | `/health` responde 503 con `{status:"error", database:"error"}` | **Aprobada.** Es simétrico con la respuesta 200 y el contrato solo fija el código. Verificado parando `db`: 503 con ese cuerpo, y vuelve a 200 al arrancarla. Conviene fijar el cuerpo en `CONTRACT.md`. |

## Lo que verifiqué y está bien

- **Arranque desde cero.** `docker compose down -v` seguido de `up -d --build`: `db` y `api` quedan healthy. Los logs de `db` muestran el init completo sin errores; el único aviso es "no usable system locales", que es inocuo en alpine. Los logs de `api` están limpios. El frontend corre fuera de Docker con `npm start` y el proxy `/api` funciona: login del demo vía `localhost:4200/api/v1/auth/login`. `ng build` termina sin warnings (278 kB iniciales).
- **Esquema.** `database/ddl` coincide con el contrato en tablas, tipos, nulabilidad, defaults, CHECKs de longitud, color y posición, FKs con su ON DELETE, UNIQUE diferibles, trigger `set_updated_at` en las 5 tablas con `updated_at`, índices en todas las FK y extensiones. Todo es reejecutable. El seed es idempotente y el hash es bcrypt `$2b$`.
- **Modelos y schemas del backend.** Coinciden campo a campo con `UserOut`, `TokenOut`, `LabelOut`, `TaskOut`, `ColumnOut`, `BoardSummary`, `BoardDetail` y `CommentOut`. Verifiqué los conjuntos exactos de claves en las respuestas reales.
- **Modelos TS y servicios HTTP del frontend.** Coinciden con el contrato en método, ruta, cuerpo (`column_ids`, `label_ids`, `{body}`, `{column_id, position}`) y uso de la respuesta. Las URLs son relativas.
- **Batería propia contra :8000.** 133 comprobaciones, con 4 fallos que son H-1, H-2 y H-3. Cubre los 24 endpoints, con 201/204/409/422/401/404 donde corresponde:
  - registro duplicado sin distinguir mayúsculas → 409;
  - contraseña < 8 → 422;
  - login por form-encoded → 422;
  - `PUT columns/order` incompleto, duplicado o con columna ajena → 422;
  - `assignee_id` distinto del dueño → 422;
  - etiqueta repetida → 409;
  - posición acotada en `0..n`, también con valores negativos;
  - invariante de posiciones contiguas tras mover dentro y entre columnas, reordenar columnas, borrar tarea y borrar columna;
  - cascadas al borrar columna y tablero;
  - etiqueta borrada que desaparece de la tarea;
  - `comment_count`, `task_count` y orden de listados (boards `created_at` desc, labels por nombre, comentarios asc).
- **Aislamiento entre usuarios.** Leer, editar, borrar, mover, etiquetar, comentar, crear columnas o etiquetas y reordenar en recursos del otro usuario → 404. Mover la tarea propia a una columna ajena → 404, y al revés también; la columna ajena queda intacta. Etiquetar con una etiqueta ajena → 422.
- **Inyección SQL.** Probé `' OR 1=1 --` y `;DROP TABLE` en la ruta (→ 422 por UUID) y en el login (→ 401). Un nombre de tablero con SQL se guarda literal. Todo pasa por SQLAlchemy con parámetros.
- **JWT.** Rechaza firma inválida, `alg:none`, token expirado y token sin `exp` (401). `expires_in` = 43 200 s. Contraseñas con bcrypt (coste 12) y login con tiempo constante (hash señuelo).
- **CORS.** El preflight desde `http://localhost:4200` se permite; desde `http://evil.com` da 400 y no lleva `Access-Control-Allow-Origin`.
- **Contenedor.** Corre como `uid=10001(carril)`. El Dockerfile es multi-stage con `python:3.12-slim`.
- **Secretos.** No hay secretos reales en el repo; `.env` y `.env.example` solo tienen placeholders y `.env` está en `.gitignore`.
- **Restricciones aprobadas.** Sin Material, CDK, PrimeNG, Tailwind ni Bootstrap en `package.json` ni en `src`. Drag & drop nativo (`dragstart`/`dragover`/`drop`). Sin Alembic ni `create_all`. Frontend fuera de Docker. Tres carpetas separadas.
- **Manejo de sesión en el frontend.** El token está en `localStorage` (`carril.session`) con `expiresAt`. El interceptor solo añade `Authorization` a `/api/`. Ante un 401 fuera de login o registro, cierra sesión, limpia el storage y redirige a `/login`. Lo verifiqué con un token corrupto, y también el guard con una sesión expirada localmente.
- **Recorrido de usuario en :4200** (27 comprobaciones de Playwright, todas OK; capturas en `docs/validation-screenshots/`):
  - guard;
  - error de login;
  - login con `demo@carril.dev` y "Lanzamiento v1" visible;
  - crear tablero (modal propio) y columna;
  - 4 tarjetas;
  - arrastrar para reordenar dentro de la columna y entre columnas;
  - recargar y comprobar que el orden persiste, con posiciones contiguas en la API;
  - reordenar columnas arrastrando, con persistencia;
  - mover con teclado (Alt+→);
  - detalle: título, descripción, prioridad, fecha vencida resaltada, asignarme y quitarme, crear, marcar y desmarcar etiqueta, comentar;
  - filtro por texto y por prioridad, y limpiar filtros;
  - WIP superado marcado;
  - modo oscuro por `prefers-color-scheme`;
  - vista móvil sin scroll horizontal;
  - borrar columna y tarjeta con confirmación propia.
- **Documentación.** Cada proyecto tiene `README.md` y `docs/` con lo que pide su brief:
  - database: README, DATA_DICTIONARY, ER, TESTING;
  - backend: README, ARCHITECTURE, API, TESTING;
  - frontend: README, ARCHITECTURE, TESTING.

  Seguí al pie de la letra el README raíz y los tres `TESTING.md`, y todos los pasos funcionaron. `backend/docs/README.md` sugiere `python3 -m venv`, que en esta máquina es 3.13 y cumple `>=3.12`.

## Lo que no pude verificar

- **La carrera del healthcheck (H-8)** no se reprodujo; la deduje del comportamiento del entrypoint de postgres.
- **El historial de git** no se pudo revisar en busca de secretos, porque el proyecto no es un repositorio git. Solo revisé el árbol actual.
- **Navegadores distintos de Chromium** y lectores de pantalla reales no se probaron. La accesibilidad se revisó por código (roles, aria-labels, `aria-live`, foco) y con el teclado en Playwright.
- **La expiración real del JWT** tras 720 minutos no se esperó. Lo verifiqué con un token firmado con `exp` en el pasado (401) y con la lógica `expiresAt` del frontend.
- **El drag & drop táctil en móvil** no se probó: la API nativa de HTML5 no lo soporta en la mayoría de navegadores móviles. El brief no lo exige y queda la alternativa por teclado.

Estado final: `db` y `api` arriba y healthy. El `ng serve` que lancé está detenido. Borré de `carril` los usuarios y tableros que creé en la validación (`*@carril-val.dev` y el tablero "Validación QA"). Los residuos de las suites e2e de los agentes siguen ahí (H-5).

---

## Cierre (orquestador · 2 oct 2026)

Se corrigieron todos los hallazgos accionables y se volvió a verificar desde cero (`docker compose down -v && docker compose up -d --build`, `db` y `api` healthy).

| Hallazgo | Corrección |
|---|---|
| H-1 | Bloqueo `SELECT … FOR UPDATE` del tablero antes de recalcular posiciones; `IntegrityError` → 409. Pruebas de concurrencia nuevas (backend). |
| H-2 | `JWT_SECRET` obligatorio en compose; la API no arranca con secretos vacíos, cortos o de ejemplo; `.env` local con secreto aleatorio. |
| H-3 | `body` de comentarios recortado y no vacío (422). |
| H-4 | 500 `{"detail":"Error interno"}` y 503 si la BD no responde, siempre JSON. |
| H-5 | Los e2e de backend y frontend borran exactamente los usuarios que crean. |
| H-6 | Pluralización con `PluralPipe`. |
| H-7 | Nombre del tablero con elipsis y `title`. |
| H-8 | Healthcheck `pg_isready -h 127.0.0.1` (no se marca sano durante el init). |
| H-9, H-10 | Reglas añadidas a `docs/CONTRACT.md` (v1.1) y `backend/docs/API.md`. |

Corrida final:

| Proyecto | Unit | Integración | E2E | Cobertura |
|---|---|---|---|---|
| database | 63 ✓ | 5 ✓ | 3 ✓ | n/a |
| backend | 59 ✓ | 60 ✓ | 6 ✓ | 96 % (unit + integración) |
| frontend | 88 ✓ | 25 ✓ | 1 ✓ | 99,2 % líneas (unit) |

Tras la corrida, la BD principal solo contiene el usuario demo.

Pendiente conocido (bajo): un 500 no controlado no lleva cabeceras CORS (limitación de Starlette); el navegador lo ve como error de red en vez de mostrar el `detail`.
