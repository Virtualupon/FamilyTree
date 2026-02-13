// prediction.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  PredictionScanResult,
  PredictionFilterParams,
  PagedPredictionResult,
  BulkAcceptRequest
} from '../models/prediction.models';

@Injectable({
  providedIn: 'root'
})
export class PredictionService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/prediction`;

  /**
   * Scan a tree for missing relationships.
   * Runs all prediction rules and stores results for admin review.
   */
  scan(treeId: string): Observable<PredictionScanResult> {
    return this.http.post<PredictionScanResult>(`${this.apiUrl}/scan/${treeId}`, {});
  }

  /**
   * Get predictions for a tree with optional filtering.
   */
  getPredictions(treeId: string, filter?: PredictionFilterParams): Observable<PagedPredictionResult> {
    let params = new HttpParams();

    if (filter?.status) {
      params = params.set('status', filter.status);
    }
    if (filter?.confidenceLevel) {
      params = params.set('confidenceLevel', filter.confidenceLevel);
    }
    if (filter?.ruleId) {
      params = params.set('ruleId', filter.ruleId);
    }
    if (filter?.predictedType) {
      params = params.set('predictedType', filter.predictedType);
    }
    if (filter?.page) {
      params = params.set('page', filter.page.toString());
    }
    if (filter?.pageSize) {
      params = params.set('pageSize', filter.pageSize.toString());
    }

    return this.http.get<PagedPredictionResult>(`${this.apiUrl}/${treeId}`, { params });
  }

  /**
   * Accept a prediction — creates the actual ParentChild or Union record.
   */
  accept(predictionId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/${predictionId}/accept`, {});
  }

  /**
   * Dismiss a prediction with an optional reason.
   */
  dismiss(predictionId: string, reason?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/${predictionId}/dismiss`, {
      predictionId,
      reason
    });
  }

  /**
   * Bulk accept all predictions above a confidence threshold.
   */
  bulkAccept(treeId: string, minConfidence: number = 85): Observable<number> {
    return this.http.post<number>(`${this.apiUrl}/${treeId}/accept-batch`, {
      treeId,
      minConfidence
    } as BulkAcceptRequest);
  }
}
