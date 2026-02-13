// src/app/core/services/person-search.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TreeContextService } from './tree-context.service';
import {
  PersonSearchRequest,
  PersonSearchResult,
  SearchPersonItem,
  RelationshipPathRequest,
  RelationshipPathResult,
  FamilyTreeDataRequest,
  FamilyTreeDataResult,
  PersonDetailsResult,
  SearchScript,
  TreeViewMode,
  toPersonListItem
} from '../models/search.models';
import type { PersonListItem, PagedResult } from '../models/person.models';
import { Sex } from '../models/person.models';

/**
 * Service for efficient person search using Dapper + PostgreSQL functions.
 * Provides multilingual search (Arabic, Latin, Coptic), relationship path finding,
 * and tree data retrieval in optimized single-query operations.
 */
@Injectable({
  providedIn: 'root'
})
export class PersonSearchService {
  private http = inject(HttpClient);
  private treeContext = inject(TreeContextService);
  private apiUrl = `${environment.apiUrl}/search`;

  // ========================================================================
  // PERSON SEARCH
  // ========================================================================

  /**
   * Quick search with auto-detected script (GET /api/search/persons)
   * If no query provided, returns all persons (paginated)
   */
  quickSearch(
    query?: string,
    page = 1,
    pageSize = 20
  ): Observable<PersonSearchResult> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    // Only add q parameter if query is not empty
    if (query && query.trim()) {
      params = params.set('q', query.trim());
    }

    const treeId = this.treeContext.effectiveTreeId();
    if (treeId) {
      params = params.set('treeId', treeId);
    }

    return this.http.get<PersonSearchResult>(`${this.apiUrl}/persons`, { params });
  }

  /**
   * Global search across ALL trees (no treeId filter).
   * Used for cross-tree relationship linking where the target person
   * may be in a different tree, town, or country.
   */
  globalSearch(
    query?: string,
    page = 1,
    pageSize = 20
  ): Observable<PersonSearchResult> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (query && query.trim()) {
      params = params.set('q', query.trim());
    }

    // Intentionally no treeId — backend will search all accessible trees
    return this.http.get<PersonSearchResult>(`${this.apiUrl}/persons`, { params });
  }

  /**
   * Advanced search with full filtering (POST /api/search/persons)
   */
  search(request: PersonSearchRequest): Observable<PersonSearchResult> {
    const body = {
      ...request,
      sex: request.sex, // Sex is now a string enum
      treeId: request.treeId || this.treeContext.effectiveTreeId() || undefined,
      page: request.page || 1,
      pageSize: request.pageSize || 20
    };

    return this.http.post<PersonSearchResult>(`${this.apiUrl}/persons`, body);
  }

  /**
   * Search specifically in Arabic script names
   */
  searchArabic(
    query: string,
    page = 1,
    pageSize = 20,
    treeId?: string
  ): Observable<PersonSearchResult> {
    let params = new HttpParams()
      .set('q', query)
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    const effectiveTreeId = treeId || this.treeContext.effectiveTreeId();
    if (effectiveTreeId) {
      params = params.set('treeId', effectiveTreeId);
    }

    return this.http.get<PersonSearchResult>(`${this.apiUrl}/persons/arabic`, { params });
  }

  /**
   * Search specifically in Latin script names
   */
  searchLatin(
    query: string,
    page = 1,
    pageSize = 20,
    treeId?: string
  ): Observable<PersonSearchResult> {
    let params = new HttpParams()
      .set('q', query)
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    const effectiveTreeId = treeId || this.treeContext.effectiveTreeId();
    if (effectiveTreeId) {
      params = params.set('treeId', effectiveTreeId);
    }

    return this.http.get<PersonSearchResult>(`${this.apiUrl}/persons/latin`, { params });
  }

  /**
   * Search specifically in Coptic/Nobiin script names
   */
  searchNobiin(
    query: string,
    page = 1,
    pageSize = 20,
    treeId?: string
  ): Observable<PersonSearchResult> {
    let params = new HttpParams()
      .set('q', query)
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    const effectiveTreeId = treeId || this.treeContext.effectiveTreeId();
    if (effectiveTreeId) {
      params = params.set('treeId', effectiveTreeId);
    }

    return this.http.get<PersonSearchResult>(`${this.apiUrl}/persons/nobiin`, { params });
  }

  /**
   * Search within a specific family
   */
  searchByFamily(
    familyId: string,
    query?: string,
    page = 1,
    pageSize = 20
  ): Observable<PersonSearchResult> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (query) {
      params = params.set('q', query);
    }

    return this.http.get<PersonSearchResult>(
      `${this.apiUrl}/family/${familyId}/persons`,
      { params }
    );
  }

  /**
   * Search within a specific town (across all trees)
   */
  searchByTown(
    townId: string,
    query?: string,
    page = 1,
    pageSize = 20
  ): Observable<PersonSearchResult> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (query) {
      params = params.set('q', query);
    }

    return this.http.get<PersonSearchResult>(
      `${this.apiUrl}/town/${townId}/persons`,
      { params }
    );
  }

  // ========================================================================
  // BACKWARD COMPATIBLE SEARCH (returns PagedResult<PersonListItem>)
  // ========================================================================

  /**
   * Convert sex enum value to string for API
   */
  private sexToString(sex?: Sex): string | undefined {
    if (sex === undefined || sex === null) return undefined;
    // Sex is now a string enum, return directly
    return sex;
  }

  /**
   * Search that returns PersonListItem format for backward compatibility
   * with existing components
   */
  searchPeopleCompat(request: {
    nameQuery?: string;
    townId?: string;
    familyId?: string;
    sex?: Sex;
    page: number;
    pageSize: number;
  }): Observable<PagedResult<PersonListItem>> {
    // If searching by town, use town endpoint
    if (request.townId) {
      return this.searchByTown(request.townId, request.nameQuery, request.page, request.pageSize)
        .pipe(map(result => this.toPagedResult(result)));
    }

    // If searching by family, use family endpoint
    if (request.familyId) {
      return this.searchByFamily(request.familyId, request.nameQuery, request.page, request.pageSize)
        .pipe(map(result => this.toPagedResult(result)));
    }

    // If sex filter is provided, use advanced search (POST)
    if (request.sex !== undefined) {
      const searchRequest: PersonSearchRequest = {
        query: request.nameQuery || undefined,
        sex: this.sexToString(request.sex),  // Convert to string for API
        page: request.page,
        pageSize: request.pageSize
      };
      return this.search(searchRequest)
        .pipe(map(result => this.toPagedResult(result)));
    }

    // Use quick search for simple queries (with or without search term)
    // The quickSearch endpoint now handles empty queries
    return this.quickSearch(request.nameQuery, request.page, request.pageSize)
      .pipe(map(result => this.toPagedResult(result)));
  }

  /**
   * Convert PersonSearchResult to PagedResult<PersonListItem>
   */
  private toPagedResult(result: PersonSearchResult): PagedResult<PersonListItem> {
    return {
      items: result.items.map(item => toPersonListItem(item)),
      totalCount: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages
    };
  }

  // ========================================================================
  // RELATIONSHIP PATH FINDING
  // ========================================================================

  /**
   * Find relationship path between two people
   */
  findRelationshipPath(
    person1Id: string,
    person2Id: string,
    maxDepth = 15,
    treeId?: string
  ): Observable<RelationshipPathResult> {
    let params = new HttpParams()
      .set('person1Id', person1Id)
      .set('person2Id', person2Id)
      .set('maxDepth', maxDepth.toString());

    const effectiveTreeId = treeId || this.treeContext.effectiveTreeId();
    if (effectiveTreeId) {
      params = params.set('treeId', effectiveTreeId);
    }

    return this.http.get<RelationshipPathResult>(`${this.apiUrl}/relationship-path`, { params });
  }

  // ========================================================================
  // TREE DATA FOR VISUALIZATION
  // ========================================================================

  /**
   * Get family tree data for visualization
   */
  getTreeData(
    rootPersonId: string,
    viewMode: TreeViewMode = 'pedigree',
    generations = 3,
    includeSpouses = true
  ): Observable<FamilyTreeDataResult> {
    const params = new HttpParams()
      .set('rootPersonId', rootPersonId)
      .set('viewMode', viewMode)
      .set('generations', generations.toString())
      .set('includeSpouses', includeSpouses.toString());

    return this.http.get<FamilyTreeDataResult>(`${this.apiUrl}/tree-data`, { params });
  }

  /**
   * Get pedigree (ancestors) tree data
   */
  getPedigreeData(
    rootPersonId: string,
    generations = 4,
    includeSpouses = true
  ): Observable<FamilyTreeDataResult> {
    return this.getTreeData(rootPersonId, 'pedigree', generations, includeSpouses);
  }

  /**
   * Get descendants tree data
   */
  getDescendantsData(
    rootPersonId: string,
    generations = 4,
    includeSpouses = true
  ): Observable<FamilyTreeDataResult> {
    return this.getTreeData(rootPersonId, 'descendants', generations, includeSpouses);
  }

  /**
   * Get hourglass (both ancestors and descendants) tree data
   */
  getHourglassData(
    rootPersonId: string,
    generations = 3,
    includeSpouses = true
  ): Observable<FamilyTreeDataResult> {
    return this.getTreeData(rootPersonId, 'hourglass', generations, includeSpouses);
  }

  // ========================================================================
  // PERSON DETAILS
  // ========================================================================

  /**
   * Get complete person details with all related data in a single call
   */
  getPersonDetails(personId: string): Observable<PersonDetailsResult> {
    return this.http.get<PersonDetailsResult>(`${this.apiUrl}/persons/${personId}/details`);
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  /**
   * Detect script from text (for UI hints)
   */
  detectScript(text: string): SearchScript {
    if (!text) return 'auto';

    // Check for Arabic characters (including Arabic Extended ranges)
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text)) {
      return 'arabic';
    }

    // Check for Coptic characters
    if (/[\u2C80-\u2CFF\u03E2-\u03EF]/.test(text)) {
      return 'coptic';
    }

    // Check for Latin characters
    if (/[a-zA-Z\u00C0-\u00FF\u0100-\u017F]/.test(text)) {
      return 'latin';
    }

    return 'auto';
  }

  /**
   * Get appropriate search method based on detected script
   */
  searchByDetectedScript(
    query: string,
    page = 1,
    pageSize = 20,
    treeId?: string
  ): Observable<PersonSearchResult> {
    const script = this.detectScript(query);

    switch (script) {
      case 'arabic':
        return this.searchArabic(query, page, pageSize, treeId);
      case 'coptic':
        return this.searchNobiin(query, page, pageSize, treeId);
      case 'latin':
        return this.searchLatin(query, page, pageSize, treeId);
      default:
        return this.quickSearch(query, page, pageSize);
    }
  }
}