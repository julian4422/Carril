import { Pipe, PipeTransform } from '@angular/core';

/** `1 | plural:'tarjeta':'tarjetas'` → "1 tarjeta"; `2 | plural:...` → "2 tarjetas". */
export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

@Pipe({ name: 'plural' })
export class PluralPipe implements PipeTransform {
  transform(n: number, one: string, many: string): string {
    return pluralize(n, one, many);
  }
}
