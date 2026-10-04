/** Tipos del contrato de la API (docs/CONTRACT.md). */
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export const PRIORITIES: readonly Priority[] = ['low', 'medium', 'high', 'urgent'];

export interface UserOut {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
}

export interface TokenOut {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: UserOut;
}

export interface LabelOut {
  id: string;
  board_id: string;
  name: string;
  color: string;
}

export interface TaskOut {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  priority: Priority;
  due_date: string | null;
  position: number;
  assignee_id: string | null;
  labels: LabelOut[];
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export interface ColumnOut {
  id: string;
  board_id: string;
  name: string;
  position: number;
  wip_limit: number | null;
  tasks: TaskOut[];
}

export interface BoardSummary {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  column_count: number;
  task_count: number;
}

export interface BoardDetail {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  columns: ColumnOut[];
  labels: LabelOut[];
}

export interface CommentOut {
  id: string;
  task_id: string;
  author: { id: string; full_name: string } | null;
  body: string;
  created_at: string;
}

/** Cuerpos de petición */
export interface RegisterBody { email: string; full_name: string; password: string }
export interface LoginBody { email: string; password: string }
export interface BoardCreate { name: string; description?: string | null; color?: string }
export type BoardUpdate = Partial<BoardCreate>;
export interface ColumnCreate { name: string; wip_limit?: number | null }
export type ColumnUpdate = Partial<ColumnCreate>;
export interface TaskCreate {
  title: string;
  description?: string | null;
  priority?: Priority;
  due_date?: string | null;
  assignee_id?: string | null;
}
export type TaskUpdate = Partial<TaskCreate>;
export interface TaskMove { column_id: string; position: number }
export interface LabelCreate { name: string; color: string }
