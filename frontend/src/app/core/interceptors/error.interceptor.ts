import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { apiErrorMessage } from '../http-error';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../../shared/ui/toast.service';

/**
 * 401 fuera del login: cierra sesión y manda a /login.
 * Resto de errores: toast con el `detail` de la API (el login/registro muestran su error en el formulario).
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const isAuthCall = /\/auth\/(login|register)$/.test(req.url);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && !isAuthCall) {
        if (err.status === 401) {
          auth.logout();
          toast.error('Tu sesión expiró. Inicia sesión de nuevo.');
        } else {
          toast.error(apiErrorMessage(err));
        }
      }
      return throwError(() => err);
    }),
  );
};
