import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CommentOut } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class CommentsService {
  private readonly http = inject(HttpClient);

  list(taskId: string): Observable<CommentOut[]> {
    return this.http.get<CommentOut[]>(`/api/v1/tasks/${taskId}/comments`);
  }
  create(taskId: string, body: string): Observable<CommentOut> {
    return this.http.post<CommentOut>(`/api/v1/tasks/${taskId}/comments`, { body });
  }
}
