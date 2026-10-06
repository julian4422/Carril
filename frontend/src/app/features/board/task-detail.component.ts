import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CommentOut, PRIORITIES } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { CommentsService } from '../../core/services/comments.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ChipComponent } from '../../shared/ui/chip.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { InputComponent } from '../../shared/ui/input.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { BoardStore } from './board.store';

/** Detalle de tarjeta: edición, asignación, etiquetas, comentarios y borrado. */
@Component({
  selector: 'app-task-detail',
  imports: [ReactiveFormsModule, ModalComponent, ButtonComponent, InputComponent, ChipComponent, ConfirmDialogComponent],
  template: `
    @if (task(); as t) {
      <ui-modal title="Detalle de la tarjeta" size="lg" (closed)="closed.emit()">
        <div class="layout">
          <form id="task-form" class="form" [formGroup]="form" (ngSubmit)="save()" novalidate>
            <ui-input label="Título" formControlName="title" [maxlength]="200" [required]="true" />
            <ui-input label="Descripción" formControlName="description" [multiline]="true" [rows]="4" />
            <div class="row">
              <div class="field">
                <label for="td-prio">Prioridad</label>
                <select id="td-prio" class="field-select" formControlName="priority">
                  @for (p of priorities; track p) {<option [value]="p">{{ priorityLabel[p] }}</option>}
                </select>
              </div>
              <ui-input label="Fecha límite" type="date" formControlName="due_date" />
            </div>
            <div class="assign">
              <span>{{ t.assignee_id === me()?.id ? 'Asignada a ti' : t.assignee_id ? 'Asignada a otra persona' : 'Sin asignar' }}</span>
              <button uiButton size="sm" (click)="toggleAssign()">{{ t.assignee_id === me()?.id ? 'Quitarme' : 'Asignarme' }}</button>
            </div>
          </form>

          <aside class="side">
            <section aria-labelledby="td-labels">
              <h3 id="td-labels">Etiquetas</h3>
              @if (store.labels().length === 0) {<p class="muted">Este tablero aún no tiene etiquetas.</p>}
              <ul class="labels">
                @for (l of store.labels(); track l.id) {
                  <li>
                    <label class="lbl">
                      <input type="checkbox" [checked]="hasLabel(l.id)" (change)="toggleLabel(l.id)" />
                      <ui-chip [color]="l.color">{{ l.name }}</ui-chip>
                    </label>
                  </li>
                }
              </ul>
              <form class="new-label" [formGroup]="labelForm" (ngSubmit)="createLabel()">
                <label for="td-lname" class="visually-hidden">Nombre de la etiqueta nueva</label>
                <input id="td-lname" class="field-select" placeholder="Nueva etiqueta" formControlName="name" maxlength="40" />
                <label for="td-lcolor" class="visually-hidden">Color de la etiqueta</label>
                <input id="td-lcolor" type="color" formControlName="color" />
                <button uiButton size="sm" type="submit">Crear</button>
              </form>
            </section>

            <section aria-labelledby="td-comments">
              <h3 id="td-comments">Comentarios ({{ comments().length }})</h3>
              @if (loadingComments()) {<p class="muted" role="status">Cargando…</p>}
              @else if (comments().length === 0) {<p class="muted">Sin comentarios todavía.</p>}
              <ul class="comments">
                @for (c of comments(); track c.id) {
                  <li><strong>{{ c.author?.full_name ?? 'Usuario eliminado' }}</strong>
                    <time [attr.datetime]="c.created_at">{{ formatDate(c.created_at) }}</time>
                    <p>{{ c.body }}</p></li>
                }
              </ul>
              <form class="comment-form" [formGroup]="commentForm" (ngSubmit)="addComment()">
                <label for="td-comment" class="visually-hidden">Nuevo comentario</label>
                <textarea id="td-comment" rows="2" class="field-select" placeholder="Escribe un comentario…" formControlName="body" maxlength="2000"></textarea>
                <button uiButton size="sm" variant="primary" type="submit" [busy]="postingComment()">Comentar</button>
              </form>
            </section>
          </aside>
        </div>
        <ng-container modal-footer>
          <button uiButton variant="danger" class="push-left" (click)="confirmingDelete.set(true)">Eliminar tarjeta</button>
          <button uiButton variant="ghost" (click)="closed.emit()">Cerrar</button>
          <button uiButton variant="primary" type="submit" form="task-form" [busy]="saving()">Guardar cambios</button>
        </ng-container>
      </ui-modal>
      @if (confirmingDelete()) {
        <ui-confirm title="Eliminar tarjeta" [message]="'Se eliminará «' + t.title + '» y sus comentarios.'" [busy]="saving()" (confirmed)="remove()" (cancelled)="confirmingDelete.set(false)" />
      }
    }
  `,
  styles: `
    .layout { display: grid; gap: 1.25rem; grid-template-columns: 1fr; }
    @media (min-width: 760px) { .layout { grid-template-columns: 1.2fr 1fr; } }
    .form, .side { display: grid; gap: 1rem; align-content: start; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
    @media (max-width: 420px) { .row { grid-template-columns: 1fr; } }
    .lbl { min-height: 44px; }
    .field { display: grid; gap: .3rem; }
    .field label { font-weight: 600; font-size: .9rem; }
    .assign { display: flex; align-items: center; justify-content: space-between; gap: .5rem; padding: .5rem .7rem; background: var(--surface-2); border-radius: var(--radius-sm); }
    h3 { margin: 0 0 .5rem; font-size: 1rem; }
    .muted { margin: 0 0 .5rem; color: var(--text-muted); font-size: .9rem; }
    ul { list-style: none; margin: 0 0 .5rem; padding: 0; }
    .labels { display: flex; flex-wrap: wrap; gap: .4rem; }
    .lbl { display: inline-flex; align-items: center; gap: .3rem; cursor: pointer; }
    .new-label, .comment-form { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; }
    .new-label input[type='text'], .new-label .field-select { flex: 1; min-width: 7rem; }
    .comment-form textarea { flex: 1 1 100%; resize: vertical; }
    .comments li { padding: .5rem 0; border-bottom: 1px solid var(--border); }
    .comments time { margin-left: .5rem; font-size: .75rem; color: var(--text-muted); }
    .comments p { margin: .2rem 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .push-left { margin-right: auto; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDetailComponent implements OnInit {
  readonly taskId = input.required<string>();
  readonly closed = output<void>();

  protected readonly store = inject(BoardStore);
  private readonly commentsApi = inject(CommentsService);
  protected readonly me = inject(AuthService).user;

  protected readonly priorities = PRIORITIES;
  protected readonly priorityLabel = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' };
  protected readonly task = computed(() => this.store.taskById(this.taskId()));
  protected readonly comments = signal<CommentOut[]>([]);
  protected readonly loadingComments = signal(true);
  protected readonly postingComment = signal(false);
  protected readonly saving = signal(false);
  protected readonly confirmingDelete = signal(false);

  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: [''],
    priority: ['medium'],
    due_date: [''],
  });
  protected readonly labelForm = this.fb.group({ name: [''], color: ['#0f6e63'] });
  protected readonly commentForm = this.fb.group({ body: [''] });

  constructor() {
    // Si la tarjeta desaparece (borrada), cierra el panel.
    effect(() => {
      if (!this.task()) this.closed.emit();
    });
  }

  ngOnInit(): void {
    const t = this.task();
    if (t) {
      this.form.reset({
        title: t.title,
        description: t.description ?? '',
        priority: t.priority,
        due_date: t.due_date ?? '',
      });
    }
    void this.loadComments();
  }

  protected formatDate(iso: string): string {
    return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  }

  private async loadComments(): Promise<void> {
    try {
      this.comments.set(await firstValueFrom(this.commentsApi.list(this.taskId())));
    } catch {
      /* toast desde el interceptor */
    } finally {
      this.loadingComments.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    const res = await this.store.updateTask(this.taskId(), {
      title: v.title.trim(),
      description: v.description.trim() || null,
      priority: v.priority as never,
      due_date: v.due_date || null,
    });
    this.saving.set(false);
    if (res) this.closed.emit();
  }

  protected async toggleAssign(): Promise<void> {
    const t = this.task();
    const u = this.me();
    if (!t || !u) return;
    await this.store.updateTask(t.id, { assignee_id: t.assignee_id === u.id ? null : u.id });
  }

  protected hasLabel(id: string): boolean {
    return !!this.task()?.labels.some((l) => l.id === id);
  }

  protected async toggleLabel(id: string): Promise<void> {
    const t = this.task();
    if (!t) return;
    const ids = t.labels.map((l) => l.id);
    await this.store.setTaskLabels(t.id, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  protected async createLabel(): Promise<void> {
    const { name, color } = this.labelForm.getRawValue();
    if (!name.trim()) return;
    const label = await this.store.createLabel(name.trim(), color);
    if (!label) return;
    this.labelForm.reset({ name: '', color });
    const t = this.task();
    if (t) await this.store.setTaskLabels(t.id, [...t.labels.map((l) => l.id), label.id]);
  }

  protected async addComment(): Promise<void> {
    const body = this.commentForm.getRawValue().body.trim();
    if (!body) return;
    this.postingComment.set(true);
    try {
      const c = await firstValueFrom(this.commentsApi.create(this.taskId(), body));
      this.comments.update((l) => [...l, c]);
      this.store.adjustCommentCount(this.taskId(), 1);
      this.commentForm.reset({ body: '' });
    } catch {
      /* toast desde el interceptor */
    } finally {
      this.postingComment.set(false);
    }
  }

  protected async remove(): Promise<void> {
    this.saving.set(true);
    const ok = await this.store.deleteTask(this.taskId());
    this.saving.set(false);
    if (!ok) this.confirmingDelete.set(false);
  }
}
