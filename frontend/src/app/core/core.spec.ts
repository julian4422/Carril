import { HttpErrorResponse, provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ToastService } from '../shared/ui/toast.service';
import { USER } from '../testing';
import { dueStatus, formatShortDate, parseIsoDate, toIsoDate } from './date.utils';
import { authGuard, guestGuard } from './guards/auth.guard';
import { apiErrorMessage } from './http-error';
import { authInterceptor } from './interceptors/auth.interceptor';
import { errorInterceptor } from './interceptors/error.interceptor';
import { TokenOut } from './models/api.models';
import { AuthService } from './services/auth.service';
import { BoardsService } from './services/boards.service';
import { ColumnsService } from './services/columns.service';
import { CommentsService } from './services/comments.service';
import { LabelsService } from './services/labels.service';
import { TasksService } from './services/tasks.service';
import { TokenStorage } from './services/token-storage.service';

const TOKEN: TokenOut = { access_token: 'jwt-123', token_type: 'bearer', expires_in: 3600, user: USER };

describe('date.utils', () => {
  it('parsea y formatea', () => {
    const d = parseIsoDate('2026-10-02');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 2]);
    expect(toIsoDate(d)).toBe('2026-10-02');
    expect(formatShortDate('2026-10-02')).toContain('oct');
  });
  it('calcula el estado de vencimiento', () => {
    const now = new Date(2026, 9, 10, 15, 0);
    expect(dueStatus(null, now)).toBeNull();
    expect(dueStatus('2026-10-09', now)).toBe('overdue');
    expect(dueStatus('2026-10-10', now)).toBe('today');
    expect(dueStatus('2026-10-12', now)).toBe('soon');
    expect(dueStatus('2026-10-13', now)).toBe('later');
    expect(dueStatus('2000-01-01')).toBe('overdue');
  });
});

describe('apiErrorMessage', () => {
  it('usa detail string', () => {
    expect(apiErrorMessage(new HttpErrorResponse({ status: 404, error: { detail: 'No existe' } }))).toBe('No existe');
  });
  it('une detail de validación', () => {
    const e = new HttpErrorResponse({ status: 422, error: { detail: [{ msg: 'a' }, { msg: 'b' }] } });
    expect(apiErrorMessage(e)).toBe('a. b');
  });
  it('sin conexión', () => {
    expect(apiErrorMessage(new HttpErrorResponse({ status: 0 }))).toContain('conectar');
  });
  it('genérico', () => {
    expect(apiErrorMessage(new HttpErrorResponse({ status: 500 }))).toContain('500');
    expect(apiErrorMessage(new Error('x'))).toContain('inesperado');
  });
});

describe('TokenStorage', () => {
  beforeEach(() => localStorage.clear());
  it('guarda, lee y borra', () => {
    const s = TestBed.inject(TokenStorage);
    expect(s.read()).toBeNull();
    s.write({ token: 't', user: USER, expiresAt: 1 });
    expect(s.read()?.token).toBe('t');
    s.clear();
    expect(s.read()).toBeNull();
  });
  it('ignora JSON corrupto', () => {
    localStorage.setItem('carril.session', '{no');
    expect(TestBed.inject(TokenStorage).read()).toBeNull();
  });
});

describe('AuthService + interceptores + guards', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  let router: Router;
  let client: HttpClient;
  let toast: ToastService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    client = TestBed.inject(HttpClient);
    toast = TestBed.inject(ToastService);
  });
  afterEach(() => http.verify());

  it('login guarda la sesión en localStorage', () => {
    expect(auth.isAuthenticated()).toBeFalse();
    auth.login({ email: 'a@b.co', password: 'x' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(TOKEN);
    expect(auth.isAuthenticated()).toBeTrue();
    expect(auth.user()?.full_name).toBe('Ana Pérez');
    expect(JSON.parse(localStorage.getItem('carril.session')!).token).toBe('jwt-123');
  });

  it('register crea la cuenta y luego inicia sesión', () => {
    auth.register({ email: 'a@b.co', full_name: 'Ana', password: '12345678' }).subscribe();
    http.expectOne('/api/v1/auth/register').flush(USER, { status: 201, statusText: 'Created' });
    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.body).toEqual({ email: 'a@b.co', password: '12345678' });
    login.flush(TOKEN);
    expect(auth.isAuthenticated()).toBeTrue();
  });

  it('restaura la sesión guardada y respeta la expiración', () => {
    localStorage.setItem('carril.session', JSON.stringify({ token: 't', user: USER, expiresAt: Date.now() - 1 }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
  });

  it('logout limpia y redirige a /login', async () => {
    auth.login({ email: 'a', password: 'b' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(TOKEN);
    const nav = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    auth.logout();
    expect(auth.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem('carril.session')).toBeNull();
    expect(nav).toHaveBeenCalledWith('/login');
  });

  it('el interceptor agrega Authorization solo a /api', () => {
    auth.login({ email: 'a', password: 'b' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(TOKEN);
    client.get('/api/v1/boards').subscribe();
    expect(http.expectOne('/api/v1/boards').request.headers.get('Authorization')).toBe('Bearer jwt-123');
    client.get('/otra/cosa').subscribe();
    expect(http.expectOne('/otra/cosa').request.headers.has('Authorization')).toBeFalse();
  });

  it('401 cierra sesión, redirige y avisa', () => {
    auth.login({ email: 'a', password: 'b' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(TOKEN);
    const nav = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    client.get('/api/v1/boards').subscribe({ error: () => undefined });
    http.expectOne('/api/v1/boards').flush({ detail: 'Token inválido' }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBeFalse();
    expect(nav).toHaveBeenCalledWith('/login');
    expect(toast.toasts().length).toBe(1);
  });

  it('otros errores muestran el detail en un toast', () => {
    client.get('/api/v1/boards/x').subscribe({ error: () => undefined });
    http.expectOne('/api/v1/boards/x').flush({ detail: 'Tablero no encontrado' }, { status: 404, statusText: 'x' });
    expect(toast.toasts()[0].message).toBe('Tablero no encontrado');
    expect(toast.toasts()[0].kind).toBe('error');
  });

  it('el login fallido no dispara toast ni logout', () => {
    client.post('/api/v1/auth/login', {}).subscribe({ error: () => undefined });
    http.expectOne('/api/v1/auth/login').flush({ detail: 'Credenciales inválidas' }, { status: 401, statusText: 'x' });
    expect(toast.toasts().length).toBe(0);
  });

  it('authGuard redirige a /login sin sesión y permite con sesión', () => {
    const r = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(router.serializeUrl(r as never)).toBe('/login');
    auth.login({ email: 'a', password: 'b' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(TOKEN);
    expect(TestBed.runInInjectionContext(() => authGuard({} as never, {} as never))).toBeTrue();
  });

  it('guestGuard manda a /boards si ya hay sesión', () => {
    expect(TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never))).toBeTrue();
    auth.login({ email: 'a', password: 'b' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(TOKEN);
    const r = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
    expect(router.serializeUrl(r as never)).toBe('/boards');
  });
});

describe('servicios por recurso', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function expectCall(method: string, url: string, body?: unknown) {
    const req = http.expectOne(url);
    expect(req.request.method).toBe(method);
    if (body !== undefined) expect(req.request.body).toEqual(body);
    req.flush(null);
  }

  it('BoardsService', () => {
    const s = TestBed.inject(BoardsService);
    s.list().subscribe(); expectCall('GET', '/api/v1/boards');
    s.get('1').subscribe(); expectCall('GET', '/api/v1/boards/1');
    s.create({ name: 'a' }).subscribe(); expectCall('POST', '/api/v1/boards', { name: 'a' });
    s.update('1', { name: 'b' }).subscribe(); expectCall('PATCH', '/api/v1/boards/1', { name: 'b' });
    s.remove('1').subscribe(); expectCall('DELETE', '/api/v1/boards/1');
  });
  it('ColumnsService', () => {
    const s = TestBed.inject(ColumnsService);
    s.create('b', { name: 'a' }).subscribe(); expectCall('POST', '/api/v1/boards/b/columns', { name: 'a' });
    s.reorder('b', ['x', 'y']).subscribe(); expectCall('PUT', '/api/v1/boards/b/columns/order', { column_ids: ['x', 'y'] });
    s.update('c', { wip_limit: null }).subscribe(); expectCall('PATCH', '/api/v1/columns/c', { wip_limit: null });
    s.remove('c').subscribe(); expectCall('DELETE', '/api/v1/columns/c');
  });
  it('TasksService', () => {
    const s = TestBed.inject(TasksService);
    s.create('c', { title: 't' }).subscribe(); expectCall('POST', '/api/v1/columns/c/tasks', { title: 't' });
    s.get('t').subscribe(); expectCall('GET', '/api/v1/tasks/t');
    s.update('t', { title: 'u' }).subscribe(); expectCall('PATCH', '/api/v1/tasks/t', { title: 'u' });
    s.move('t', { column_id: 'c', position: 1 }).subscribe(); expectCall('POST', '/api/v1/tasks/t/move', { column_id: 'c', position: 1 });
    s.setLabels('t', ['l']).subscribe(); expectCall('PUT', '/api/v1/tasks/t/labels', { label_ids: ['l'] });
    s.remove('t').subscribe(); expectCall('DELETE', '/api/v1/tasks/t');
  });
  it('LabelsService y CommentsService', () => {
    const l = TestBed.inject(LabelsService);
    l.list('b').subscribe(); expectCall('GET', '/api/v1/boards/b/labels');
    l.create('b', { name: 'x', color: '#000000' }).subscribe(); expectCall('POST', '/api/v1/boards/b/labels', { name: 'x', color: '#000000' });
    l.remove('l').subscribe(); expectCall('DELETE', '/api/v1/labels/l');
    const c = TestBed.inject(CommentsService);
    c.list('t').subscribe(); expectCall('GET', '/api/v1/tasks/t/comments');
    c.create('t', 'hola').subscribe(); expectCall('POST', '/api/v1/tasks/t/comments', { body: 'hola' });
  });
});
