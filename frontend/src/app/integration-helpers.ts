import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { BoardPageComponent } from './features/board/board-page.component';
import { BoardsPageComponent } from './features/boards/boards-page.component';
import { LoginComponent } from './features/auth/login.component';
import { RegisterComponent } from './features/auth/register.component';
import { USER } from './testing';

export const TEST_ROUTES: Routes = [
  { path: 'login', canActivate: [guestGuard], component: LoginComponent },
  { path: 'registro', canActivate: [guestGuard], component: RegisterComponent },
  { path: 'boards', canActivate: [authGuard], component: BoardsPageComponent },
  { path: 'boards/:id', canActivate: [authGuard], component: BoardPageComponent },
];

export function setupIntegration(loggedIn: boolean) {
  localStorage.clear();
  if (loggedIn) {
    localStorage.setItem('carril.session', JSON.stringify({ token: 'jwt', user: USER, expiresAt: Date.now() + 3_600_000 }));
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter(TEST_ROUTES),
      provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return { http: TestBed.inject(HttpTestingController) };
}

/** Espera microtareas y render (no usa whenStable: los toasts dejan timers de 5 s). */
export async function settle(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
    harness.detectChanges();
  }
}

export async function open<T>(url: string, component: Type<T>) {
  const harness = await RouterTestingHarness.create();
  const promise = harness.navigateByUrl(url, component);
  return { harness, promise };
}

export const $ = <T extends HTMLElement>(h: RouterTestingHarness, sel: string) => h.routeNativeElement!.querySelector<T>(sel)!;
export const $$ = <T extends HTMLElement>(h: RouterTestingHarness, sel: string) => Array.from(h.routeNativeElement!.querySelectorAll<T>(sel));
