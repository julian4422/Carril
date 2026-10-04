import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ColumnOut, PRIORITIES, TaskOut } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { AppHeaderComponent } from '../../shared/ui/app-header.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { InputComponent } from '../../shared/ui/input.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PluralPipe } from '../../shared/pipes/plural.pipe';
import { dropIndex } from './board.logic';
import { BoardStore } from './board.store';
import { TaskCardComponent } from './task-card.component';
import { TaskDetailComponent } from './task-detail.component';

type DragState = { kind: 'task' | 'column'; id: string } | null;
interface TaskHint { columnId: string; taskId: string | null; after: boolean }
interface ColumnHint { id: string; after: boolean }

const PRIORITY_LABEL: Record<string, string> = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' };

@Component({
  selector: 'app-board-page',
  imports: [
    ReactiveFormsModule, RouterLink, AppHeaderComponent, ButtonComponent, ConfirmDialogComponent,
    InputComponent, ModalComponent, TaskCardComponent, TaskDetailComponent, PluralPipe,
  ],
  providers: [BoardStore],
  templateUrl: './board-page.component.html',
  styleUrl: './board-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardPageComponent {
  protected readonly store = inject(BoardStore);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly auth = inject(AuthService);

  protected readonly priorities = PRIORITIES;
  protected readonly priorityLabel = PRIORITY_LABEL;
  protected readonly me = this.auth.user;

  protected readonly drag = signal<DragState>(null);
  protected readonly taskHint = signal<TaskHint | null>(null);
  protected readonly columnHint = signal<ColumnHint | null>(null);
  protected readonly announcement = signal('');

  protected readonly selectedTaskId = signal<string | null>(null);
  protected readonly addingIn = signal<string | null>(null);
  protected readonly quickTitle = new FormControl('', { nonNullable: true });
  protected readonly addingColumn = signal(false);
  protected readonly editingColumn = signal<ColumnOut | null>(null);
  protected readonly deletingColumn = signal<ColumnOut | null>(null);
  protected readonly busy = signal(false);

  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly newColumnForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
  });
  protected readonly columnForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    wip: ['', [Validators.pattern(/^([1-9]\d{0,3})?$/)]],
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((p) => {
      const id = p.get('id');
      if (id) void this.store.load(id);
    });
  }

  // ---------- filtros ----------
  protected onSearch(ev: Event): void {
    this.store.filterText.set((ev.target as HTMLInputElement).value);
  }
  protected onPriority(ev: Event): void {
    this.store.filterPriority.set((ev.target as HTMLSelectElement).value);
  }
  protected reload(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) void this.store.load(id);
  }

  // ---------- tarjetas ----------
  protected startAdding(columnId: string): void {
    this.quickTitle.reset('');
    this.addingIn.set(columnId);
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('.quick textarea')?.focus());
  }

  protected async submitQuick(columnId: string): Promise<void> {
    const title = this.quickTitle.value.trim();
    if (!title) return;
    this.quickTitle.reset('');
    await this.store.createTask(columnId, { title });
  }

  protected onQuickKey(ev: KeyboardEvent, columnId: string): void {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      void this.submitQuick(columnId);
    } else if (ev.key === 'Escape') {
      this.addingIn.set(null);
    }
  }

  protected assigneeName(task: TaskOut): string | null {
    const u = this.me();
    return u && task.assignee_id === u.id ? u.full_name : null;
  }

  // ---------- columnas ----------
  protected async addColumn(): Promise<void> {
    if (this.newColumnForm.invalid) {
      this.newColumnForm.markAllAsTouched();
      return;
    }
    const col = await this.store.addColumn(this.newColumnForm.getRawValue().name.trim());
    if (col) {
      this.newColumnForm.reset();
      this.addingColumn.set(false);
    }
  }

  protected openColumnSettings(col: ColumnOut): void {
    this.columnForm.reset({ name: col.name, wip: col.wip_limit?.toString() ?? '' });
    this.editingColumn.set(col);
  }

  protected async saveColumn(): Promise<void> {
    const col = this.editingColumn();
    if (!col) return;
    if (this.columnForm.invalid) {
      this.columnForm.markAllAsTouched();
      return;
    }
    const { name, wip } = this.columnForm.getRawValue();
    this.busy.set(true);
    const ok = await this.store.updateColumn(col.id, { name: name.trim(), wip_limit: wip ? Number(wip) : null });
    this.busy.set(false);
    if (ok) this.editingColumn.set(null);
  }

  protected askDeleteColumn(): void {
    this.deletingColumn.set(this.editingColumn());
    this.editingColumn.set(null);
  }

  protected async confirmDeleteColumn(): Promise<void> {
    const col = this.deletingColumn();
    if (!col) return;
    this.busy.set(true);
    const ok = await this.store.deleteColumn(col.id);
    this.busy.set(false);
    if (ok) this.deletingColumn.set(null);
  }

  // ---------- drag & drop: tarjetas ----------
  protected onTaskDragStart(ev: DragEvent, task: TaskOut): void {
    ev.stopPropagation();
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', task.id);
    }
    this.drag.set({ kind: 'task', id: task.id });
  }

  protected onTaskDragOver(ev: DragEvent, col: ColumnOut, task: TaskOut): void {
    if (this.drag()?.kind !== 'task') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.taskHint.set({ columnId: col.id, taskId: task.id, after: ev.clientY > rect.top + rect.height / 2 });
  }

  protected onTaskDrop(ev: DragEvent, col: ColumnOut, task: TaskOut): void {
    const d = this.drag();
    if (d?.kind !== 'task') return;
    ev.preventDefault();
    ev.stopPropagation();
    const after = this.taskHint()?.after ?? false;
    this.endDrag();
    if (d.id === task.id) return;
    const idx = dropIndex(col.tasks.map((t) => t.id), d.id, task.id, after);
    void this.moveTask(d.id, col, idx);
  }

  protected onListDragOver(ev: DragEvent, col: ColumnOut): void {
    if (this.drag()?.kind !== 'task') return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    this.taskHint.set({ columnId: col.id, taskId: null, after: true });
  }

  protected onListDrop(ev: DragEvent, col: ColumnOut): void {
    const d = this.drag();
    if (d?.kind !== 'task') return;
    ev.preventDefault();
    this.endDrag();
    const idx = dropIndex(col.tasks.map((t) => t.id), d.id, null, true);
    void this.moveTask(d.id, col, idx);
  }

  // ---------- drag & drop: columnas ----------
  protected onColumnDragStart(ev: DragEvent, col: ColumnOut): void {
    if (this.drag()?.kind === 'task') return;
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', col.id);
    }
    this.drag.set({ kind: 'column', id: col.id });
  }

  protected onColumnDragOver(ev: DragEvent, col: ColumnOut): void {
    const d = this.drag();
    if (d?.kind !== 'column' || d.id === col.id) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.columnHint.set({ id: col.id, after: ev.clientX > rect.left + rect.width / 2 });
  }

  protected onColumnDrop(ev: DragEvent, col: ColumnOut): void {
    const d = this.drag();
    if (d?.kind !== 'column' || d.id === col.id) return;
    ev.preventDefault();
    const after = this.columnHint()?.after ?? false;
    this.endDrag();
    const idx = dropIndex(this.store.columns().map((c) => c.id), d.id, col.id, after);
    void this.moveColumn(d.id, idx);
  }

  protected endDrag(): void {
    this.drag.set(null);
    this.taskHint.set(null);
    this.columnHint.set(null);
  }

  // ---------- teclado (alternativa accesible al arrastre) ----------
  protected onCardKeydown(ev: KeyboardEvent, col: ColumnOut, task: TaskOut): void {
    if (!ev.altKey) return;
    const cols = this.store.columns();
    const ci = cols.findIndex((c) => c.id === col.id);
    const ti = col.tasks.findIndex((t) => t.id === task.id);
    let target: ColumnOut | null = null;
    let index = ti;
    switch (ev.key) {
      case 'ArrowUp': target = col; index = ti - 1; break;
      case 'ArrowDown': target = col; index = ti + 1; break;
      case 'ArrowLeft': target = cols[ci - 1] ?? null; index = Math.min(ti, target?.tasks.length ?? 0); break;
      case 'ArrowRight': target = cols[ci + 1] ?? null; index = Math.min(ti, target?.tasks.length ?? 0); break;
      default: return;
    }
    ev.preventDefault();
    if (!target || index < 0 || (target.id === col.id && index >= col.tasks.length)) return;
    void this.moveTask(task.id, target, index).then(() => this.refocus(`[data-task-id="${task.id}"] [role="button"]`));
  }

  protected onColumnKeydown(ev: KeyboardEvent, col: ColumnOut): void {
    if (!ev.altKey || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    ev.preventDefault();
    const ids = this.store.columns().map((c) => c.id);
    const i = ids.indexOf(col.id);
    const to = ev.key === 'ArrowLeft' ? i - 1 : i + 1;
    if (to < 0 || to >= ids.length) return;
    void this.moveColumn(col.id, to).then(() => this.refocus(`[data-column-id="${col.id}"] .grip`));
  }

  private async moveTask(taskId: string, col: ColumnOut, index: number): Promise<void> {
    const title = this.store.taskById(taskId)?.title ?? 'Tarjeta';
    const ok = await this.store.moveTask(taskId, col.id, index);
    this.announcement.set(
      ok ? `${title} movida a ${col.name}, posición ${index + 1}.` : `No se pudo mover ${title}; se restauró su lugar.`,
    );
  }

  private async moveColumn(id: string, index: number): Promise<void> {
    const name = this.store.columns().find((c) => c.id === id)?.name ?? 'Columna';
    const ok = await this.store.moveColumn(id, index);
    this.announcement.set(
      ok ? `Columna ${name} movida a la posición ${index + 1}.` : `No se pudo mover la columna ${name}.`,
    );
  }

  private refocus(selector: string): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus());
  }
}
