import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminUser,
  AdminTreeAssignment,
  CreateAdminAssignmentRequest,
  UpdateSystemRoleRequest,
  CreateUserRequest,
  PlatformStats
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
  // STATISTICS
  // ========================================================================

  getStats(): Observable<PlatformStats> {
    return this.http.get<PlatformStats>(`${this.apiUrl}/stats`);
  }
}
