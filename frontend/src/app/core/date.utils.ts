/** Utilidades de fechas `YYYY-MM-DD` interpretadas en hora local. */
export type DueStatus = 'overdue' | 'today' | 'soon' | 'later';

export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toIsoDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function dueStatus(due: string | null | undefined, now: Date = new Date()): DueStatus | null {
  if (!due) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((parseIsoDate(due).getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 2) return 'soon';
  return 'later';
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(parseIsoDate(value));
}
