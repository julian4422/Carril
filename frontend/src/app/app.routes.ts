import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'boards' },
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Iniciar sesión · Carril',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    title: 'Crear cuenta · Carril',
    loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'boards',
    canActivate: [authGuard],
    title: 'Mis tableros · Carril',
    loadComponent: () => import('./features/boards/boards-page.component').then((m) => m.BoardsPageComponent),
  },
  {
    path: 'boards/:id',
    canActivate: [authGuard],
    title: 'Tablero · Carril',
    loadComponent: () => import('./features/board/board-page.component').then((m) => m.BoardPageComponent),
  },
  { path: '**', redirectTo: 'boards' },
];
