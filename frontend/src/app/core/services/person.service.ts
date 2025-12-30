import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// Import types - components should import directly from models
import type {
  PersonListItem,
  Person,
  CreatePersonRequest,
  UpdatePersonRequest,
  PersonName,
  PersonSearchRequest,
  PagedResult
} from '../models/person.models';

import { Sex, DatePrecision, PrivacyLevel, NameType } from '../models/person.models';
import { TreeContextService } from './tree-context.service';

@Injectable({
  providedIn: 'root'
})
export class PersonService {
  private http = inject(HttpClient);
  private treeContext = inject(TreeContextService);
  private apiUrl = `${environment.apiUrl}/person`;

  /**
   * Get the effective treeId for API calls
   * Returns null if using token-based orgId (for regular users)
   */
  private getTreeIdParam(): string | null {
    return this.treeContext.effectiveTreeId();
  }

  /**
   * Search/list people with filters and pagination
   */
  searchPeople(params: PersonSearchRequest): Observable<PagedResult<PersonListItem>> {
    let httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('pageSize', params.pageSize.toString());

    // If townId is provided, use town-based search (skips treeId)
    if (params.townId) {
      httpParams = httpParams.set('townId', params.townId);
    } else {
      // Add treeId for admin users
      const treeId = this.getTreeIdParam();
      if (treeId) httpParams = httpParams.set('treeId', treeId);
    }

    if (params.nameQuery) httpParams = httpParams.set('nameQuery', params.nameQuery);
    if (params.sex !== undefined) httpParams = httpParams.set('sex', params.sex.toString());
    if (params.birthDateFrom) httpParams = httpParams.set('birthDateFrom', params.birthDateFrom);
    if (params.birthDateTo) httpParams = httpParams.set('birthDateTo', params.birthDateTo);
    if (params.deathDateFrom) httpParams = httpParams.set('deathDateFrom', params.deathDateFrom);
    if (params.deathDateTo) httpParams = httpParams.set('deathDateTo', params.deathDateTo);
    if (params.birthPlaceId) httpParams = httpParams.set('birthPlaceId', params.birthPlaceId);
    if (params.deathPlaceId) httpParams = httpParams.set('deathPlaceId', params.deathPlaceId);
    if (params.privacyLevel !== undefined) httpParams = httpParams.set('privacyLevel', params.privacyLevel.toString());
    if (params.isVerified !== undefined) httpParams = httpParams.set('isVerified', params.isVerified.toString());
    if (params.needsReview !== undefined) httpParams = httpParams.set('needsReview', params.needsReview.toString());

    return this.http.get<PagedResult<PersonListItem>>(this.apiUrl, { params: httpParams });
  }

  /**
   * Alias for searchPeople
   */
  search(params: PersonSearchRequest): Observable<PagedResult<PersonListItem>> {
    return this.searchPeople(params);
  }

  /**
   * Get a specific person by ID
   */
  getPerson(id: string): Observable<Person> {
    const treeId = this.getTreeIdParam();
    let params = new HttpParams();
    if (treeId) params = params.set('treeId', treeId);
    return this.http.get<Person>(`${this.apiUrl}/${id}`, { params });
  }

  /**
   * Alias for getPerson
   */
  get(id: string): Observable<Person> {
    return this.getPerson(id);
  }

  /**
   * Create a new person
   */
  createPerson(request: CreatePersonRequest): Observable<Person> {
    const treeId = this.getTreeIdParam();
    const body = treeId ? { ...request, treeId } : request;
    return this.http.post<Person>(this.apiUrl, body);
  }

  /**
   * Alias for createPerson
   */
  create(request: CreatePersonRequest): Observable<Person> {
    return this.createPerson(request);
  }

  /**
   * Update a person
   */
  updatePerson(id: string, request: UpdatePersonRequest): Observable<Person> {
    const treeId = this.getTreeIdParam();
    let params = new HttpParams();
    if (treeId) params = params.set('treeId', treeId);
    return this.http.put<Person>(`${this.apiUrl}/${id}`, request, { params });
  }

  /**
   * Alias for updatePerson
   */
  update(id: string, request: UpdatePersonRequest): Observable<Person> {
    return this.updatePerson(id, request);
  }

  /**
   * Delete a person
   */
  deletePerson(id: string): Observable<void> {
    const treeId = this.getTreeIdParam();
    let params = new HttpParams();
    if (treeId) params = params.set('treeId', treeId);
    return this.http.delete<void>(`${this.apiUrl}/${id}`, { params });
  }

  /**
   * Alias for deletePerson
   */
  delete(id: string): Observable<void> {
    return this.deletePerson(id);
  }

  /**
   * Add a name to a person
   */
  addName(personId: string, name: PersonName): Observable<PersonName> {
    const treeId = this.getTreeIdParam();
    let params = new HttpParams();
    if (treeId) params = params.set('treeId', treeId);
    return this.http.post<PersonName>(`${this.apiUrl}/${personId}/names`, name, { params });
  }

  /**
   * Update a person's name
   */
  updateName(personId: string, nameId: string, name: PersonName): Observable<PersonName> {
    const treeId = this.getTreeIdParam();
    let params = new HttpParams();
    if (treeId) params = params.set('treeId', treeId);
    return this.http.put<PersonName>(`${this.apiUrl}/${personId}/names/${nameId}`, name, { params });
  }

  /**
   * Delete a person's name
   */
  deleteName(personId: string, nameId: string): Observable<void> {
    const treeId = this.getTreeIdParam();
    let params = new HttpParams();
    if (treeId) params = params.set('treeId', treeId);
    return this.http.delete<void>(`${this.apiUrl}/${personId}/names/${nameId}`, { params });
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  getSexLabel(sex: Sex | null | undefined): string {
    if (sex === null || sex === undefined) return 'Unknown';
    switch (sex) {
      case Sex.Male: return 'Male';
      case Sex.Female: return 'Female';
      case Sex.Unknown: return 'Unknown';
      default: return 'Unknown';
    }
  }

  getPrivacyLabel(level: PrivacyLevel): string {
    switch (level) {
      case PrivacyLevel.Public: return 'Public';
      case PrivacyLevel.Family: return 'Family Only';
      case PrivacyLevel.Private: return 'Private';
      default: return 'Unknown';
    }
  }

  getNameTypeLabel(type: NameType): string {
    switch (type) {
      case NameType.Primary: return 'Primary';
      case NameType.Birth: return 'Birth';
      case NameType.Maiden: return 'Maiden';
      case NameType.Married: return 'Married';
      case NameType.Alias: return 'Alias';
      case NameType.Nickname: return 'Nickname';
      default: return 'Other';
    }
  }

  formatDate(dateStr: string | null | undefined, precision?: DatePrecision): string {
    if (!dateStr) return '';

    const date = new Date(dateStr);

    switch (precision) {
      case DatePrecision.About:
        return `~${date.getFullYear()}`;
      case DatePrecision.Before:
        return `Before ${date.getFullYear()}`;
      case DatePrecision.After:
        return `After ${date.getFullYear()}`;
      case DatePrecision.Unknown:
        return date.getFullYear().toString();
      case DatePrecision.Exact:
        return date.toLocaleDateString();
      default:
        return date.toLocaleDateString();
    }
  }

  getLifespan(person: PersonListItem | Person): string {
    const birth = person.birthDate ? new Date(person.birthDate).getFullYear() : '?';
    const death = person.deathDate ? new Date(person.deathDate).getFullYear() : '';
    
    if (birth === '?' && death === '') return '';
    if (death === '') return `b. ${birth}`;
    return `${birth} - ${death}`;
  }
}