import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../../core/http-error';
import { BoardSummary } from '../../core/models/api.models';
import { BoardsService } from '../../core/services/boards.service';
import { AppHeaderComponent } from '../../shared/ui/app-header.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { InputComponent } from '../../shared/ui/input.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PluralPipe } from '../../shared/pipes/plural.pipe';
import { ToastService } from '../../shared/ui/toast.service';

export const BOARD_COLORS = ['#0f6e63', '#2f6fb3', '#7b4fb8', '#c2477a', '#c9772b', '#5f7a2e', '#4b5563'];

@Component({
  selector: 'app-boards-page',
  imports: [
    ReactiveFormsModule, RouterLink, AppHeaderComponent, ButtonComponent, ConfirmDialogComponent,
    InputComponent, ModalComponent, PluralPipe,
  ],
  template: `
    <ui-app-header />
    <main class="page">
      <div class="top">
        <div>
          <h1>Mis tableros</h1>
          <p class="sub">Elige un tablero o crea uno nuevo.</p>
        </div>
        <button uiButton variant="primary" (click)="openCreate()">Nuevo tablero</button>
      </div>

      @if (loading()) {
        <p class="state" role="status">Cargando tableros…</p>
      } @else if (error()) {
        <div class="state state--error" role="alert">
          <p>{{ error() }}</p>
          <button uiButton (click)="load()">Reintentar</button>
        </div>
      } @else if (boards().length === 0) {
        <div class="state">
          <h2>Aún no tienes tableros</h2>
          <p>Crea el primero para empezar a organizar tus tareas.</p>
          <button uiButton variant="primary" (click)="openCreate()">Crear tablero</button>
        </div>
      } @else {
        <ul class="grid">
          @for (b of boards(); track b.id) {
            <li class="card" [style.--board-color]="b.color">
              <a class="link" [routerLink]="['/boards', b.id]">
                <h2>{{ b.name }}</h2>
                @if (b.description) {<p class="desc">{{ b.description }}</p>}
                <p class="counts">{{ b.column_count | plural:'columna':'columnas' }} · {{ b.task_count | plural:'tarjeta':'tarjetas' }}</p>
              </a>
              <button uiButton variant="ghost" size="sm" class="del" [attr.aria-label]="'Eliminar tablero ' + b.name" (click)="pendingDelete.set(b)">Eliminar</button>
            </li>
          }
        </ul>
      }
    </main>

    @if (creating()) {
      <ui-modal title="Nuevo tablero" (closed)="creating.set(false)">
        <form id="board-form" class="form" [formGroup]="form" (ngSubmit)="create()" novalidate>
          <ui-input label="Nombre" formControlName="name" [maxlength]="120" [required]="true" />
          <ui-input label="Descripción" formControlName="description" [multiline]="true" />
          <fieldset class="colors">
            <legend>Color</legend>
            @for (c of colors; track c) {
              <label class="swatch" [style.background]="c">
                <input type="radio" class="visually-hidden" name="color" [value]="c" [checked]="form.controls.color.value === c" (change)="form.controls.color.setValue(c)" />
                <span class="visually-hidden">{{ c }}</span>
                @if (form.controls.color.value === c) {<span aria-hidden="true">✓</span>}
              </label>
            }
          </fieldset>
        </form>
        <ng-container modal-footer>
          <button uiButton variant="ghost" (click)="creating.set(false)">Cancelar</button>
          <button uiButton variant="primary" type="submit" form="board-form" [busy]="busy()">Crear tablero</button>
        </ng-container>
      </ui-modal>
    }

    @if (pendingDelete(); as b) {
      <ui-confirm
        title="Eliminar tablero"
        [message]="'Se eliminará «' + b.name + '» con todas sus columnas, tarjetas y comentarios. Esta acción no se puede deshacer.'"
        [busy]="busy()"
        (confirmed)="remove(b)"
        (cancelled)="pendingDelete.set(null)"
      />
    }
  `,
  styles: `
    .page { max-width: 70rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
    .top { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
    h1 { margin: 0; font-size: 1.8rem; }
    .sub { margin: .2rem 0 0; color: var(--text-muted); }
    .state { text-align: center; padding: 3rem 1rem; border: 2px dashed var(--border-strong); border-radius: var(--radius); color: var(--text-muted); }
    .state h2 { color: var(--text); margin-top: 0; }
    .state--error { color: var(--danger); border-color: var(--danger); }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); }
    .card { position: relative; background: var(--surface); border: 1px solid var(--border); border-top: 6px solid var(--board-color); border-radius: var(--radius); box-shadow: var(--shadow); display: flex; flex-direction: column; }
    .link { display: block; padding: 1rem 1.1rem .5rem; color: inherit; text-decoration: none; flex: 1; border-radius: var(--radius); }
    .link:hover h2 { text-decoration: underline; }
    .card h2 { margin: 0 0 .3rem; font-size: 1.1rem; overflow-wrap: anywhere; }
    .desc { margin: 0 0 .5rem; color: var(--text-muted); font-size: .9rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .counts { margin: 0; font-size: .85rem; color: var(--text-muted); }
    .del { align-self: flex-end; margin: 0 .5rem .5rem; }
    .form { display: grid; gap: 1rem; }
    .colors { border: 0; padding: 0; margin: 0; display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
    .colors legend { font-weight: 600; font-size: .9rem; margin-bottom: .4rem; }
    .swatch { position: relative; width: 2rem; height: 2rem; border-radius: 50%; display: grid; place-items: center; color: #fff; cursor: pointer; font-weight: 700; border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--border-strong); }
    .swatch:focus-within { outline: 3px solid var(--focus); outline-offset: 2px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardsPageComponent implements OnInit {
  private readonly api = inject(BoardsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly colors = BOARD_COLORS;
  protected readonly boards = signal<BoardSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly busy = signal(false);
  protected readonly pendingDelete = signal<BoardSummary | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    color: [BOARD_COLORS[0]],
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.boards.set(await firstValueFrom(this.api.list()));
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected openCreate(): void {
    this.form.reset({ name: '', description: '', color: BOARD_COLORS[0] });
    this.creating.set(true);
  }

  protected async create(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, description, color } = this.form.getRawValue();
    this.busy.set(true);
    try {
      const board = await firstValueFrom(
        this.api.create({ name: name.trim(), description: description.trim() || null, color }),
      );
      this.creating.set(false);
      await this.router.navigate(['/boards', board.id]);
    } catch {
      /* el interceptor muestra el toast */
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(board: BoardSummary): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.remove(board.id));
      this.boards.update((list) => list.filter((b) => b.id !== board.id));
      this.toast.success(`Tablero «${board.name}» eliminado.`);
      this.pendingDelete.set(null);
    } catch {
      /* el interceptor muestra el toast */
    } finally {
      this.busy.set(false);
    }
  }
}
