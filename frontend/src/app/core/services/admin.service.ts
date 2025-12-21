import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminUser,
  AdminTreeAssignment,
  AdminTownAssignment,
  CreateAdminAssignmentRequest,
  CreateAdminTownAssignmentRequest,
  CreateAdminTownAssignmentBulkRequest,
  UpdateSystemRoleRequest,
  CreateUserRequest,
  PlatformStats,
  AdminLoginResponse
} from '../models/family-tree.models';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private readonly apiUrl = `${environment.apiUrl}/admin`;

  constructor(private http: HttpClient) {}

  // ========================================================================
  // USER MANAGEMENT
  // ========================================================================

  getAllUsers(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${this.apiUrl}/users`);
  }

  createUser(request: CreateUserRequest): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${this.apiUrl}/users`, request);
  }

  updateUserRole(userId: number, request: UpdateSystemRoleRequest): Observable<AdminUser> {
    return this.http.put<AdminUser>(`${this.apiUrl}/users/${userId}/role`, request);
  }

  // ========================================================================
  // ADMIN ASSIGNMENTS
  // ========================================================================

  getAllAssignments(): Observable<AdminTreeAssignment[]> {
    return this.http.get<AdminTreeAssignment[]>(`${this.apiUrl}/assignments`);
  }

  getUserAssignments(userId: number): Observable<AdminTreeAssignment[]> {
    return this.http.get<AdminTreeAssignment[]>(`${this.apiUrl}/users/${userId}/assignments`);
  }

  createAssignment(request: CreateAdminAssignmentRequest): Observable<AdminTreeAssignment> {
    return this.http.post<AdminTreeAssignment>(`${this.apiUrl}/assignments`, request);
  }

  deleteAssignment(assignmentId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/assignments/${assignmentId}`);
  }

  // ========================================================================
  // TOWN ASSIGNMENTS (Town-scoped admin access)
  // ========================================================================

  getAllTownAssignments(): Observable<AdminTownAssignment[]> {
    return this.http.get<AdminTownAssignment[]>(`${this.apiUrl}/town-assignments`);
  }

  getUserTownAssignments(userId: number): Observable<AdminTownAssignment[]> {
    return this.http.get<AdminTownAssignment[]>(`${this.apiUrl}/users/${userId}/town-assignments`);
  }

  createTownAssignment(request: CreateAdminTownAssignmentRequest): Observable<AdminTownAssignment> {
    return this.http.post<AdminTownAssignment>(`${this.apiUrl}/town-assignments`, request);
  }

  createTownAssignmentsBulk(request: CreateAdminTownAssignmentBulkRequest): Observable<AdminTownAssignment[]> {
    return this.http.post<AdminTownAssignment[]>(`${this.apiUrl}/town-assignments/bulk`, request);
  }

  deleteTownAssignment(assignmentId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/town-assignments/${assignmentId}`);
  }

  deactivateTownAssignment(assignmentId: string): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/town-assignments/${assignmentId}/deactivate`, {});
  }

  getAdminTowns(userId: number): Observable<AdminLoginResponse> {
    return this.http.get<AdminLoginResponse>(`${this.apiUrl}/users/${userId}/admin-towns`);
  }

  // ========================================================================
  // STATISTICS
  // ========================================================================

  getStats(): Observable<PlatformStats> {
    return this.http.get<PlatformStats>(`${this.apiUrl}/stats`);
  }
}
