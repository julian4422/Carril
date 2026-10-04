import { BoardDetail, ColumnOut, LabelOut, TaskOut, UserOut } from './core/models/api.models';

export const USER: UserOut = { id: 'u1', email: 'ana@example.com', full_name: 'Ana Pérez', created_at: '2026-01-01T00:00:00Z' };

export function makeTask(id: string, columnId: string, position: number, extra: Partial<TaskOut> = {}): TaskOut {
  return {
    id, column_id: columnId, title: `Tarea ${id}`, description: null, priority: 'medium', due_date: null,
    position, assignee_id: null, labels: [], comment_count: 0,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...extra,
  };
}

export function makeColumn(id: string, position: number, tasks: TaskOut[] = [], extra: Partial<ColumnOut> = {}): ColumnOut {
  return { id, board_id: 'b1', name: `Col ${id}`, position, wip_limit: null, tasks, ...extra };
}

export const LABEL: LabelOut = { id: 'l1', board_id: 'b1', name: 'Bug', color: '#ff0000' };

/** Tablero: c1 [t1,t2,t3], c2 [t4], c3 []. */
export function makeBoard(): BoardDetail {
  return {
    id: 'b1', name: 'Mi tablero', description: null, color: '#0f6e63',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    columns: [
      makeColumn('c1', 0, [makeTask('t1', 'c1', 0), makeTask('t2', 'c1', 1), makeTask('t3', 'c1', 2)]),
      makeColumn('c2', 1, [makeTask('t4', 'c2', 0)]),
      makeColumn('c3', 2, []),
    ],
    labels: [LABEL],
  };
}
