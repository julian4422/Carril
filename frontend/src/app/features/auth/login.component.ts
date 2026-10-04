import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../../core/http-error';
import { AuthService } from '../../core/services/auth.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { InputComponent } from '../../shared/ui/input.component';
import { AUTH_STYLES } from './auth-form.styles';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent, InputComponent],
  template: `
    <main class="card">
      <div class="brand">Carril</div>
      <h1>Inicia sesión</h1>
      <p class="sub">Accede a tus tableros Kanban.</p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (error(); as msg) {<p class="alert" role="alert">{{ msg }}</p>}
        <ui-input label="Correo electrónico" type="email" autocomplete="email" formControlName="email" [required]="true" />
        <ui-input label="Contraseña" type="password" autocomplete="current-password" formControlName="password" [required]="true" />
        <button uiButton variant="primary" type="submit" [busy]="busy()">Entrar</button>
      </form>
      <p class="alt">¿No tienes cuenta? <a routerLink="/registro">Regístrate</a></p>
    </main>
  `,
  styles: AUTH_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.auth.login(this.form.getRawValue()));
      await this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') ?? '/boards');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
