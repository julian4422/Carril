import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { InitialsPipe } from '../pipes/initials.pipe';
import { ButtonComponent } from './button.component';

@Component({
  selector: 'ui-app-header',
  imports: [RouterLink, ButtonComponent, InitialsPipe],
  template: `
    <header class="bar">
      <a routerLink="/boards" class="brand" aria-label="Carril, ir a mis tableros">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 3v18M19 3v18M5 8h14M5 16h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        Carril
      </a>
      <div class="slot"><ng-content /></div>
      @if (auth.user(); as u) {
        <div class="user">
          <span class="avatar" aria-hidden="true">{{ u.full_name | initials }}</span>
          <span class="name">{{ u.full_name }}</span>
          <button uiButton variant="ghost" size="sm" (click)="auth.logout()">Salir</button>
        </div>
      }
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .bar { display: flex; align-items: center; gap: 1rem; padding: .6rem 1.25rem; background: var(--surface); border-bottom: 1px solid var(--border); }
    .brand { display: inline-flex; align-items: center; gap: .45rem; font-weight: 800; font-size: 1.15rem; color: var(--accent); text-decoration: none; letter-spacing: -.01em; }
    .slot { flex: 1; min-width: 0; }
    .user { display: flex; align-items: center; gap: .5rem; }
    .avatar { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 50%; background: var(--accent); color: var(--accent-contrast); font-size: .8rem; font-weight: 700; }
    .name { font-size: .9rem; max-width: 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (max-width: 560px) { .name { display: none; } }
  `,
})
export class AppHeaderComponent {
  protected readonly auth = inject(AuthService);
}
