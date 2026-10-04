import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../../core/http-error';
import {
  BoardDetail,
  ColumnOut,
  LabelOut,
  TaskCreate,
  TaskOut,
  TaskUpdate,
} from '../../core/models/api.models';
import { BoardsService } from '../../core/services/boards.service';
import { ColumnsService } from '../../core/services/columns.service';
import { LabelsService } from '../../core/services/labels.service';
import { TasksService } from '../../core/services/tasks.service';
import {
  matchesFilter,
  moveTaskInColumns,
  reorderColumns,
  replaceTask,
  withPositions,
} from './board.logic';

export interface ColumnView {
  column: ColumnOut;
  tasks: TaskOut[];
  overWip: boolean;
}

/**
 * Estado del tablero abierto, basado en signals. Los movimientos (tarjetas y columnas)
 * son optimistas: se aplican al instante y se revierten si la API falla.
 * Los errores HTTP ya se notifican con un toast desde el interceptor.
 */
@Injectable()
export class BoardStore {
  private readonly boardsApi = inject(BoardsService);
  private readonly columnsApi = inject(ColumnsService);
  private readonly tasksApi = inject(TasksService);
  private readonly labelsApi = inject(LabelsService);

  readonly board = signal<BoardDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly filterText = signal('');
  readonly filterPriority = signal('');

  readonly columns = computed(() => this.board()?.columns ?? []);
  readonly labels = computed(() => this.board()?.labels ?? []);
  readonly filtering = computed(() => !!this.filterText().trim() || !!this.filterPriority());

  readonly view = computed<ColumnView[]>(() => {
    const text = this.filterText();
    const prio = this.filterPriority();
    return this.columns().map((column) => ({
      column,
      tasks: column.tasks.filter((t) => matchesFilter(t, text, prio)),
      overWip: column.wip_limit !== null && column.tasks.length > column.wip_limit,
    }));
  });

  taskById(id: string | null): TaskOut | null {
    if (!id) return null;
    for (const col of this.columns()) {
      const t = col.tasks.find((x) => x.id === id);
      if (t) return t;
    }
    return null;
  }

  async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.board.set(null);
    try {
      this.board.set(await firstValueFrom(this.boardsApi.get(id)));
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  clearFilters(): void {
    this.filterText.set('');
    this.filterPriority.set('');
  }

  // ---------- columnas ----------

  async addColumn(name: string, wipLimit: number | null = null): Promise<ColumnOut | null> {
    const b = this.board();
    if (!b) return null;
    try {
      const col = await firstValueFrom(this.columnsApi.create(b.id, { name, wip_limit: wipLimit }));
      this.setColumns([...this.columns(), { ...col, tasks: col.tasks ?? [] }]);
      return col;
    } catch {
      return null;
    }
  }

  async updateColumn(id: string, patch: { name?: string; wip_limit?: number | null }): Promise<boolean> {
    try {
      const res = await firstValueFrom(this.columnsApi.update(id, patch));
      this.setColumns(
        this.columns().map((c) => (c.id === id ? { ...c, name: res.name, wip_limit: res.wip_limit } : c)),
      );
      return true;
    } catch {
      return false;
    }
  }

  async deleteColumn(id: string): Promise<boolean> {
    try {
      await firstValueFrom(this.columnsApi.remove(id));
      this.setColumns(withPositions(this.columns().filter((c) => c.id !== id)));
      return true;
    } catch {
      return false;
    }
  }

  /** Reordena una columna (optimista). `toIndex` es el índice final. */
  async moveColumn(columnId: string, toIndex: number): Promise<boolean> {
    const b = this.board();
    if (!b) return false;
    const before = b.columns;
    const next = reorderColumns(before, columnId, toIndex);
    if (next.every((c, i) => c.id === before[i].id)) return true;
    this.setColumns(next);
    try {
      await firstValueFrom(
        this.columnsApi.reorder(b.id, next.map((c) => c.id)),
      );
      return true;
    } catch {
      this.setColumns(before);
      return false;
    }
  }

  // ---------- tarjetas ----------

  async createTask(columnId: string, body: TaskCreate): Promise<TaskOut | null> {
    try {
      const task = await firstValueFrom(this.tasksApi.create(columnId, body));
      this.setColumns(
        this.columns().map((c) => (c.id === columnId ? { ...c, tasks: [...c.tasks, task] } : c)),
      );
      return task;
    } catch {
      return null;
    }
  }

  async updateTask(id: string, patch: TaskUpdate): Promise<TaskOut | null> {
    try {
      const task = await firstValueFrom(this.tasksApi.update(id, patch));
      this.setColumns(replaceTask(this.columns(), task));
      return task;
    } catch {
      return null;
    }
  }

  async setTaskLabels(id: string, labelIds: string[]): Promise<TaskOut | null> {
    try {
      const task = await firstValueFrom(this.tasksApi.setLabels(id, labelIds));
      this.setColumns(replaceTask(this.columns(), task));
      return task;
    } catch {
      return null;
    }
  }

  async deleteTask(id: string): Promise<boolean> {
    try {
      await firstValueFrom(this.tasksApi.remove(id));
      this.setColumns(
        this.columns().map((c) =>
          c.tasks.some((t) => t.id === id)
            ? { ...c, tasks: withPositions(c.tasks.filter((t) => t.id !== id)) }
            : c,
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Mueve una tarjeta (optimista). `toIndex` es el índice final en la columna destino. */
  async moveTask(taskId: string, toColumnId: string, toIndex: number): Promise<boolean> {
    const before = this.columns();
    const result = moveTaskInColumns(before, taskId, toColumnId, toIndex);
    if (!result) return false;
    if (!result.changed) return true;
    this.setColumns(result.columns);
    try {
      await firstValueFrom(
        this.tasksApi.move(taskId, { column_id: result.columnId, position: result.position }),
      );
      return true;
    } catch {
      this.setColumns(before);
      return false;
    }
  }

  adjustCommentCount(taskId: string, delta: number): void {
    const task = this.taskById(taskId);
    if (task) {
      this.setColumns(replaceTask(this.columns(), { ...task, comment_count: Math.max(0, task.comment_count + delta) }));
    }
  }

  // ---------- etiquetas ----------

  async createLabel(name: string, color: string): Promise<LabelOut | null> {
    const b = this.board();
    if (!b) return null;
    try {
      const label = await firstValueFrom(this.labelsApi.create(b.id, { name, color }));
      this.board.update((cur) =>
        cur ? { ...cur, labels: [...cur.labels, label].sort((a, z) => a.name.localeCompare(z.name)) } : cur,
      );
      return label;
    } catch {
      return null;
    }
  }

  private setColumns(columns: ColumnOut[]): void {
    this.board.update((b) => (b ? { ...b, columns } : b));
  }
}
