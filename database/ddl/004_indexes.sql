-- Índices en todas las FK (las UNIQUE ya cubren (board_id, position) y (column_id, position)).
CREATE INDEX IF NOT EXISTS idx_boards_owner_id          ON boards (owner_id);
CREATE INDEX IF NOT EXISTS idx_boards_owner_created     ON boards (owner_id, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_board_columns_board_pos  ON board_columns (board_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_column_pos         ON tasks (column_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id        ON tasks (assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by         ON tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_labels_board_id          ON labels (board_id);
CREATE INDEX IF NOT EXISTS idx_task_labels_label_id     ON task_labels (label_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_created ON task_comments (task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_comments_author_id  ON task_comments (author_id);
