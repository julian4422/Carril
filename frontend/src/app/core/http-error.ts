import { HttpErrorResponse } from '@angular/common/http';

/** Extrae un mensaje legible de un error de la API (`detail` string o lista de FastAPI). */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    }
    const detail: unknown = err.error?.detail;
    if (typeof detail === 'string' && detail) {
      return detail;
    }
    if (Array.isArray(detail) && detail.length) {
      return detail
        .map((d) => (typeof d?.msg === 'string' ? d.msg : String(d)))
        .join('. ');
    }
    return `Error ${err.status}: la solicitud no se pudo completar.`;
  }
  return 'Ocurrió un error inesperado.';
}
