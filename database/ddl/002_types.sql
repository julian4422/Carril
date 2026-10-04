DO $$
BEGIN
    CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON TYPE task_priority IS 'Prioridad de una tarea, de menor a mayor urgencia.';
