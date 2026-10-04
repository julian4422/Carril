import { ColumnOut, TaskOut } from '../../core/models/api.models';

/** Asigna `position` contiguo (base 0) según el orden del arreglo. */
export function withPositions<T extends { position: number }>(items: T[]): T[] {
  return items.map((item, i) => (item.position === i ? item : { ...item, position: i }));
}

/**
 * Índice final que tendrá `draggedId` al soltarlo junto a `targetId`
 * (antes o después de él). `targetId = null` significa "al final".
 */
export function dropIndex(ids: string[], draggedId: string, targetId: string | null, after: boolean): number {
  const rest = ids.filter((id) => id !== draggedId);
  if (targetId === null) return rest.length;
  const idx = rest.indexOf(targetId);
  if (idx === -1) return rest.length;
  return after ? idx + 1 : idx;
}

/** Mueve una columna a `toIndex` (índice final). Devuelve las columnas con posiciones nuevas. */
export function reorderColumns(columns: ColumnOut[], columnId: string, toIndex: number): ColumnOut[] {
  const from = columns.findIndex((c) => c.id === columnId);
  if (from === -1) return columns;
  const list = [...columns];
  const [moved] = list.splice(from, 1);
  list.splice(clamp(toIndex, 0, list.length), 0, moved);
  return withPositions(list);
}

export interface TaskMoveResult {
  columns: ColumnOut[];
  columnId: string;
  position: number;
  changed: boolean;
}

/**
 * Mueve una tarjeta a `toIndex` (índice final) de `toColumnId`, dentro de la misma
 * columna o hacia otra. Devuelve null si la tarjeta o la columna no existen.
 */
export function moveTaskInColumns(
  columns: ColumnOut[],
  taskId: string,
  toColumnId: string,
  toIndex: number,
): TaskMoveResult | null {
  const src = columns.find((c) => c.tasks.some((t) => t.id === taskId));
  const dst = columns.find((c) => c.id === toColumnId);
  if (!src || !dst) return null;
  const fromIndex = src.tasks.findIndex((t) => t.id === taskId);
  const task = src.tasks[fromIndex];
  const target = clamp(toIndex, 0, src.id === dst.id ? src.tasks.length - 1 : dst.tasks.length);
  const unchanged = src.id === dst.id && fromIndex === target;
  if (unchanged) return { columns, columnId: dst.id, position: target, changed: false };

  const next = columns.map((col) => {
    if (col.id === src.id && col.id === dst.id) {
      const tasks = col.tasks.filter((t) => t.id !== taskId);
      tasks.splice(target, 0, task);
      return { ...col, tasks: withPositions(tasks) };
    }
    if (col.id === src.id) {
      return { ...col, tasks: withPositions(col.tasks.filter((t) => t.id !== taskId)) };
    }
    if (col.id === dst.id) {
      const tasks = [...col.tasks];
      tasks.splice(target, 0, { ...task, column_id: dst.id });
      return { ...col, tasks: withPositions(tasks) };
    }
    return col;
  });
  return { columns: next, columnId: dst.id, position: target, changed: true };
}

/** Reemplaza una tarjeta (por id) dentro de las columnas. */
export function replaceTask(columns: ColumnOut[], task: TaskOut): ColumnOut[] {
  return columns.map((col) =>
    col.tasks.some((t) => t.id === task.id)
      ? { ...col, tasks: col.tasks.map((t) => (t.id === task.id ? task : t)) }
      : col,
  );
}

export function matchesFilter(task: TaskOut, text: string, priority: string): boolean {
  if (priority && task.priority !== priority) return false;
  const q = text.trim().toLowerCase();
  if (!q) return true;
  return (
    task.title.toLowerCase().includes(q) ||
    (task.description ?? '').toLowerCase().includes(q) ||
    task.labels.some((l) => l.name.toLowerCase().includes(q))
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
