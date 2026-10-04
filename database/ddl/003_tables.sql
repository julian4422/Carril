CREATE TABLE IF NOT EXISTS users (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         citext      NOT NULL UNIQUE,
    full_name     text        NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120),
    password_hash text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boards (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    description text        NULL,
    color       text        NOT NULL DEFAULT '#0f6e63' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
    archived_at timestamptz NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS board_columns (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id   uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
    position   int         NOT NULL CHECK (position >= 0),
    wip_limit  int         NULL CHECK (wip_limit > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT board_columns_board_position_key
        UNIQUE (board_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS tasks (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    column_id   uuid          NOT NULL REFERENCES board_columns (id) ON DELETE CASCADE,
    title       text          NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    description text          NULL,
    priority    task_priority NOT NULL DEFAULT 'medium',
    due_date    date          NULL,
    position    int           NOT NULL CHECK (position >= 0),
    assignee_id uuid          NULL REFERENCES users (id) ON DELETE SET NULL,
    created_by  uuid          NULL REFERENCES users (id) ON DELETE SET NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at  timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT tasks_column_position_key
        UNIQUE (column_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS labels (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id   uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
    color      text        NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT labels_board_name_key UNIQUE (board_id, name)
);

CREATE TABLE IF NOT EXISTS task_labels (
    task_id  uuid NOT NULL REFERENCES tasks (id)  ON DELETE CASCADE,
    label_id uuid NOT NULL REFERENCES labels (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

CREATE TABLE IF NOT EXISTS task_comments (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    uuid        NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    author_id  uuid        NULL REFERENCES users (id) ON DELETE SET NULL,
    body       text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  users IS 'Cuentas de usuario. El email es único sin distinguir mayúsculas (citext).';
COMMENT ON COLUMN users.password_hash IS 'Hash bcrypt de la contraseña; nunca la contraseña en claro.';
COMMENT ON TABLE  boards IS 'Tableros Kanban; pertenecen a un usuario y se borran con él.';
COMMENT ON COLUMN boards.archived_at IS 'No nulo = tablero archivado (oculto en el listado).';
COMMENT ON COLUMN boards.color IS 'Color hexadecimal #RRGGBB.';
COMMENT ON TABLE  board_columns IS 'Columnas de un tablero, ordenadas por position (base 0, contiguas).';
COMMENT ON COLUMN board_columns.position IS 'Posición base 0 dentro del tablero; UNIQUE diferible para reordenar en transacción.';
COMMENT ON COLUMN board_columns.wip_limit IS 'Límite de trabajo en curso; NULL = sin límite.';
COMMENT ON TABLE  tasks IS 'Tarjetas Kanban dentro de una columna.';
COMMENT ON COLUMN tasks.position IS 'Posición base 0 dentro de la columna; UNIQUE diferible para reordenar en transacción.';
COMMENT ON COLUMN tasks.assignee_id IS 'Usuario asignado; SET NULL si el usuario se elimina.';
COMMENT ON COLUMN tasks.created_by IS 'Usuario creador; SET NULL si el usuario se elimina.';
COMMENT ON TABLE  labels IS 'Etiquetas de un tablero; nombre único por tablero.';
COMMENT ON TABLE  task_labels IS 'Relación N:M entre tareas y etiquetas.';
COMMENT ON TABLE  task_comments IS 'Comentarios de una tarea.';
COMMENT ON COLUMN task_comments.author_id IS 'Autor; SET NULL si el usuario se elimina.';
