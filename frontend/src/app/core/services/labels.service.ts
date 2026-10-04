import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { LabelCreate, LabelOut } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class LabelsService {
  private readonly http = inject(HttpClient);

  list(boardId: string): Observable<LabelOut[]> {
    return this.http.get<LabelOut[]>(`/api/v1/boards/${boardId}/labels`);
  }
  create(boardId: string, body: LabelCreate): Observable<LabelOut> {
    return this.http.post<LabelOut>(`/api/v1/boards/${boardId}/labels`, body);
  }
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/labels/${id}`);
  }
}
