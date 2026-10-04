import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BoardCreate, BoardDetail, BoardSummary, BoardUpdate } from '../models/api.models';

const BASE = '/api/v1/boards';

@Injectable({ providedIn: 'root' })
export class BoardsService {
  private readonly http = inject(HttpClient);

  list(): Observable<BoardSummary[]> {
    return this.http.get<BoardSummary[]>(BASE);
  }
  get(id: string): Observable<BoardDetail> {
    return this.http.get<BoardDetail>(`${BASE}/${id}`);
  }
  create(body: BoardCreate): Observable<BoardDetail> {
    return this.http.post<BoardDetail>(BASE, body);
  }
  update(id: string, body: BoardUpdate): Observable<BoardDetail> {
    return this.http.patch<BoardDetail>(`${BASE}/${id}`, body);
  }
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/${id}`);
  }
}
