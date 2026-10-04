import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Priority } from '../../core/models/api.models';

const PRIORITY_META: Record<Priority, { label: string; glyph: string }> = {
  low: { label: 'Baja', glyph: '▽' },
  medium: { label: 'Media', glyph: '○' },
  high: { label: 'Alta', glyph: '△' },
  urgent: { label: 'Urgente', glyph: '◆' },
};

/**
 * Chip de prioridad (color + forma + texto) o de etiqueta (`color`).
 * La forma (▽ ○ △ ◆) evita depender solo del color.
 */
@Component({
  selector: 'ui-chip',
  template: `
    @if (priority(); as p) {
      <span class="chip" [attr.data-priority]="p">
        <span aria-hidden="true">{{ meta().glyph }}</span>{{ meta().label }}
      </span>
    } @else {
      <span class="chip chip--label" [style.--chip-color]="color()">
        <span class="dot" aria-hidden="true"></span><ng-content />
      </span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: inline-flex; }
    .chip {
      display: inline-flex; align-items: center; gap: .3rem; font-size: .75rem; font-weight: 600;
      padding: .1rem .5rem; border-radius: 999px; border: 1px solid currentColor; line-height: 1.4;
    }
    .chip[data-priority='low'] { color: var(--prio-low); border-style: dotted; }
    .chip[data-priority='medium'] { color: var(--prio-medium); }
    .chip[data-priority='high'] { color: var(--prio-high); border-width: 2px; padding: calc(.1rem - 1px) calc(.5rem - 1px); }
    .chip[data-priority='urgent'] { color: #fff; background: var(--prio-urgent); border-color: var(--prio-urgent); }
    .chip--label { color: var(--text); border-color: var(--border-strong); background: var(--surface); font-weight: 500; }
    .dot { width: .6rem; height: .6rem; border-radius: 50%; background: var(--chip-color, var(--accent)); }
  `,
})
export class ChipComponent {
  readonly priority = input<Priority | null>(null);
  readonly color = input<string | null>(null);
  protected readonly meta = computed(() => PRIORITY_META[this.priority() ?? 'medium']);
}
