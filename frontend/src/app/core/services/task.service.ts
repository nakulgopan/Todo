import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';

import { environment } from '../../../environments/environment';
import { EditScope, Task, TaskPayload } from '../models/models';
import { directApi } from '../supabase/client-api';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);

  list(filter = 'all', search = '', sort = 'priority', order = 'asc'): Observable<{ tasks: Task[] }> {
    if (environment.direct) return from(directApi.listTasks(filter, search, sort, order));
    const params = new HttpParams().set('filter', filter).set('search', search).set('sort', sort).set('order', order);
    return this.http.get<{ tasks: Task[] }>(`${environment.apiUrl}/tasks`, { params });
  }

  create(payload: TaskPayload): Observable<Task> {
    if (environment.direct) return from(directApi.createTask(payload));
    return this.http.post<Task>(`${environment.apiUrl}/tasks`, payload);
  }

  update(id: string, payload: Partial<TaskPayload>): Observable<Task> {
    if (environment.direct) return from(directApi.updateTask(id, payload));
    return this.http.put<Task>(`${environment.apiUrl}/tasks/${id}`, payload);
  }

  remove(id: string, scope: EditScope = 'entire', occurrenceDate?: string): Observable<void> {
    let params = new HttpParams().set('scope', scope);
    if (environment.direct) return from(directApi.removeTask(id, scope, occurrenceDate));
    if (occurrenceDate) {
      params = params.set('occurrence_date', occurrenceDate);
    }
    return this.http.delete<void>(`${environment.apiUrl}/tasks/${id}`, { params });
  }
}
