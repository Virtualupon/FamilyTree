import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AnalyticsDashboard,
  GrowthMetrics,
  AnalyticsPeriod
} from '../models/analytics.models';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private readonly apiUrl = `${environment.apiUrl}/admin`;

  constructor(private http: HttpClient) {}

  getDashboard(days: AnalyticsPeriod = 30): Observable<AnalyticsDashboard> {
    const params = new HttpParams().set('days', days.toString());
    return this.http.get<AnalyticsDashboard>(`${this.apiUrl}/analytics`, { params });
  }

  getGrowthMetrics(days: AnalyticsPeriod = 30): Observable<GrowthMetrics> {
    const params = new HttpParams().set('days', days.toString());
    return this.http.get<GrowthMetrics>(`${this.apiUrl}/analytics/growth`, { params });
  }
}
