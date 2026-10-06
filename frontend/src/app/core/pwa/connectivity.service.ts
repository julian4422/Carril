import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Estado de conexión del navegador (`online`/`offline`) como signal. */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly state = signal(navigator.onLine);
  readonly online = this.state.asReadonly();

  constructor() {
    const update = () => this.state.set(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    });
  }
}
