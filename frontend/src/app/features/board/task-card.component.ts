import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TaskOut } from '../../core/models/api.models';
import { DueStatusPipe } from '../../shared/pipes/due-status.pipe';
import { InitialsPipe } from '../../shared/pipes/initials.pipe';
import { ShortDatePipe } from '../../shared/pipes/short-date.pipe';
import { PluralPipe } from '../../shared/pipes/plural.pipe';
import { ChipComponent } from '../../shared/ui/chip.component';

/** Tarjeta del tablero (presentacional). El arrastre lo gestiona la página. */
@Component({
  selector: 'app-task-card',
  imports: [PluralPipe, ChipComponent, DueStatusPipe, ShortDatePipe, InitialsPipe],
  template: `
    <div
      class="card"
      role="button"
      tabindex="0"
      aria-describedby="dnd-help"
      aria-roledescription="tarjeta arrastrable"
      [attr.aria-label]="ariaLabel()"
      (click)="open.emit()"
      (keydown.enter)="open.emit()"
      (keydown.space)="$event.preventDefault(); open.emit()"
    >
      @if (task().labels.length) {
        <div class="labels">
          @for (l of task().labels; track l.id) {<ui-chip [color]="l.color">{{ l.name }}</ui-chip>}
        </div>
      }
      <p class="title">{{ task().title }}</p>
      <div class="meta">
        <ui-chip [priority]="task().priority" />
        @if (task().due_date; as due) {
          @let status = due | dueStatus;
          <span class="due" [attr.data-status]="status">
            <span aria-hidden="true">{{ status === 'overdue' ? '⚠' : '◷' }}</span>
            {{ due | shortDate }}@if (status === 'overdue') { · Vencida }
          </span>
        }
        @if (task().comment_count > 0) {
          <span class="count" [attr.aria-label]="(task().comment_count | plural:'comentario':'comentarios')">
            <span aria-hidden="true">✎</span> {{ task().comment_count }}
          </span>
        }
        @if (assigneeName(); as n) {
          <span class="avatar" [attr.title]="'Asignada a ' + n">{{ n | initials }}</span>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .6rem .7rem; box-shadow: var(--shadow); cursor: grab; display: grid; gap: .4rem; }
    .card:hover { border-color: var(--border-strong); }
    :host-context(.dragging) .card { opacity: .45; }
    .labels { display: flex; flex-wrap: wrap; gap: .25rem; }
    .title { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; font-size: .8rem; color: var(--text-muted); }
    .due { padding: .05rem .4rem; border-radius: 6px; background: var(--surface-2); }
    .due[data-status='soon'], .due[data-status='today'] { background: var(--warn-bg); color: var(--warn); font-weight: 600; }
    .due[data-status='overdue'] { background: var(--overdue-bg); color: var(--overdue); font-weight: 700; }
    .avatar { margin-left: auto; display: grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--accent); color: var(--accent-contrast); font-weight: 700; font-size: .7rem; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskCardComponent {
  readonly task = input.required<TaskOut>();
  readonly columnName = input('');
  /** Nombre del usuario si la tarjeta está asignada a él. */
  readonly assigneeName = input<string | null>(null);
  readonly open = output<void>();

  protected readonly ariaLabel = computed(() => {
    const t = this.task();
    const parts = [t.title, `prioridad ${PRIORITY_ES[t.priority]}`];
    if (this.columnName()) parts.push(`en ${this.columnName()}`);
    if (t.due_date) parts.push(`vence ${t.due_date}`);
    return parts.join(', ');
  });
}

const PRIORITY_ES = { low: 'baja', medium: 'media', high: 'alta', urgent: 'urgente' } as const;
