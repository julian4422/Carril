import { TestBed } from '@angular/core/testing';
import { makeTask } from '../../testing';
import { TaskCardComponent } from './task-card.component';

describe('TaskCardComponent', () => {
  function create(extra = {}, assignee: string | null = null) {
    const f = TestBed.createComponent(TaskCardComponent);
    f.componentRef.setInput('task', makeTask('t1', 'c1', 0, extra));
    f.componentRef.setInput('columnName', 'Por hacer');
    f.componentRef.setInput('assigneeName', assignee);
    f.detectChanges();
    return f;
  }

  it('muestra título, prioridad y etiqueta de accesibilidad', () => {
    const f = create({ priority: 'high', title: 'Escribir docs' });
    const el: HTMLElement = f.nativeElement;
    expect(el.textContent).toContain('Escribir docs');
    expect(el.textContent).toContain('Alta');
    expect(el.querySelector('[role="button"]')!.getAttribute('aria-label')).toContain('prioridad alta, en Por hacer');
  });

  it('resalta la fecha vencida', () => {
    const f = create({ due_date: '2000-01-01', comment_count: 3 }, 'Ana Pérez');
    const due = f.nativeElement.querySelector('.due') as HTMLElement;
    expect(due.dataset['status']).toBe('overdue');
    expect(due.textContent).toContain('Vencida');
    expect(f.nativeElement.textContent).toContain('AP');
    expect(f.nativeElement.querySelector('.count').textContent).toContain('3');
  });

  it('emite open con clic, Enter y espacio', () => {
    const f = create({ labels: [{ id: 'l', board_id: 'b', name: 'Bug', color: '#ff0000' }] });
    let n = 0;
    f.componentInstance.open.subscribe(() => n++);
    const card = f.nativeElement.querySelector('[role="button"]') as HTMLElement;
    card.click();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(n).toBe(3);
    expect(f.nativeElement.textContent).toContain('Bug');
  });

  it('pluraliza comentarios en el aria-label', () => {
    expect(create({ comment_count: 1 }).nativeElement.querySelector('.count').getAttribute('aria-label')).toBe('1 comentario');
    expect(create({ comment_count: 2 }).nativeElement.querySelector('.count').getAttribute('aria-label')).toBe('2 comentarios');
  });
});
