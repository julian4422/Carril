import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ColumnCreate, ColumnOut, ColumnUpdate } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ColumnsService {
  private readonly http = inject(HttpClient);

  create(boardId: string, body: ColumnCreate): Observable<ColumnOut> {
    return this.http.post<ColumnOut>(`/api/v1/boards/${boardId}/columns`, body);
  }
  reorder(boardId: string, columnIds: string[]): Observable<ColumnOut[]> {
    return this.http.put<ColumnOut[]>(`/api/v1/boards/${boardId}/columns/order`, { column_ids: columnIds });
  }
  update(id: string, body: ColumnUpdate): Observable<ColumnOut> {
    return this.http.patch<ColumnOut>(`/api/v1/columns/${id}`, body);
  }
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/columns/${id}`);
  }
}
