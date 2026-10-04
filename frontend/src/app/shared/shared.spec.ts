import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../core/services/auth.service';
import { DueStatusPipe } from './pipes/due-status.pipe';
import { InitialsPipe } from './pipes/initials.pipe';
import { ShortDatePipe } from './pipes/short-date.pipe';
import { AppHeaderComponent } from './ui/app-header.component';
import { ButtonComponent } from './ui/button.component';
import { ChipComponent } from './ui/chip.component';
import { ConfirmDialogComponent } from './ui/confirm-dialog.component';
import { InputComponent } from './ui/input.component';
import { ModalComponent } from './ui/modal.component';
import { ToastContainerComponent } from './ui/toast-container.component';
import { ToastService } from './ui/toast.service';

describe('pipes', () => {
  it('initials', () => {
    const p = new InitialsPipe();
    expect(p.transform('Ana María Pérez')).toBe('AM');
    expect(p.transform('  ana ')).toBe('A');
    expect(p.transform(null)).toBe('?');
    expect(p.transform('   ')).toBe('?');
  });
  it('shortDate', () => {
    const p = new ShortDatePipe();
    expect(p.transform('2026-10-02')).toContain('oct');
    expect(p.transform(null)).toBe('');
  });
  it('dueStatus', () => {
    const p = new DueStatusPipe();
    expect(p.transform(null)).toBeNull();
    expect(p.transform('2000-01-01')).toBe('overdue');
    expect(p.transform('2999-01-01')).toBe('later');
  });
});

describe('ToastService', () => {
  it('muestra y descarta; se autodescarta', () => {
    jasmine.clock().install();
    const t = new ToastService();
    t.success('ok');
    t.error('mal');
    t.show('x', 'info', 0);
    expect(t.toasts().length).toBe(3);
    jasmine.clock().tick(5001);
    expect(t.toasts().map((x) => x.message)).toEqual(['mal', 'x']);
    t.dismiss(t.toasts()[0].id);
    expect(t.toasts().length).toBe(1);
    jasmine.clock().uninstall();
  });
});

@Component({
  imports: [ButtonComponent, ChipComponent, ModalComponent, ConfirmDialogComponent, ReactiveFormsModule, InputComponent],
  template: `
    <button uiButton variant="primary" type="submit" [busy]="busy()" id="b">Hola</button>
    <ui-chip [priority]="'urgent'" id="p" />
    <ui-chip color="#ff0000" id="l">Etiqueta</ui-chip>
    @if (modal()) {
      <ui-modal title="Mi modal" (closed)="closes = closes + 1"><input id="inside" aria-label="dentro" />
        <ng-container modal-footer><button id="last">fin</button></ng-container></ui-modal>
    }
    @if (confirm()) {
      <ui-confirm message="¿Seguro?" confirmLabel="Borrar" (confirmed)="confirmed = true" (cancelled)="cancelled = true" />
    }
    <ui-input label="Nombre" [formControl]="ctrl" [required]="true" hint="Ayuda" />
    <ui-input label="Notas" [formControl]="notes" [multiline]="true" />
  `,
})
class HostComponent {
  busy = signal(false);
  modal = signal(false);
  confirm = signal(false);
  closes = 0;
  confirmed = false;
  cancelled = false;
  ctrl = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] });
  notes = new FormControl('');
}

describe('shared UI', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  let el: HTMLElement;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('botón: tipo, variante y busy deshabilita', () => {
    const b = q<HTMLButtonElement>('#b');
    expect(b.type).toBe('submit');
    expect(b.dataset['variant']).toBe('primary');
    expect(b.disabled).toBeFalse();
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();
    expect(b.disabled).toBeTrue();
    expect(b.getAttribute('aria-busy')).toBe('true');
  });

  it('chip de prioridad muestra texto y forma; el de etiqueta su nombre', () => {
    expect(q('#p').textContent).toContain('Urgente');
    expect(q('#p [aria-hidden="true"]').textContent).toContain('◆');
    expect(q('#l').textContent).toContain('Etiqueta');
  });

  it('modal: rol, foco, Esc, backdrop, Tab atrapado', () => {
    fixture.componentInstance.modal.set(true);
    fixture.detectChanges();
    const dialog = q('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.activeElement?.id).toBe('inside');
    // Tab desde el último vuelve al primero
    q<HTMLElement>('#last').focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    q('#last').dispatchEvent(tab);
    expect(tab.defaultPrevented).toBeTrue();
    expect(document.activeElement?.className).toBe('close');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(fixture.componentInstance.closes).toBe(1);
    q('.backdrop').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(fixture.componentInstance.closes).toBe(2);
    q('.close').click();
    expect(fixture.componentInstance.closes).toBe(3);
  });

  it('modal: Shift+Tab desde el primero va al último', () => {
    fixture.componentInstance.modal.set(true);
    fixture.detectChanges();
    const close = q<HTMLElement>('.close');
    close.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    close.dispatchEvent(ev);
    expect(document.activeElement?.id).toBe('last');
  });

  it('confirm emite confirmar y cancelar', () => {
    fixture.componentInstance.confirm.set(true);
    fixture.detectChanges();
    expect(q('ui-confirm').textContent).toContain('¿Seguro?');
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('ui-confirm .foot button'));
    buttons.find((b) => b.textContent?.includes('Borrar'))!.click();
    buttons.find((b) => b.textContent?.includes('Cancelar'))!.click();
    expect(fixture.componentInstance.confirmed).toBeTrue();
    expect(fixture.componentInstance.cancelled).toBeTrue();
  });

  it('input: label, valor bidireccional, errores y ayuda', () => {
    const input = q<HTMLInputElement>('ui-input input');
    expect(el.querySelector('label[for="' + input.id + '"]')?.textContent).toContain('Nombre');
    expect(q('ui-input .hint').textContent).toContain('Ayuda');
    expect(q('ui-input .error')).toBeNull();
    input.value = 'ab';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(fixture.componentInstance.ctrl.value).toBe('ab');
    expect(q('ui-input .error').textContent).toContain('Mínimo 3');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fixture.componentInstance.ctrl.setValue('');
    fixture.detectChanges();
    expect(q('ui-input .error').textContent).toContain('obligatorio');
    fixture.componentInstance.ctrl.disable();
    fixture.detectChanges();
    expect(input.disabled).toBeTrue();
  });

  it('input multilínea usa textarea', () => {
    const ta = el.querySelector<HTMLTextAreaElement>('ui-input textarea')!;
    ta.value = 'hola';
    ta.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.notes.value).toBe('hola');
  });
});

describe('ToastContainerComponent', () => {
  it('pinta y cierra avisos', () => {
    const f = TestBed.createComponent(ToastContainerComponent);
    const toast = TestBed.inject(ToastService);
    toast.error('Falló algo');
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Falló algo');
    f.nativeElement.querySelector('button').click();
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('Falló algo');
  });
});

describe('AppHeaderComponent', () => {
  it('muestra el usuario y cierra sesión', () => {
    localStorage.setItem('carril.session', JSON.stringify({
      token: 't', expiresAt: Date.now() + 60000,
      user: { id: '1', email: 'a@b.co', full_name: 'Ana Pérez', created_at: '' },
    }));
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const auth = TestBed.inject(AuthService);
    const logout = spyOn(auth, 'logout');
    const f = TestBed.createComponent(AppHeaderComponent);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('AP');
    const btn = Array.from<HTMLButtonElement>(f.nativeElement.querySelectorAll('button')).find((b) => b.textContent?.includes('Salir'));
    btn!.click();
    expect(logout).toHaveBeenCalled();
    localStorage.clear();
  });
});

import { PluralPipe, pluralize } from './pipes/plural.pipe';

describe('PluralPipe', () => {
  it('singulariza solo con 1', () => {
    const p = new PluralPipe();
    expect(p.transform(0, 'tarjeta', 'tarjetas')).toBe('0 tarjetas');
    expect(p.transform(1, 'tarjeta', 'tarjetas')).toBe('1 tarjeta');
    expect(p.transform(2, 'comentario', 'comentarios')).toBe('2 comentarios');
    expect(pluralize(1, 'columna', 'columnas')).toBe('1 columna');
  });
});
