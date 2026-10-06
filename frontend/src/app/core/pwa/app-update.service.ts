import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/** Cada cuánto se pregunta al service worker si hay una versión nueva. */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Avisos del service worker: hay una versión nueva lista (`VERSION_READY`) o el estado
 * quedó irrecuperable. Sin service worker (desarrollo, pruebas) no hace nada.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly sw = inject(SwUpdate, { optional: true });
  private readonly ready = signal(false);
  private readonly broken = signal(false);
  /** Hay una versión nueva descargada esperando a activarse. */
  readonly updateAvailable = this.ready.asReadonly();
  /** El service worker no puede servir la versión actual: hay que recargar. */
  readonly unrecoverable = this.broken.asReadonly();

  constructor() {
    const sw = this.sw;
    if (!sw?.isEnabled) return;
    const destroyRef = inject(DestroyRef);
    sw.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'), takeUntilDestroyed(destroyRef))
      .subscribe(() => this.ready.set(true));
    sw.unrecoverable.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => this.broken.set(true));

    // Al volver a la app (muy común en móvil) y de forma periódica, busca versiones nuevas.
    const check = () => {
      if (document.visibilityState === 'visible') sw.checkForUpdate().catch(() => undefined);
    };
    const timer = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    });
  }

  /** Activa la versión nueva y recarga la página. */
  async activate(): Promise<void> {
    try {
      if (this.sw?.isEnabled) await this.sw.activateUpdate();
    } catch {
      /* si falla la activación, recargar igualmente trae la versión nueva */
    }
    this.ready.set(false);
    this.reload();
  }

  dismiss(): void {
    this.ready.set(false);
  }

  /** Separado para poder sustituirlo en pruebas. */
  reload(): void {
    document.location.reload();
  }
}
