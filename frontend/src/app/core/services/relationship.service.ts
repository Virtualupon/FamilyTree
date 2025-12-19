import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// Import Sex from existing models
import { Sex, DatePrecision } from '../models/person.models';
import type { PagedResult, PersonName } from '../models/person.models';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ParentChildResponse {
  id: string;
  parentId: string;
  parentName: string | null;
  parentSex: Sex | null;
  childId: string;
  childName: string | null;
  childSex: Sex | null;
  relationshipType: ParentChildRelationshipType;
  isAdopted: boolean;
  isBiological: boolean;
  notes: string | null;
}

export interface AddParentChildRequest {
  relationshipType?: ParentChildRelationshipType;
  isAdopted?: boolean;
  isBiological?: boolean;
  notes?: string;
}

export interface UpdateParentChildRequest {
  relationshipType?: ParentChildRelationshipType;
  isAdopted?: boolean;
  isBiological?: boolean;
  notes?: string;
}

export interface SiblingResponse {
  personId: string;
  personName: string | null;
  personSex: Sex | null;
  sharedParentCount: number;
  isFullSibling: boolean;
  isHalfSibling: boolean;
}

export enum ParentChildRelationshipType {
  Biological = 0,
  Adopted = 1,
  Foster = 2,
  Step = 3,
  Guardian = 4,
  Unknown = 5
}

// Union (Marriage) interfaces
export interface UnionResponse {
  id: string;
  orgId: string;
  type: UnionType;
  startDate: string | null;
  startPrecision: DatePrecision;
  startPlaceId: string | null;
  startPlaceName: string | null;
  endDate: string | null;
  endPrecision: DatePrecision;
  endPlaceId: string | null;
  endPlaceName: string | null;
  notes: string | null;
  members: UnionMemberDto[];
  createdAt: string;
  updatedAt: string;
}

export interface UnionMemberDto {
  id: string;
  personId: string;
  personName: string | null;
  personSex: Sex | null;
}

export interface CreateUnionRequest {
  type?: UnionType;
  startDate?: string;
  startPrecision?: DatePrecision;
  startPlaceId?: string;
  endDate?: string;
  endPrecision?: DatePrecision;
  endPlaceId?: string;
  notes?: string;
  memberIds: string[];
}

export interface UpdateUnionRequest {
  type?: UnionType;
  startDate?: string;
  startPrecision?: DatePrecision;
  startPlaceId?: string;
  endDate?: string;
  endPrecision?: DatePrecision;
  endPlaceId?: string;
  notes?: string;
}

export interface AddUnionMemberRequest {
  personId: string;
}

export enum UnionType {
  Marriage = 0,
  CivilUnion = 1,
  DomesticPartnership = 2,
  CommonLaw = 3,
  Engagement = 4,
  Divorced = 5,
  Widowed = 6,
  Separated = 7,
  Annulled = 8,
  Unknown = 9
}

export interface UnionSearchParams {
  treeId?: string;  // For SuperAdmin/Admin to specify which tree
  type?: UnionType;
  personId?: string;
  startDateFrom?: string;
  startDateTo?: string;
  placeId?: string;
  page?: number;
  pageSize?: number;
}

// Tree View interfaces
export interface TreeViewRequest {
  personId: string;
  generations?: number;
}

export interface TreeViewResponse {
  rootPersonId: string;
  nodes: TreeNode[];
  edges: TreeEdge[];
  viewType: string;
  generations: number;
}

export interface TreeNode {
  personId: string;
  primaryName: string | null;
  sex: Sex | null;
  birthDate: string | null;
  deathDate: string | null;
  isLiving: boolean;
  generation: number;
  names?: PersonName[];
}

export interface TreeEdge {
  fromPersonId: string;
  toPersonId: string;
  relationType: string;
}

export interface FamilyGroupResponse {
  person: TreeNode;
  parents: TreeNode[];
  spouses: SpouseInfo[];
  children: TreeNode[];
}

export interface SpouseInfo {
  person: TreeNode;
  unionId: string;
  unionType: UnionType;
  startDate: string | null;
  endDate: string | null;
}

export interface RelationshipResponse {
  person1Id: string;
  person2Id: string;
  relationshipType: string;
  description: string;
  generationsFromCommonAncestor1: number | null;
  generationsFromCommonAncestor2: number | null;
  commonAncestors: string[];
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class RelationshipService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  // ========================================================================
  // PARENT-CHILD RELATIONSHIPS
  // ========================================================================

  /**
   * Get all parents of a person
   */
  getParents(personId: string): Observable<ParentChildResponse[]> {
    return this.http.get<ParentChildResponse[]>(
      `${this.apiUrl}/parentchild/person/${personId}/parents`
    );
  }

  /**
   * Get all children of a person
   */
  getChildren(personId: string): Observable<ParentChildResponse[]> {
    return this.http.get<ParentChildResponse[]>(
      `${this.apiUrl}/parentchild/person/${personId}/children`
    );
  }

  /**
   * Get siblings of a person
   */
  getSiblings(personId: string): Observable<SiblingResponse[]> {
    return this.http.get<SiblingResponse[]>(
      `${this.apiUrl}/parentchild/person/${personId}/siblings`
    );
  }

  /**
   * Add a parent to a person
   */
  addParent(childId: string, parentId: string, request?: AddParentChildRequest): Observable<ParentChildResponse> {
    return this.http.post<ParentChildResponse>(
      `${this.apiUrl}/parentchild/person/${childId}/parents/${parentId}`,
      request || {}
    );
  }

  /**
   * Add a child to a person
   */
  addChild(parentId: string, childId: string, request?: AddParentChildRequest): Observable<ParentChildResponse> {
    return this.http.post<ParentChildResponse>(
      `${this.apiUrl}/parentchild/person/${parentId}/children/${childId}`,
      request || {}
    );
  }

  /**
   * Update a parent-child relationship
   */
  updateRelationship(id: string, request: UpdateParentChildRequest): Observable<ParentChildResponse> {
    return this.http.put<ParentChildResponse>(
      `${this.apiUrl}/parentchild/${id}`,
      request
    );
  }

  /**
   * Delete a parent-child relationship by ID
   */
  deleteRelationship(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/parentchild/${id}`);
  }

  /**
   * Remove a parent from a child
   */
  removeParent(childId: string, parentId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/parentchild/person/${childId}/parents/${parentId}`
    );
  }

  /**
   * Remove a child from a parent
   */
  removeChild(parentId: string, childId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/parentchild/person/${parentId}/children/${childId}`
    );
  }

  // ========================================================================
  // UNIONS (MARRIAGES/PARTNERSHIPS)
  // ========================================================================

  /**
   * Search unions with filtering
   */
  searchUnions(params?: UnionSearchParams): Observable<PagedResult<UnionResponse>> {
    let httpParams = new HttpParams();
    if (params) {
      if (params.treeId) httpParams = httpParams.set('treeId', params.treeId);
      if (params.type !== undefined) httpParams = httpParams.set('type', params.type.toString());
      if (params.personId) httpParams = httpParams.set('personId', params.personId);
      if (params.startDateFrom) httpParams = httpParams.set('startDateFrom', params.startDateFrom);
      if (params.startDateTo) httpParams = httpParams.set('startDateTo', params.startDateTo);
      if (params.placeId) httpParams = httpParams.set('placeId', params.placeId);
      if (params.page) httpParams = httpParams.set('page', params.page.toString());
      if (params.pageSize) httpParams = httpParams.set('pageSize', params.pageSize.toString());
    }
    return this.http.get<PagedResult<UnionResponse>>(`${this.apiUrl}/union`, { params: httpParams });
  }

  /**
   * Get unions for a specific person
   */
  getPersonUnions(personId: string): Observable<PagedResult<UnionResponse>> {
    return this.searchUnions({ personId, pageSize: 50 });
  }

  /**
   * Get a specific union
   */
  getUnion(id: string): Observable<UnionResponse> {
    return this.http.get<UnionResponse>(`${this.apiUrl}/union/${id}`);
  }

  /**
   * Create a new union (marriage/partnership)
   */
  createUnion(request: CreateUnionRequest): Observable<UnionResponse> {
    return this.http.post<UnionResponse>(`${this.apiUrl}/union`, request);
  }

  /**
   * Update a union
   */
  updateUnion(id: string, request: UpdateUnionRequest): Observable<UnionResponse> {
    return this.http.put<UnionResponse>(`${this.apiUrl}/union/${id}`, request);
  }

  /**
   * Delete a union
   */
  deleteUnion(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/union/${id}`);
  }

  /**
   * Add a member (spouse) to a union
   */
  addUnionMember(unionId: string, request: AddUnionMemberRequest): Observable<UnionResponse> {
    return this.http.post<UnionResponse>(`${this.apiUrl}/union/${unionId}/members`, request);
  }

  /**
   * Remove a member from a union
   */
  removeUnionMember(unionId: string, personId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/union/${unionId}/members/${personId}`);
  }

  // ========================================================================
  // TREE VIEWS
  // ========================================================================

  /**
   * Get pedigree (ancestors) view
   */
  getPedigree(request: TreeViewRequest): Observable<TreeViewResponse> {
    return this.http.post<TreeViewResponse>(`${this.apiUrl}/tree/pedigree`, request);
  }

  /**
   * Get descendants view
   */
  getDescendants(request: TreeViewRequest): Observable<TreeViewResponse> {
    return this.http.post<TreeViewResponse>(`${this.apiUrl}/tree/descendants`, request);
  }

  /**
   * Get hourglass view (ancestors + descendants)
   */
  getHourglass(request: TreeViewRequest): Observable<TreeViewResponse> {
    return this.http.post<TreeViewResponse>(`${this.apiUrl}/tree/hourglass`, request);
  }

  /**
   * Get family group (person, spouse(s), parents, children)
   */
  getFamilyGroup(personId: string): Observable<FamilyGroupResponse> {
    return this.http.get<FamilyGroupResponse>(`${this.apiUrl}/tree/family/${personId}`);
  }

  /**
   * Calculate relationship between two people
   */
  getRelationship(person1Id: string, person2Id: string): Observable<RelationshipResponse> {
    return this.http.get<RelationshipResponse>(`${this.apiUrl}/tree/relationship`, {
      params: { person1Id, person2Id }
    });
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  /**
   * Get display name for relationship type
   */
  getRelationshipTypeName(type: ParentChildRelationshipType): string {
    const names: Record<ParentChildRelationshipType, string> = {
      [ParentChildRelationshipType.Biological]: 'Biological',
      [ParentChildRelationshipType.Adopted]: 'Adopted',
      [ParentChildRelationshipType.Foster]: 'Foster',
      [ParentChildRelationshipType.Step]: 'Step',
      [ParentChildRelationshipType.Guardian]: 'Guardian',
      [ParentChildRelationshipType.Unknown]: 'Unknown'
    };
    return names[type] || 'Unknown';
  }

  /**
   * Get display name for union type
   */
  getUnionTypeName(type: UnionType): string {
    const names: Record<UnionType, string> = {
      [UnionType.Marriage]: 'Marriage',
      [UnionType.CivilUnion]: 'Civil Union',
      [UnionType.DomesticPartnership]: 'Domestic Partnership',
      [UnionType.CommonLaw]: 'Common Law',
      [UnionType.Engagement]: 'Engagement',
      [UnionType.Divorced]: 'Divorced',
      [UnionType.Widowed]: 'Widowed',
      [UnionType.Separated]: 'Separated',
      [UnionType.Annulled]: 'Annulled',
      [UnionType.Unknown]: 'Unknown'
    };
    return names[type] || 'Unknown';
  }
}