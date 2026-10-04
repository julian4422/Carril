import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, switchMap, tap } from 'rxjs';
import { LoginBody, RegisterBody, TokenOut, UserOut } from '../models/api.models';
import { StoredSession, TokenStorage } from './token-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(TokenStorage);
  private readonly router = inject(Router);

  private readonly session = signal<StoredSession | null>(this.storage.read());

  readonly user = computed<UserOut | null>(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isAuthenticated = computed(() => {
    const s = this.session();
    return !!s && s.expiresAt > Date.now();
  });

  login(body: LoginBody): Observable<TokenOut> {
    return this.http.post<TokenOut>('/api/v1/auth/login', body).pipe(
      tap((res) => {
        const session: StoredSession = {
          token: res.access_token,
          user: res.user,
          expiresAt: Date.now() + res.expires_in * 1000,
        };
        this.storage.write(session);
        this.session.set(session);
      }),
    );
  }

  /** Crea la cuenta y abre sesión de inmediato. */
  register(body: RegisterBody): Observable<TokenOut> {
    return this.http
      .post<UserOut>('/api/v1/auth/register', body)
      .pipe(switchMap(() => this.login({ email: body.email, password: body.password })));
  }

  logout(redirect = true): void {
    this.storage.clear();
    this.session.set(null);
    if (redirect) {
      void this.router.navigateByUrl('/login');
    }
  }
}
