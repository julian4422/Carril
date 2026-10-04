import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../../core/http-error';
import { AuthService } from '../../core/services/auth.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { InputComponent } from '../../shared/ui/input.component';
import { AUTH_STYLES } from './auth-form.styles';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent, InputComponent],
  template: `
    <main class="card">
      <div class="brand">Carril</div>
      <h1>Crea tu cuenta</h1>
      <p class="sub">Organiza tu trabajo en tableros y tarjetas.</p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (error(); as msg) {<p class="alert" role="alert">{{ msg }}</p>}
        <ui-input label="Nombre completo" autocomplete="name" formControlName="full_name" [required]="true" />
        <ui-input label="Correo electrónico" type="email" autocomplete="email" formControlName="email" [required]="true" />
        <ui-input label="Contraseña" type="password" autocomplete="new-password" formControlName="password" hint="Mínimo 8 caracteres." [required]="true" />
        <button uiButton variant="primary" type="submit" [busy]="busy()">Crear cuenta</button>
      </form>
      <p class="alt">¿Ya tienes cuenta? <a routerLink="/login">Inicia sesión</a></p>
    </main>
  `,
  styles: AUTH_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    full_name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.auth.register(this.form.getRawValue()));
      await this.router.navigateByUrl('/boards');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
