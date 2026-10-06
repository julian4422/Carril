import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppStatusComponent } from '../../shared/ui/app-status.component';
import { AppUpdateService, UPDATE_CHECK_INTERVAL_MS } from './app-update.service';
import { ConnectivityService } from './connectivity.service';

class FakeSwUpdate {
  isEnabled = true;
  readonly versionUpdates = new Subject<VersionEvent>();
  readonly unrecoverable = new Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>();
  readonly activateUpdate = jasmine.createSpy('activateUpdate').and.resolveTo(true);
  readonly checkForUpdate = jasmine.createSpy('checkForUpdate').and.resolveTo(false);
}

const READY: VersionEvent = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'a' },
  latestVersion: { hash: 'b' },
};

function setup(sw: FakeSwUpdate | null) {
  TestBed.configureTestingModule({
    providers: sw ? [{ provide: SwUpdate, useValue: sw }] : [],
  });
  const service = TestBed.inject(AppUpdateService);
  spyOn(service, 'reload');
  return service;
}

describe('AppUpdateService', () => {
  it('sin service worker no hace nada', async () => {
    const service = setup(null);
    expect(service.updateAvailable()).toBeFalse();
    await service.activate();
    expect(service.reload).toHaveBeenCalled();
  });

  it('con el service worker desactivado no se suscribe', () => {
    const sw = new FakeSwUpdate();
    sw.isEnabled = false;
    const service = setup(sw);
    sw.versionUpdates.next(READY);
    expect(service.updateAvailable()).toBeFalse();
  });

  it('VERSION_READY marca que hay versión nueva; otros eventos no', () => {
    const sw = new FakeSwUpdate();
    const service = setup(sw);
    sw.versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    expect(service.updateAvailable()).toBeFalse();
    sw.versionUpdates.next(READY);
    expect(service.updateAvailable()).toBeTrue();
    service.dismiss();
    expect(service.updateAvailable()).toBeFalse();
  });

  it('activate() activa la versión y recarga, aunque la activación falle', async () => {
    const sw = new FakeSwUpdate();
    const service = setup(sw);
    sw.versionUpdates.next(READY);
    await service.activate();
    expect(sw.activateUpdate).toHaveBeenCalled();
    expect(service.reload).toHaveBeenCalledTimes(1);
    expect(service.updateAvailable()).toBeFalse();

    sw.activateUpdate.and.rejectWith(new Error('x'));
    await service.activate();
    expect(service.reload).toHaveBeenCalledTimes(2);
  });

  it('estado irrecuperable', () => {
    const sw = new FakeSwUpdate();
    const service = setup(sw);
    sw.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'x' });
    expect(service.unrecoverable()).toBeTrue();
  });

  it('busca versiones al volver a la app y de forma periódica', () => {
    jasmine.clock().install();
    try {
      const sw = new FakeSwUpdate();
      setup(sw);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
      jasmine.clock().tick(UPDATE_CHECK_INTERVAL_MS);
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(2);
      TestBed.resetTestingModule(); // destruye el inyector: deja de escuchar
      document.dispatchEvent(new Event('visibilitychange'));
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(2);
    } finally {
      jasmine.clock().uninstall();
    }
  });
});

describe('ConnectivityService', () => {
  it('refleja los eventos online/offline del navegador', () => {
    let online = true;
    spyOnProperty(navigator, 'onLine').and.callFake(() => online);
    const service = TestBed.inject(ConnectivityService);
    expect(service.online()).toBeTrue();
    online = false;
    window.dispatchEvent(new Event('offline'));
    expect(service.online()).toBeFalse();
    online = true;
    window.dispatchEvent(new Event('online'));
    expect(service.online()).toBeTrue();
  });
});

describe('AppStatusComponent', () => {
  let online: boolean;
  let sw: FakeSwUpdate;

  function render() {
    spyOnProperty(navigator, 'onLine').and.callFake(() => online);
    sw = new FakeSwUpdate();
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: sw }] });
    spyOn(TestBed.inject(AppUpdateService), 'reload');
    const fixture = TestBed.createComponent(AppStatusComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => (online = true));

  it('muestra el banner "Sin conexión" mientras no hay red', () => {
    const fixture = render();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.offline')).toBeNull();
    online = false;
    window.dispatchEvent(new Event('offline'));
    fixture.detectChanges();
    expect(el.querySelector('.offline')?.textContent).toContain('Sin conexión');
    online = true;
    window.dispatchEvent(new Event('online'));
    fixture.detectChanges();
    expect(el.querySelector('.offline')).toBeNull();
  });

  it('muestra el aviso de versión nueva con "Actualizar" y "Más tarde"', async () => {
    const fixture = render();
    const el: HTMLElement = fixture.nativeElement;
    sw.versionUpdates.next(READY);
    fixture.detectChanges();
    expect(el.querySelector('.update')?.textContent).toContain('versión nueva');
    const button = (label: string) =>
      Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;

    button('Más tarde').click();
    fixture.detectChanges();
    expect(el.querySelector('.update')).toBeNull();

    sw.versionUpdates.next(READY);
    fixture.detectChanges();
    button('Actualizar').click();
    await fixture.whenStable();
    expect(sw.activateUpdate).toHaveBeenCalled();
    expect(TestBed.inject(AppUpdateService).reload).toHaveBeenCalled();
  });

  it('si el estado es irrecuperable pide recargar', () => {
    const fixture = render();
    sw.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'x' });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('necesita recargarse');
    el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    expect(TestBed.inject(AppUpdateService).reload).toHaveBeenCalled();
  });
});
