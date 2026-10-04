import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';

let uid = 0;

const MESSAGES: Record<string, (e: any) => string> = {
  required: () => 'Este campo es obligatorio.',
  email: () => 'Escribe un correo válido.',
  minlength: (e) => `Mínimo ${e.requiredLength} caracteres.`,
  maxlength: (e) => `Máximo ${e.requiredLength} caracteres.`,
  min: (e) => `El valor mínimo es ${e.min}.`,
};

/** Campo de texto con label, ayuda y errores. Se usa con `formControlName`. */
@Component({
  selector: 'ui-input',
  template: `
    <label [for]="id">{{ label() }}@if (required()) {<span class="req" aria-hidden="true"> *</span>}</label>
    @if (multiline()) {
      <textarea
        [id]="id" [rows]="rows()" [value]="value()" [placeholder]="placeholder()"
        [disabled]="disabled()" [attr.aria-invalid]="errorText() ? 'true' : null"
        [attr.aria-describedby]="describedBy()" [attr.maxlength]="maxlength()"
        (input)="onInput($event)" (blur)="touch()"
      ></textarea>
    } @else {
      <input
        [id]="id" [type]="type()" [value]="value()" [placeholder]="placeholder()"
        [disabled]="disabled()" [attr.autocomplete]="autocomplete()" [attr.min]="min()"
        [attr.aria-invalid]="errorText() ? 'true' : null" [attr.aria-describedby]="describedBy()"
        [attr.maxlength]="maxlength()" [attr.aria-required]="required() ? 'true' : null"
        (input)="onInput($event)" (blur)="touch()"
      />
    }
    @if (hint()) {<p class="hint" [id]="id + '-hint'">{{ hint() }}</p>}
    @if (errorText(); as msg) {<p class="error" [id]="id + '-err'" role="alert">{{ msg }}</p>}
  `,
  changeDetection: ChangeDetectionStrategy.Default,
  styles: `
    :host { display: grid; gap: .3rem; }
    label { font-weight: 600; font-size: .9rem; }
    .req { color: var(--danger); }
    input, textarea {
      font: inherit; color: var(--text); background: var(--surface); width: 100%; box-sizing: border-box;
      padding: .55rem .7rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    }
    textarea { resize: vertical; }
    input[aria-invalid='true'], textarea[aria-invalid='true'] { border-color: var(--danger); }
    .hint { margin: 0; font-size: .8rem; color: var(--text-muted); }
    .error { margin: 0; font-size: .85rem; color: var(--danger); }
  `,
})
export class InputComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly type = input('text');
  readonly placeholder = input('');
  readonly hint = input('');
  readonly multiline = input(false);
  readonly rows = input(3);
  readonly autocomplete = input<string | null>(null);
  readonly maxlength = input<number | null>(null);
  readonly min = input<string | null>(null);
  readonly required = input(false);

  protected readonly id = `ui-input-${++uid}`;
  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private readonly ngControl = inject(NgControl, { self: true, optional: true });
  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    if (this.ngControl) this.ngControl.valueAccessor = this;
  }

  protected errorText(): string | null {
    const c = this.ngControl?.control;
    if (!c || !c.invalid || !(c.touched || c.dirty)) return null;
    const key = Object.keys(c.errors ?? {})[0];
    return key ? (MESSAGES[key]?.(c.errors?.[key]) ?? 'Valor no válido.') : null;
  }

  protected describedBy(): string | null {
    const ids = [];
    if (this.hint()) ids.push(this.id + '-hint');
    if (this.errorText()) ids.push(this.id + '-err');
    return ids.length ? ids.join(' ') : null;
  }

  protected onInput(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value;
    this.value.set(v);
    this.onChange(v);
  }

  protected touch(): void {
    this.onTouched();
  }

  writeValue(v: string | null): void { this.value.set(v ?? ''); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }
}
