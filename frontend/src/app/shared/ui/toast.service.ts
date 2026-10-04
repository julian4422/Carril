import { Injectable, signal } from '@angular/core';

export type ToastKind = 'error' | 'success' | 'info';
export interface Toast { id: number; kind: ToastKind; message: string }

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, kind: ToastKind = 'info', durationMs = 5000): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, kind, message }]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
  }
  error(message: string): void { this.show(message, 'error', 7000); }
  success(message: string): void { this.show(message, 'success'); }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
