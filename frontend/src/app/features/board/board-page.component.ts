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
import { AutoScrollTarget, PointerDragSession } from './pointer-drag';
import { dropTarget, pickColumn } from './pointer-drag.logic';
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

  private session: PointerDragSession | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.session?.dispose());
    this.route.paramMap.pipe(takeUntilDestroyed(destroyRef)).subscribe((p) => {
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

  // ---------- arrastre con Pointer Events (ratón, dedo y lápiz) ----------
  protected onTaskPointerDown(ev: PointerEvent, task: TaskOut): void {
    if (!this.canStartDrag(ev)) return;
    this.startDrag(ev, ev.currentTarget as HTMLElement, false, { kind: 'task', id: task.id });
  }

  protected onColumnPointerDown(ev: PointerEvent, col: ColumnOut): void {
    const target = ev.target as HTMLElement;
    if (!this.canStartDrag(ev) || target.closest('.menu')) return;
    const column = (ev.currentTarget as HTMLElement).closest<HTMLElement>('.column');
    if (!column) return;
    this.startDrag(ev, column, !!target.closest('.grip'), { kind: 'column', id: col.id });
  }

  private canStartDrag(ev: PointerEvent): boolean {
    if (this.session && this.session.phase !== 'done') return false;
    if (!ev.isPrimary) return false;
    return ev.pointerType !== 'mouse' || ev.button === 0;
  }

  private startDrag(ev: PointerEvent, element: HTMLElement, fromHandle: boolean, state: NonNullable<DragState>): void {
    this.session = new PointerDragSession(
      ev,
      {
        start: () => this.drag.set(state),
        move: (x, y) => (state.kind === 'task' ? this.hintTask(state.id, x, y) : this.hintColumn(state.id, x)),
        drop: () => this.dropDragged(),
        cancel: () => this.endDrag(),
        scrollers: (x) => this.autoScrollTargets(x, state.kind),
      },
      { element, fromHandle },
    );
  }

  private columnEls(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.columns > .column'));
  }

  private columnUnder(x: number): HTMLElement | null {
    const els = this.columnEls();
    const id = pickColumn(x, els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset['columnId']!, left: r.left, right: r.right };
    }));
    return els.find((el) => el.dataset['columnId'] === id) ?? null;
  }

  private hintTask(taskId: string, x: number, y: number): void {
    const colEl = this.columnUnder(x);
    if (!colEl) {
      this.taskHint.set(null);
      return;
    }
    const items = Array.from(colEl.querySelectorAll<HTMLElement>('.list > .item'))
      .filter((el) => el.dataset['taskId'] !== taskId)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset['taskId']!, start: r.top, size: r.height };
      });
    const hint = dropTarget(y, items);
    const next = { columnId: colEl.dataset['columnId']!, taskId: hint.id, after: hint.after };
    const prev = this.taskHint();
    if (!prev || prev.columnId !== next.columnId || prev.taskId !== next.taskId || prev.after !== next.after) {
      this.taskHint.set(next);
    }
  }

  private hintColumn(columnId: string, x: number): void {
    const spans = this.columnEls()
      .filter((el) => el.dataset['columnId'] !== columnId)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset['columnId']!, start: r.left, size: r.width };
      });
    const hint = dropTarget(x, spans);
    const prev = this.columnHint();
    if (hint.id === null) this.columnHint.set(null);
    else if (!prev || prev.id !== hint.id || prev.after !== hint.after) this.columnHint.set({ id: hint.id, after: hint.after });
  }

  private autoScrollTargets(x: number, kind: 'task' | 'column'): AutoScrollTarget[] {
    const targets: AutoScrollTarget[] = [];
    const board = this.host.nativeElement.querySelector('.columns');
    if (board) targets.push({ el: board, axis: 'x' });
    const list = kind === 'task' ? this.columnUnder(x)?.querySelector('.list') : null;
    if (list) targets.push({ el: list, axis: 'y' });
    return targets;
  }

  private dropDragged(): void {
    const d = this.drag();
    const taskHint = this.taskHint();
    const columnHint = this.columnHint();
    this.endDrag();
    if (d?.kind === 'task' && taskHint) {
      const col = this.store.columns().find((c) => c.id === taskHint.columnId);
      if (!col) return;
      const idx = dropIndex(col.tasks.map((t) => t.id), d.id, taskHint.taskId, taskHint.after);
      void this.moveTask(d.id, col, idx);
    } else if (d?.kind === 'column' && columnHint) {
      const idx = dropIndex(this.store.columns().map((c) => c.id), d.id, columnHint.id, columnHint.after);
      void this.moveColumn(d.id, idx);
    }
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
