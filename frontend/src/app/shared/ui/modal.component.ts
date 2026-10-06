import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  viewChild,
} from '@angular/core';

let uid = 0;

/** Diálogo modal accesible: role=dialog, Esc cierra, foco atrapado y restaurado. */
@Component({
  selector: 'ui-modal',
  template: `
    <div class="backdrop" [class.backdrop--lg]="size() === 'lg'" (mousedown)="onBackdrop($event)">
      <div
        #dialog
        class="dialog"
        [class.dialog--lg]="size() === 'lg'"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        tabindex="-1"
        (keydown)="onKeydown($event)"
      >
        <header class="head">
          <h2 [id]="titleId">{{ title() }}</h2>
          <button type="button" class="close" aria-label="Cerrar" (click)="closed.emit()">×</button>
        </header>
        <div class="body"><ng-content /></div>
        <footer class="foot"><ng-content select="[modal-footer]" /></footer>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .backdrop {
      position: fixed; inset: 0; z-index: 50; display: grid; place-items: center;
      padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
        max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
      background: rgb(10 14 14 / .55); overflow-y: auto; overscroll-behavior: contain;
    }
    .dialog {
      width: min(30rem, 100%); max-height: calc(100dvh - 2rem); display: flex; flex-direction: column;
      background: var(--surface); color: var(--text); border: 1px solid var(--border);
      border-radius: var(--radius); box-shadow: var(--shadow-lg); outline: none;
    }
    .dialog--lg { width: min(50rem, 100%); }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem .5rem; }
    h2 { margin: 0; font-size: 1.2rem; }
    .close {
      font-size: 1.6rem; line-height: 1; background: none; border: 0; color: var(--text-muted); cursor: pointer;
      border-radius: var(--radius-sm); padding: 0 .4rem; min-width: 44px; min-height: 44px; flex: none;
    }
    h2 { min-width: 0; overflow-wrap: anywhere; }
    .close:hover { color: var(--text); background: var(--surface-2); }
    .body { padding: .5rem 1.25rem 1rem; overflow-y: auto; }
    .foot { display: flex; justify-content: flex-end; gap: .5rem; padding: 0 1.25rem 1.1rem; }
    .foot:empty { display: none; }
    .foot { flex-wrap: wrap; }
    /* Móvil: el diálogo grande (detalle de tarjeta) ocupa la pantalla completa. */
    @media (max-width: 640px) {
      .backdrop--lg { padding: 0; display: block; overflow: hidden; }
      .dialog--lg {
        width: 100%; height: 100%; max-height: none; border: 0; border-radius: 0;
        padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);
      }
      .dialog--lg .head { padding: .5rem .75rem .25rem 1rem; border-bottom: 1px solid var(--border); }
      .dialog--lg .body { flex: 1; min-height: 0; padding: .75rem 1rem 1rem; }
      .dialog--lg .foot {
        padding: .6rem 1rem calc(.6rem + env(safe-area-inset-bottom));
        border-top: 1px solid var(--border); background: var(--surface);
      }
    }
  `,
})
export class ModalComponent implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly size = input<'md' | 'lg'>('md');
  readonly closed = output<void>();

  protected readonly titleId = `ui-modal-title-${++uid}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private previouslyFocused: HTMLElement | null = null;

  ngAfterViewInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
    const el = this.dialog().nativeElement;
    (el.querySelector<HTMLElement>('[autofocus], input, textarea, select') ?? el).focus();
  }

  ngOnDestroy(): void {
    this.previouslyFocused?.focus?.();
  }

  protected onBackdrop(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.closed.emit();
  }

  protected onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      this.closed.emit();
      return;
    }
    if (ev.key !== 'Tab') return;
    const focusable = Array.from(
      this.dialog().nativeElement.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey && (active === first || active === this.dialog().nativeElement)) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  }
}
