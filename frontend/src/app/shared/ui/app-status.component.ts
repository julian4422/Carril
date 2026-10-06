import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppUpdateService } from '../../core/pwa/app-update.service';
import { ConnectivityService } from '../../core/pwa/connectivity.service';

/** Banner de "Sin conexión" y aviso de nueva versión de la PWA. */
@Component({
  selector: 'ui-app-status',
  template: `
    @if (!connectivity.online()) {
      <div class="offline" role="status">
        <span aria-hidden="true">●</span>
        Sin conexión. Los cambios no se guardarán hasta que vuelvas a conectarte.
      </div>
    }
    @if (updates.unrecoverable()) {
      <div class="update" role="alert">
        <span>La aplicación necesita recargarse.</span>
        <div class="actions">
          <button type="button" class="primary" (click)="updates.reload()">Recargar</button>
        </div>
      </div>
    } @else if (updates.updateAvailable()) {
      <div class="update" role="status">
        <span>Hay una versión nueva de Carril.</span>
        <div class="actions">
          <button type="button" class="ghost" (click)="updates.dismiss()">Más tarde</button>
          <button type="button" class="primary" (click)="updates.activate()">Actualizar</button>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .offline {
      position: fixed; z-index: 120; top: 0; left: 0; right: 0;
      display: flex; gap: .5rem; align-items: center; justify-content: center; text-align: center;
      padding: calc(.45rem + env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) .45rem max(1rem, env(safe-area-inset-left));
      background: var(--warn-bg); color: var(--warn); font-size: .85rem; font-weight: 600;
      border-bottom: 1px solid var(--border-strong);
    }
    .update {
      position: fixed; z-index: 110;
      left: max(1rem, env(safe-area-inset-left)); bottom: max(1rem, env(safe-area-inset-bottom));
      width: min(24rem, calc(100vw - 2rem));
      display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: center; justify-content: space-between;
      padding: .6rem .6rem .6rem 1rem; border-radius: var(--radius-sm);
      background: var(--text); color: var(--bg); box-shadow: var(--shadow-lg);
    }
    .actions { display: flex; gap: .4rem; margin-left: auto; }
    button { font: inherit; font-weight: 700; min-height: 44px; padding: 0 .9rem; border-radius: var(--radius-sm); border: 0; cursor: pointer; }
    .primary { background: var(--accent); color: var(--accent-contrast); }
    .ghost { background: transparent; color: inherit; }
  `,
})
export class AppStatusComponent {
  protected readonly connectivity = inject(ConnectivityService);
  protected readonly updates = inject(AppUpdateService);
}
