import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateSupportTicketRequest,
  UpdateTicketStatusRequest,
  AssignTicketRequest,
  UpdateTicketPriorityRequest,
  AddTicketCommentRequest,
  UpdateAdminNotesRequest,
  SupportTicketQueryParams,
  SupportTicketDetail,
  SupportTicketStats,
  TicketAttachment,
  TicketComment,
  PagedTicketResult
} from '../models/support-ticket.models';

@Injectable({
  providedIn: 'root'
})
export class SupportTicketService {
  private readonly apiUrl = `${environment.apiUrl}/support-tickets`;

  constructor(private http: HttpClient) {}

  // ============================================================================
  // User Operations
  // ============================================================================

  /**
   * Create a new support ticket
   */
  createTicket(request: CreateSupportTicketRequest): Observable<SupportTicketDetail> {
    return this.http.post<SupportTicketDetail>(this.apiUrl, request);
  }

  /**
   * Get my submitted tickets (paginated)
   */
  getMyTickets(params: SupportTicketQueryParams = {}): Observable<PagedTicketResult> {
    return this.http.get<PagedTicketResult>(`${this.apiUrl}/my`, {
      params: this.buildParams(params)
    });
  }

  /**
   * Get a single ticket by ID
   */
  getTicket(id: string): Observable<SupportTicketDetail> {
    return this.http.get<SupportTicketDetail>(`${this.apiUrl}/${id}`);
  }

  /**
   * Upload an attachment to a ticket
   */
  uploadAttachment(ticketId: string, file: File): Observable<TicketAttachment> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post<TicketAttachment>(
      `${this.apiUrl}/${ticketId}/attachments`,
      formData
    );
  }

  /**
   * Add a comment to a ticket
   */
  addComment(ticketId: string, request: AddTicketCommentRequest): Observable<TicketComment> {
    return this.http.post<TicketComment>(
      `${this.apiUrl}/${ticketId}/comments`,
      request
    );
  }

  // ============================================================================
  // Admin Operations
  // ============================================================================

  /**
   * Get all tickets (admin view, paginated)
   */
  getAllTickets(params: SupportTicketQueryParams = {}): Observable<PagedTicketResult> {
    return this.http.get<PagedTicketResult>(this.apiUrl, {
      params: this.buildParams(params)
    });
  }

  /**
   * Update ticket status
   */
  updateStatus(id: string, request: UpdateTicketStatusRequest): Observable<SupportTicketDetail> {
    return this.http.put<SupportTicketDetail>(`${this.apiUrl}/${id}/status`, request);
  }

  /**
   * Assign ticket to a user
   */
  assignTicket(id: string, request: AssignTicketRequest): Observable<SupportTicketDetail> {
    return this.http.put<SupportTicketDetail>(`${this.apiUrl}/${id}/assign`, request);
  }

  /**
   * Update ticket priority
   */
  updatePriority(id: string, request: UpdateTicketPriorityRequest): Observable<SupportTicketDetail> {
    return this.http.put<SupportTicketDetail>(`${this.apiUrl}/${id}/priority`, request);
  }

  /**
   * Update admin notes
   */
  updateAdminNotes(id: string, request: UpdateAdminNotesRequest): Observable<SupportTicketDetail> {
    return this.http.put<SupportTicketDetail>(`${this.apiUrl}/${id}/admin-notes`, request);
  }

  /**
   * Soft-delete a ticket
   */
  deleteTicket(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  /**
   * Get ticket statistics
   */
  getStats(): Observable<SupportTicketStats> {
    return this.http.get<SupportTicketStats>(`${this.apiUrl}/stats`);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private buildParams(p: SupportTicketQueryParams): HttpParams {
    let params = new HttpParams();

    if (p.category !== undefined) params = params.set('category', p.category.toString());
    if (p.priority !== undefined) params = params.set('priority', p.priority.toString());
    if (p.status !== undefined) params = params.set('status', p.status.toString());
    if (p.assignedToUserId !== undefined) params = params.set('assignedToUserId', p.assignedToUserId.toString());
    if (p.searchTerm) params = params.set('searchTerm', p.searchTerm);
    if (p.page) params = params.set('page', p.page.toString());
    if (p.pageSize) params = params.set('pageSize', p.pageSize.toString());
    if (p.sortBy) params = params.set('sortBy', p.sortBy);
    if (p.sortDesc !== undefined) params = params.set('sortDesc', p.sortDesc.toString());

    return params;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
