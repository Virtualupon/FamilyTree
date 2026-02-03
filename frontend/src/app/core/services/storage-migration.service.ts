import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MigrationRequest,
  MigrationResult,
  MigrationPendingCount,
  MigrationStatusResponse
} from '../models/storage-migration.models';

@Injectable({ providedIn: 'root' })
export class StorageMigrationService {
  private readonly baseUrl = `${environment.apiUrl}/admin/storage-migration`;

  constructor(private http: HttpClient) {}

  /**
   * Get count of files pending migration from local storage.
   */
  getPendingCount(): Observable<MigrationPendingCount> {
    return this.http.get<MigrationPendingCount>(`${this.baseUrl}/pending-count`);
  }

  /**
   * Get current migration status/progress.
   */
  getStatus(): Observable<MigrationStatusResponse> {
    return this.http.get<MigrationStatusResponse>(`${this.baseUrl}/status`);
  }

  /**
   * Preview migration changes (dry run).
   */
  preview(request: Partial<MigrationRequest>): Observable<MigrationResult> {
    return this.http.post<MigrationResult>(`${this.baseUrl}/preview`, {
      ...request,
      dryRun: true
    });
  }

  /**
   * Start migration from local storage to Cloudflare R2.
   */
  migrate(request: MigrationRequest): Observable<MigrationResult> {
    return this.http.post<MigrationResult>(`${this.baseUrl}/migrate-to-cloudflare`, request);
  }

  /**
   * Cancel a running migration.
   */
  cancel(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/cancel`, {});
  }
}
