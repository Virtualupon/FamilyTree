import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  SuggestionSummary,
  SuggestionDetail,
  SuggestionListResponse,
  SuggestionStats,
  DuplicateCheckResponse,
  PendingByTown,
  CreateSuggestionRequest,
  CreateEvidenceRequest,
  CreateCommentRequest,
  UpdateSuggestionStatusRequest,
  WithdrawSuggestionRequest,
  SuggestionQueryParams,
  Evidence,
  Comment,
  SuggestionType,
  SuggestionStatus,
  SuggestAddPersonRequest,
  SuggestAddRelationshipRequest,
  SuggestionSubmittedResponse
} from '../models/suggestion.models';

@Injectable({
  providedIn: 'root'
})
export class SuggestionService {
  private readonly apiUrl = `${environment.apiUrl}/suggestion`;

  constructor(private http: HttpClient) {}

  // ============================================================================
  // Viewer Operations
  // ============================================================================

  /**
   * Create a new relationship suggestion
   */
  createSuggestion(request: CreateSuggestionRequest): Observable<SuggestionDetail> {
    return this.http.post<SuggestionDetail>(this.apiUrl, request);
  }

  /**
   * Convenience: Suggest adding a new person (simplified interface)
   */
  suggestAddPerson(request: SuggestAddPersonRequest): Observable<SuggestionSubmittedResponse> {
    return this.http.post<SuggestionSubmittedResponse>(`${this.apiUrl}/add-person`, request);
  }

  /**
   * Convenience: Suggest adding a relationship between two people (simplified interface)
   */
  suggestAddRelationship(request: SuggestAddRelationshipRequest): Observable<SuggestionSubmittedResponse> {
    return this.http.post<SuggestionSubmittedResponse>(`${this.apiUrl}/add-relationship`, request);
  }

  /**
   * Get suggestion by ID
   */
  getSuggestion(id: string): Observable<SuggestionDetail> {
    return this.http.get<SuggestionDetail>(`${this.apiUrl}/${id}`);
  }

  /**
   * Get my submitted suggestions
   */
  getMySuggestions(
    status?: SuggestionStatus,
    page: number = 1,
    pageSize: number = 20
  ): Observable<SuggestionListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (status !== undefined) {
      params = params.set('status', status.toString());
    }

    return this.http.get<SuggestionListResponse>(`${this.apiUrl}/my`, { params });
  }

  /**
   * Withdraw a pending suggestion
   */
  withdrawSuggestion(id: string, request: WithdrawSuggestionRequest): Observable<SuggestionDetail> {
    return this.http.post<SuggestionDetail>(`${this.apiUrl}/${id}/withdraw`, request);
  }

  /**
   * Add evidence to a suggestion
   */
  addEvidence(suggestionId: string, request: CreateEvidenceRequest): Observable<Evidence> {
    return this.http.post<Evidence>(`${this.apiUrl}/${suggestionId}/evidence`, request);
  }

  /**
   * Add a comment to a suggestion
   */
  addComment(suggestionId: string, request: CreateCommentRequest): Observable<Comment> {
    return this.http.post<Comment>(`${this.apiUrl}/${suggestionId}/comments`, request);
  }

  /**
   * Check for duplicate pending suggestions
   */
  checkDuplicate(
    treeId: string,
    type: SuggestionType,
    targetPersonId?: string,
    secondaryPersonId?: string
  ): Observable<DuplicateCheckResponse> {
    let params = new HttpParams()
      .set('treeId', treeId)
      .set('type', type.toString());

    if (targetPersonId) {
      params = params.set('targetPersonId', targetPersonId);
    }
    if (secondaryPersonId) {
      params = params.set('secondaryPersonId', secondaryPersonId);
    }

    return this.http.get<DuplicateCheckResponse>(`${this.apiUrl}/check-duplicate`, { params });
  }

  /**
   * Get my suggestion statistics
   */
  getMyStatistics(): Observable<SuggestionStats> {
    return this.http.get<SuggestionStats>(`${this.apiUrl}/my/statistics`);
  }

  // ============================================================================
  // Admin Operations
  // ============================================================================

  /**
   * Get suggestion queue for admin review
   */
  getSuggestionQueue(params: SuggestionQueryParams = {}): Observable<SuggestionListResponse> {
    let httpParams = new HttpParams();

    if (params.townId) httpParams = httpParams.set('townId', params.townId);
    if (params.treeId) httpParams = httpParams.set('treeId', params.treeId);
    if (params.status !== undefined) httpParams = httpParams.set('status', params.status.toString());
    if (params.type !== undefined) httpParams = httpParams.set('type', params.type.toString());
    if (params.page) httpParams = httpParams.set('page', params.page.toString());
    if (params.pageSize) httpParams = httpParams.set('pageSize', params.pageSize.toString());
    if (params.sortBy) httpParams = httpParams.set('sortBy', params.sortBy);
    if (params.sortDesc !== undefined) httpParams = httpParams.set('sortDesc', params.sortDesc.toString());

    return this.http.get<SuggestionListResponse>(`${this.apiUrl}/queue`, { params: httpParams });
  }

  /**
   * Update suggestion status
   */
  updateStatus(id: string, request: UpdateSuggestionStatusRequest): Observable<SuggestionDetail> {
    return this.http.put<SuggestionDetail>(`${this.apiUrl}/${id}/status`, request);
  }

  /**
   * Approve a suggestion
   */
  approveSuggestion(id: string, reviewerNotes?: string): Observable<SuggestionDetail> {
    return this.http.post<SuggestionDetail>(`${this.apiUrl}/${id}/approve`, { reviewerNotes });
  }

  /**
   * Reject a suggestion
   */
  rejectSuggestion(id: string, reason: string, reviewerNotes?: string): Observable<SuggestionDetail> {
    return this.http.post<SuggestionDetail>(`${this.apiUrl}/${id}/reject`, { reason, reviewerNotes });
  }

  /**
   * Request more information from submitter
   */
  requestMoreInfo(id: string, reason: string, reviewerNotes?: string): Observable<SuggestionDetail> {
    return this.http.post<SuggestionDetail>(`${this.apiUrl}/${id}/request-info`, { reason, reviewerNotes });
  }

  /**
   * Rollback an approved suggestion
   */
  rollbackSuggestion(id: string, reason: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${id}/rollback`, { reason });
  }

  /**
   * Delete a suggestion (soft delete)
   */
  deleteSuggestion(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get pending suggestions count by town
   */
  getPendingByTown(): Observable<PendingByTown[]> {
    return this.http.get<PendingByTown[]>(`${this.apiUrl}/pending-by-town`);
  }

  /**
   * Get suggestion statistics
   */
  getStatistics(townId?: string, treeId?: string, userId?: number): Observable<SuggestionStats> {
    let params = new HttpParams();

    if (townId) params = params.set('townId', townId);
    if (treeId) params = params.set('treeId', treeId);
    if (userId) params = params.set('userId', userId.toString());

    return this.http.get<SuggestionStats>(`${this.apiUrl}/statistics`, { params });
  }
}
