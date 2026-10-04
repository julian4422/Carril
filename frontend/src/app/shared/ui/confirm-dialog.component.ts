import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent } from './button.component';
import { ModalComponent } from './modal.component';

/** Confirmación propia (reemplaza a `confirm()`). */
@Component({
  selector: 'ui-confirm',
  imports: [ModalComponent, ButtonComponent],
  template: `
    <ui-modal [title]="title()" (closed)="cancelled.emit()">
      <p class="msg">{{ message() }}</p>
      <ng-container modal-footer>
        <button uiButton variant="ghost" (click)="cancelled.emit()">Cancelar</button>
        <button uiButton variant="danger" autofocus [busy]="busy()" (click)="confirmed.emit()">
          {{ confirmLabel() }}
        </button>
      </ng-container>
    </ui-modal>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.msg { margin: 0 0 .5rem; color: var(--text-muted); line-height: 1.5; }`,
})
export class ConfirmDialogComponent {
  readonly title = input('¿Confirmar?');
  readonly message = input.required<string>();
  readonly confirmLabel = input('Eliminar');
  readonly busy = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
