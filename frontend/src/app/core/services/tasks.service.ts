import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TaskCreate, TaskMove, TaskOut, TaskUpdate } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);

  create(columnId: string, body: TaskCreate): Observable<TaskOut> {
    return this.http.post<TaskOut>(`/api/v1/columns/${columnId}/tasks`, body);
  }
  get(id: string): Observable<TaskOut> {
    return this.http.get<TaskOut>(`/api/v1/tasks/${id}`);
  }
  update(id: string, body: TaskUpdate): Observable<TaskOut> {
    return this.http.patch<TaskOut>(`/api/v1/tasks/${id}`, body);
  }
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/tasks/${id}`);
  }
  move(id: string, body: TaskMove): Observable<TaskOut> {
    return this.http.post<TaskOut>(`/api/v1/tasks/${id}/move`, body);
  }
  setLabels(id: string, labelIds: string[]): Observable<TaskOut> {
    return this.http.put<TaskOut>(`/api/v1/tasks/${id}/labels`, { label_ids: labelIds });
  }
}
