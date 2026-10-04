import { Injectable } from '@angular/core';
import { UserOut } from '../models/api.models';

export interface StoredSession {
  token: string;
  user: UserOut;
  expiresAt: number;
}

const KEY = 'carril.session';

/** Persistencia de la sesión (JWT + usuario) en localStorage. */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  read(): StoredSession | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as StoredSession;
      return s?.token && s.user ? s : null;
    } catch {
      return null;
    }
  }

  write(session: StoredSession): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      /* almacenamiento no disponible */
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  }
}
