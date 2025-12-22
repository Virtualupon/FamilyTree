import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Family,
  FamilyListItem,
  FamilyWithMembers,
  CreateFamilyRequest,
  UpdateFamilyRequest,
  AssignFamilyRequest
} from '../models/family.models';

/**
 * Service for managing family groups within trees.
 * Hierarchy: Town -> Org (Family Tree) -> Family -> Person
 */
@Injectable({
  providedIn: 'root'
})
export class FamilyService {
  private baseUrl = `${environment.apiUrl}/family`;

  constructor(private http: HttpClient) {}

  // ========================================================================
  // FAMILY QUERIES
  // ========================================================================

  /**
   * Get all families in a family tree
   */
  getFamiliesByTree(treeId: string): Observable<FamilyListItem[]> {
    return this.http.get<FamilyListItem[]>(`${this.baseUrl}/by-tree/${treeId}`);
  }

  /**
   * Get all families in a town (across accessible trees)
   */
  getFamiliesByTown(townId: string): Observable<FamilyListItem[]> {
    return this.http.get<FamilyListItem[]>(`${this.baseUrl}/by-town/${townId}`);
  }

  /**
   * Get a specific family by ID
   */
  getFamily(id: string): Observable<Family> {
    return this.http.get<Family>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get a family with its members
   */
  getFamilyWithMembers(id: string): Observable<FamilyWithMembers> {
    return this.http.get<FamilyWithMembers>(`${this.baseUrl}/${id}/members`);
  }

  // ========================================================================
  // FAMILY CRUD
  // ========================================================================

  /**
   * Create a new family
   */
  createFamily(request: CreateFamilyRequest): Observable<Family> {
    return this.http.post<Family>(this.baseUrl, request);
  }

  /**
   * Update an existing family
   */
  updateFamily(id: string, request: UpdateFamilyRequest): Observable<Family> {
    return this.http.put<Family>(`${this.baseUrl}/${id}`, request);
  }

  /**
   * Delete a family
   */
  deleteFamily(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // ========================================================================
  // MEMBER ASSIGNMENT
  // ========================================================================

  /**
   * Assign a person to a family (or remove by passing null FamilyId)
   */
  assignPersonToFamily(request: AssignFamilyRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/assign`, request);
  }

  /**
   * Bulk assign multiple people to a family
   */
  bulkAssignToFamily(familyId: string, personIds: string[]): Observable<number> {
    return this.http.post<number>(`${this.baseUrl}/${familyId}/bulk-assign`, personIds);
  }
}
