import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActivityLogQuery,
  ActivityLogResponse,
  ActivityLogFilters
} from '../models/activity-log.models';

@Injectable({
  providedIn: 'root'
})
export class ActivityLogService {
  private readonly apiUrl = `${environment.apiUrl}/admin`;

  constructor(private http: HttpClient) {}

  getLogs(query: ActivityLogQuery): Observable<ActivityLogResponse> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page.toString());
    if (query.pageSize) params = params.set('pageSize', query.pageSize.toString());
    if (query.actorId) params = params.set('actorId', query.actorId.toString());
    if (query.action) params = params.set('action', query.action);
    if (query.entityType) params = params.set('entityType', query.entityType);
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    if (query.search) params = params.set('search', query.search);
    return this.http.get<ActivityLogResponse>(`${this.apiUrl}/activity-logs`, { params });
  }

  getFilters(): Observable<ActivityLogFilters> {
    return this.http.get<ActivityLogFilters>(`${this.apiUrl}/activity-logs/filters`);
  }
}
