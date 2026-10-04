import { Pipe, PipeTransform } from '@angular/core';
import { DueStatus, dueStatus } from '../../core/date.utils';

/** `'2026-10-02' | dueStatus` → overdue | today | soon | later | null */
@Pipe({ name: 'dueStatus' })
export class DueStatusPipe implements PipeTransform {
  transform(value: string | null | undefined): DueStatus | null {
    return dueStatus(value);
  }
}
