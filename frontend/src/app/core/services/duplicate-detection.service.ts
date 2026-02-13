// duplicate-detection.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DuplicateScanRequest,
  DuplicateScanResult,
  DuplicateSummaryResult,
  DuplicateResolveRequest
} from '../models/duplicate-detection.models';

@Injectable({
  providedIn: 'root'
})
export class DuplicateDetectionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/admin/duplicates`;

  /**
   * Scan for duplicate candidates
   */
  scan(request: DuplicateScanRequest): Observable<DuplicateScanResult> {
    return this.http.post<DuplicateScanResult>(`${this.apiUrl}/scan`, request);
  }

  /**
   * Get summary statistics by match type
   */
  getSummary(
    treeId?: string,
    targetTreeId?: string,
    mode: string = 'auto',
    minConfidence: number = 50
  ): Observable<DuplicateSummaryResult> {
    let params = new HttpParams()
      .set('mode', mode)
      .set('minConfidence', minConfidence.toString());

    if (treeId) {
      params = params.set('treeId', treeId);
    }
    if (targetTreeId) {
      params = params.set('targetTreeId', targetTreeId);
    }

    return this.http.get<DuplicateSummaryResult>(`${this.apiUrl}/summary`, { params });
  }

  /**
   * Resolve a duplicate pair
   * @param personAId First person ID
   * @param personBId Second person ID
   * @param request Resolution action (approve_link, reject, merge)
   */
  resolve(
    personAId: string,
    personBId: string,
    request: DuplicateResolveRequest
  ): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/${personAId}/${personBId}/resolve`,
      request
    );
  }

  /**
   * Approve as same person (creates link)
   */
  approveLink(personAId: string, personBId: string, notes?: string): Observable<{ message: string }> {
    return this.resolve(personAId, personBId, {
      action: 'approve_link',
      notes
    });
  }

  /**
   * Reject as not duplicate (excludes from future scans)
   */
  reject(personAId: string, personBId: string, notes?: string): Observable<{ message: string }> {
    return this.resolve(personAId, personBId, {
      action: 'reject',
      notes
    });
  }

  /**
   * Merge two persons into one
   * @param personAId First person ID
   * @param personBId Second person ID
   * @param keepPersonId Which person to keep (the other will be soft-deleted)
   * @param notes Optional notes
   */
  merge(
    personAId: string,
    personBId: string,
    keepPersonId: string,
    notes?: string
  ): Observable<{ message: string }> {
    return this.resolve(personAId, personBId, {
      action: 'merge',
      keepPersonId,
      notes
    });
  }
}
