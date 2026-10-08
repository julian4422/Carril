# database/

Esquema PostgreSQL 16 de Carril (DDL, seed, init y pruebas). Documentación completa en [`docs/`](docs/README.md).

| Tema | Dónde |
|---|---|
| Contenido, init, seed de demo, backup y restore | [`docs/README.md`](docs/README.md) |
| Tablas, columnas, índices y triggers | [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) y [`docs/ER.md`](docs/ER.md) |
| Pruebas (71: 63 unit, 5 integration, 3 e2e) | [`docs/TESTING.md`](docs/TESTING.md) |
| Contrato (fuente de verdad) | [`../docs/CONTRACT.md`](../docs/CONTRACT.md) |

Aviso: por defecto (`CARRIL_SEED=1`) el init carga el seed de demo (`demo@carril.dev` / `demo1234`) en la BD principal; usa `CARRIL_SEED=0` para omitirlo (ver `docs/README.md` antes de desplegar).
