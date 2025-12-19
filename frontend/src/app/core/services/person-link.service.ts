import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  PersonLink,
  CreatePersonLinkRequest,
  ApprovePersonLinkRequest,
  PersonLinkSearchResult,
  PersonLinkSummary,
  TreeLinksSummary
} from '../models/family-tree.models';

@Injectable({
  providedIn: 'root'
})
export class PersonLinkService {
  private readonly apiUrl = `${environment.apiUrl}/personlink`;

  constructor(private http: HttpClient) {}

  getPersonLinks(personId: string): Observable<PersonLink[]> {
    return this.http.get<PersonLink[]>(`${this.apiUrl}/person/${personId}`);
  }

  getPendingLinks(): Observable<PersonLink[]> {
    return this.http.get<PersonLink[]>(`${this.apiUrl}/pending`);
  }

  createLink(request: CreatePersonLinkRequest): Observable<PersonLink> {
    return this.http.post<PersonLink>(this.apiUrl, request);
  }

  reviewLink(linkId: string, request: ApprovePersonLinkRequest): Observable<PersonLink> {
    return this.http.post<PersonLink>(`${this.apiUrl}/${linkId}/review`, request);
  }

  deleteLink(linkId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${linkId}`);
  }

  searchForMatches(
    name: string,
    birthDate?: string,
    excludeTreeId?: string
  ): Observable<PersonLinkSearchResult[]> {
    let params = new HttpParams().set('name', name);

    if (birthDate) {
      params = params.set('birthDate', birthDate);
    }
    if (excludeTreeId) {
      params = params.set('excludeTreeId', excludeTreeId);
    }

    return this.http.get<PersonLinkSearchResult[]>(`${this.apiUrl}/search`, { params });
  }

  /**
   * Get all cross-tree links for a tree, grouped by person ID.
   * Used for D3 visualization badges.
   */
  getTreeLinksSummary(treeId: string): Observable<TreeLinksSummary> {
    return this.http.get<TreeLinksSummary>(`${this.apiUrl}/tree/${treeId}/summary`);
  }
}
