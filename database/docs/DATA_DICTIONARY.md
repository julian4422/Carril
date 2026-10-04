# Diccionario de datos

Todas las PK son `uuid DEFAULT gen_random_uuid()`. Los timestamps son `timestamptz NOT NULL DEFAULT now()`. Tipo enum: `task_priority` = `low | medium | high | urgent`.

## users
Cuentas de usuario.

| Columna | Tipo | Nulo | Default | Restricción | Descripción |
|---|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK | Identificador |
| email | citext | no | | UNIQUE (sin distinguir mayúsculas) | Correo de acceso |
| full_name | text | no | | CHECK longitud 1..120 | Nombre completo |
| password_hash | text | no | | | Hash bcrypt |
| created_at | timestamptz | no | now() | | Creación |
| updated_at | timestamptz | no | now() | trigger | Última modificación |

## boards
Tableros Kanban.

| Columna | Tipo | Nulo | Default | Restricción | Descripción |
|---|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK | Identificador |
| owner_id | uuid | no | | FK users, ON DELETE CASCADE | Dueño |
| name | text | no | | CHECK 1..120 | Nombre |
| description | text | sí | | | Descripción |
| color | text | no | '#0f6e63' | CHECK `~ '^#[0-9a-fA-F]{6}$'` | Color #RRGGBB |
| archived_at | timestamptz | sí | | | No nulo = archivado |
| created_at / updated_at | timestamptz | no | now() | trigger en updated_at | Auditoría |

## board_columns
Columnas de un tablero.

| Columna | Tipo | Nulo | Default | Restricción | Descripción |
|---|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK | Identificador |
| board_id | uuid | no | | FK boards, ON DELETE CASCADE | Tablero |
| name | text | no | | CHECK 1..60 | Nombre |
| position | int | no | | CHECK >= 0; UNIQUE (board_id, position) DEFERRABLE INITIALLY DEFERRED | Posición base 0 |
| wip_limit | int | sí | | CHECK > 0 | Límite WIP; NULL = sin límite |
| created_at / updated_at | timestamptz | no | now() | trigger en updated_at | Auditoría |

## tasks
Tarjetas.

| Columna | Tipo | Nulo | Default | Restricción | Descripción |
|---|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK | Identificador |
| column_id | uuid | no | | FK board_columns, ON DELETE CASCADE | Columna |
| title | text | no | | CHECK 1..200 | Título |
| description | text | sí | | | Descripción |
| priority | task_priority | no | 'medium' | enum | Prioridad |
| due_date | date | sí | | | Fecha límite |
| position | int | no | | CHECK >= 0; UNIQUE (column_id, position) DEFERRABLE INITIALLY DEFERRED | Posición base 0 |
| assignee_id | uuid | sí | | FK users, ON DELETE SET NULL | Asignado |
| created_by | uuid | sí | | FK users, ON DELETE SET NULL | Creador |
| created_at / updated_at | timestamptz | no | now() | trigger en updated_at | Auditoría |

## labels
Etiquetas de tablero.

| Columna | Tipo | Nulo | Default | Restricción | Descripción |
|---|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK | Identificador |
| board_id | uuid | no | | FK boards, ON DELETE CASCADE | Tablero |
| name | text | no | | CHECK 1..40; UNIQUE (board_id, name) | Nombre |
| color | text | no | | CHECK `~ '^#[0-9a-fA-F]{6}$'` | Color #RRGGBB |
| created_at | timestamptz | no | now() | | Creación (sin updated_at) |

## task_labels
Relación N:M.

| Columna | Tipo | Nulo | Default | Restricción | Descripción |
|---|---|---|---|---|---|
| task_id | uuid | no | | PK compuesta; FK tasks, ON DELETE CASCADE | Tarea |
| label_id | uuid | no | | PK compuesta; FK labels, ON DELETE CASCADE | Etiqueta |

## task_comments
Comentarios.

| Columna | Tipo | Nulo | Default | Restricción | Descripción |
|---|---|---|---|---|---|
| id | uuid | no | gen_random_uuid() | PK | Identificador |
| task_id | uuid | no | | FK tasks, ON DELETE CASCADE | Tarea |
| author_id | uuid | sí | | FK users, ON DELETE SET NULL | Autor |
| body | text | no | | CHECK 1..2000 | Texto |
| created_at / updated_at | timestamptz | no | now() | trigger en updated_at | Auditoría |

## Índices
`idx_boards_owner_id`, `idx_boards_owner_created` (parcial, no archivados), `idx_board_columns_board_pos`, `idx_tasks_column_pos`, `idx_tasks_assignee_id`, `idx_tasks_created_by`, `idx_labels_board_id`, `idx_task_labels_label_id`, `idx_task_comments_task_created`, `idx_task_comments_author_id`. Además los índices implícitos de PK/UNIQUE.

## Triggers
`trg_<tabla>_updated_at` BEFORE UPDATE FOR EACH ROW → `set_updated_at()` en users, boards, board_columns, tasks, task_comments.
