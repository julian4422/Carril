import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { $, settle, setupIntegration } from '../../integration-helpers';
import { USER, makeBoard } from '../../testing';
import { LoginComponent } from './login.component';
import { RegisterComponent } from './register.component';

function type(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

describe('Auth (integración)', () => {
  it('login completo: envía credenciales, guarda el token y navega a /boards', async () => {
    const { http } = setupIntegration(false);
    const harness = await RouterTestingHarness.create('/login');
    expect(harness.routeNativeElement!.textContent).toContain('Inicia sesión');
    const inputs = harness.routeNativeElement!.querySelectorAll('input');
    type(inputs[0], 'ana@example.com');
    type(inputs[1], 'secreto123');
    $(harness, 'form').dispatchEvent(new Event('submit'));

    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.body).toEqual({ email: 'ana@example.com', password: 'secreto123' });
    login.flush({ access_token: 'jwt-abc', token_type: 'bearer', expires_in: 3600, user: USER });
    await settle(harness);

    expect(TestBed.inject(Router).url).toBe('/boards');
    expect(JSON.parse(localStorage.getItem('carril.session')!).token).toBe('jwt-abc');
    const list = http.expectOne('/api/v1/boards');
    expect(list.request.headers.get('Authorization')).toBe('Bearer jwt-abc');
    list.flush([]);
    http.verify();
  });

  it('login con credenciales inválidas muestra el error en el formulario', async () => {
    const { http } = setupIntegration(false);
    const harness = await RouterTestingHarness.create('/login');
    const inputs = harness.routeNativeElement!.querySelectorAll('input');
    type(inputs[0], 'ana@example.com');
    type(inputs[1], 'mala');
    $(harness, 'form').dispatchEvent(new Event('submit'));
    http.expectOne('/api/v1/auth/login').flush({ detail: 'Credenciales inválidas' }, { status: 401, statusText: 'Unauthorized' });
    await settle(harness);
    expect($(harness, '.alert').textContent).toContain('Credenciales inválidas');
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('valida el formulario sin llamar a la API', async () => {
    const { http } = setupIntegration(false);
    const harness = await RouterTestingHarness.create('/login');
    $(harness, 'form').dispatchEvent(new Event('submit'));
    await settle(harness);
    expect(harness.routeNativeElement!.textContent).toContain('obligatorio');
    http.expectNone('/api/v1/auth/login');
  });

  it('registro: crea la cuenta, inicia sesión y navega a /boards', async () => {
    const { http } = setupIntegration(false);
    const harness = await RouterTestingHarness.create('/registro');
    expect(harness.routeNativeElement!.textContent).toContain('Crea tu cuenta');
    const inputs = harness.routeNativeElement!.querySelectorAll('input');
    type(inputs[0], 'Ana Pérez');
    type(inputs[1], 'ana@example.com');
    type(inputs[2], 'secreto123');
    $(harness, 'form').dispatchEvent(new Event('submit'));
    http.expectOne('/api/v1/auth/register').flush(USER, { status: 201, statusText: 'Created' });
    http.expectOne('/api/v1/auth/login').flush({ access_token: 'j', token_type: 'bearer', expires_in: 3600, user: USER });
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/boards');
    http.expectOne('/api/v1/boards').flush([]);
  });

  it('registro duplicado muestra el 409', async () => {
    const { http } = setupIntegration(false);
    const harness = await RouterTestingHarness.create('/registro');
    const inputs = harness.routeNativeElement!.querySelectorAll('input');
    type(inputs[0], 'Ana');
    type(inputs[1], 'ana@example.com');
    type(inputs[2], 'secreto123');
    $(harness, 'form').dispatchEvent(new Event('submit'));
    http.expectOne('/api/v1/auth/register').flush({ detail: 'El correo ya está registrado' }, { status: 409, statusText: 'Conflict' });
    await settle(harness);
    expect($(harness, '.alert').textContent).toContain('ya está registrado');
  });

  it('el guard redirige a /login sin sesión', async () => {
    setupIntegration(false);
    const harness = await RouterTestingHarness.create('/boards');
    expect(TestBed.inject(Router).url).toBe('/login');
    await harness.navigateByUrl('/boards/b1');
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('el guest guard manda a /boards con sesión', async () => {
    const { http } = setupIntegration(true);
    await RouterTestingHarness.create('/login');
    expect(TestBed.inject(Router).url).toBe('/boards');
    http.expectOne('/api/v1/boards').flush([]);
  });

  it('un 401 en una ruta privada cierra sesión y manda a /login', async () => {
    const { http } = setupIntegration(true);
    const harness = await RouterTestingHarness.create('/boards');
    http.expectOne('/api/v1/boards').flush({ detail: 'Token inválido' }, { status: 401, statusText: 'Unauthorized' });
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(localStorage.getItem('carril.session')).toBeNull();
  });
});

// evita warnings de imports no usados en algunos linters
void [LoginComponent, RegisterComponent, makeBoard];
