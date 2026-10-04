import { Pipe, PipeTransform } from '@angular/core';
import { formatShortDate } from '../../core/date.utils';

/** `'2026-10-02' | shortDate` → "2 oct" */
@Pipe({ name: 'shortDate' })
export class ShortDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? formatShortDate(value) : '';
  }
}
