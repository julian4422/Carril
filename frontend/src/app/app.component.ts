import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppStatusComponent } from './shared/ui/app-status.component';
import { ToastContainerComponent } from './shared/ui/toast-container.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, AppStatusComponent],
  template: `
    <router-outlet />
    <ui-toast-container />
    <ui-app-status />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
