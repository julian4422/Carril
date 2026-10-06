import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** Botón propio: `<button uiButton variant="primary">`. */
@Component({
  selector: 'button[uiButton]',
  template: `<ng-content />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
    '[attr.type]': 'type()',
    '[attr.aria-busy]': 'busy() ? "true" : null',
    '[disabled]': 'busy() || disabled()',
  },
  styles: `
    :host {
      display: inline-flex; align-items: center; justify-content: center; gap: .4rem;
      font: inherit; font-weight: 600; line-height: 1.2; cursor: pointer;
      padding: .55rem 1rem; border-radius: var(--radius-sm); border: 1px solid transparent;
      transition: background-color .15s, border-color .15s, transform .05s;
      white-space: nowrap;
    }
    :host([data-size='sm']) { padding: .3rem .65rem; font-size: .85rem; }
    @media (pointer: coarse), (max-width: 640px) {
      :host { min-height: 44px; }
      :host([data-size='sm']) { min-height: 44px; padding-inline: .8rem; }
    }
    :host(:active:not(:disabled)) { transform: translateY(1px); }
    :host(:disabled) { opacity: .55; cursor: not-allowed; }
    :host([data-variant='primary']) { background: var(--accent); color: var(--accent-contrast); }
    :host([data-variant='primary']:hover:not(:disabled)) { background: var(--accent-strong); }
    :host([data-variant='secondary']) { background: var(--surface); color: var(--text); border-color: var(--border-strong); }
    :host([data-variant='secondary']:hover:not(:disabled)) { background: var(--surface-2); }
    :host([data-variant='ghost']) { background: transparent; color: var(--text-muted); }
    :host([data-variant='ghost']:hover:not(:disabled)) { background: var(--surface-2); color: var(--text); }
    :host([data-variant='danger']) { background: var(--danger); color: #fff; }
    :host([data-variant='danger']:hover:not(:disabled)) { filter: brightness(.92); }
  `,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<'md' | 'sm'>('md');
  readonly type = input<'button' | 'submit'>('button');
  readonly busy = input(false);
  readonly disabled = input(false);
}
