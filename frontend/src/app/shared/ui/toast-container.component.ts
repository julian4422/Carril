import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'ui-toast-container',
  template: `
    <div class="stack" role="status" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [attr.data-kind]="t.kind">
          <span>{{ t.message }}</span>
          <button type="button" aria-label="Cerrar aviso" (click)="toasts.dismiss(t.id)">×</button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .stack {
      position: fixed; z-index: 100; display: grid; gap: .5rem;
      right: max(1rem, env(safe-area-inset-right)); bottom: max(1rem, env(safe-area-inset-bottom));
      width: min(24rem, calc(100vw - 2rem));
    }
    .toast {
      display: flex; gap: .75rem; align-items: flex-start; justify-content: space-between;
      padding: .7rem .9rem; border-radius: var(--radius-sm); background: var(--surface); color: var(--text);
      border: 1px solid var(--border-strong); border-left-width: 5px; box-shadow: var(--shadow-lg);
    }
    .toast[data-kind='error'] { border-left-color: var(--danger); }
    .toast[data-kind='success'] { border-left-color: var(--accent); }
    .toast[data-kind='info'] { border-left-color: var(--prio-medium); }
    button { background: none; border: 0; color: var(--text-muted); font-size: 1.2rem; line-height: 1; cursor: pointer; min-width: 44px; min-height: 44px; margin: -.6rem -.8rem -.6rem 0; }
  `,
})
export class ToastContainerComponent {
  protected readonly toasts = inject(ToastService);
}
