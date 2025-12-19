import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  FamilyTree,
  FamilyTreeListItem,
  CreateFamilyTreeRequest,
  UpdateFamilyTreeRequest,
  TreeMember,
  AddTreeMemberRequest,
  UpdateTreeMemberRoleRequest,
  TreeInvitation,
  CreateInvitationRequest,
  AcceptInvitationRequest
} from '../models/family-tree.models';

@Injectable({
  providedIn: 'root'
})
export class FamilyTreeService {
  private readonly apiUrl = `${environment.apiUrl}/familytree`;

  constructor(private http: HttpClient) {}

  // ========================================================================
  // TREE CRUD
  // ========================================================================

  getMyTrees(): Observable<FamilyTreeListItem[]> {
    return this.http.get<FamilyTreeListItem[]>(this.apiUrl);
  }

  getTree(id: string): Observable<FamilyTree> {
    return this.http.get<FamilyTree>(`${this.apiUrl}/${id}`);
  }

  createTree(request: CreateFamilyTreeRequest): Observable<FamilyTree> {
    return this.http.post<FamilyTree>(this.apiUrl, request);
  }

  updateTree(id: string, request: UpdateFamilyTreeRequest): Observable<FamilyTree> {
    return this.http.put<FamilyTree>(`${this.apiUrl}/${id}`, request);
  }

  deleteTree(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // ========================================================================
  // MEMBERS
  // ========================================================================

  getMembers(treeId: string): Observable<TreeMember[]> {
    return this.http.get<TreeMember[]>(`${this.apiUrl}/${treeId}/members`);
  }

  addMember(treeId: string, request: AddTreeMemberRequest): Observable<TreeMember> {
    return this.http.post<TreeMember>(`${this.apiUrl}/${treeId}/members`, request);
  }

  updateMemberRole(treeId: string, userId: number, request: UpdateTreeMemberRoleRequest): Observable<TreeMember> {
    return this.http.put<TreeMember>(`${this.apiUrl}/${treeId}/members/${userId}`, request);
  }

  removeMember(treeId: string, userId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${treeId}/members/${userId}`);
  }

  // ========================================================================
  // INVITATIONS
  // ========================================================================

  getInvitations(treeId: string): Observable<TreeInvitation[]> {
    return this.http.get<TreeInvitation[]>(`${this.apiUrl}/${treeId}/invitations`);
  }

  createInvitation(treeId: string, request: CreateInvitationRequest): Observable<TreeInvitation> {
    return this.http.post<TreeInvitation>(`${this.apiUrl}/${treeId}/invitations`, request);
  }

  acceptInvitation(request: AcceptInvitationRequest): Observable<FamilyTree> {
    return this.http.post<FamilyTree>(`${this.apiUrl}/invitations/accept`, request);
  }

  deleteInvitation(treeId: string, invitationId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${treeId}/invitations/${invitationId}`);
  }
}
