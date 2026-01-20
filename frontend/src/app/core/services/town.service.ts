import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  Town,
  TownListItem,
  CreateTownRequest,
  UpdateTownRequest,
  TownSearchParams,
  TownImportResult,
  PagedResult,
  TownStatistics
} from '../models/town.models';
import { FamilyTreeListItem } from '../models/family-tree.models';

@Injectable({
  providedIn: 'root'
})
export class TownService {
  private readonly apiUrl = `${environment.apiUrl}/town`;

  constructor(private http: HttpClient) {}

  // ========================================================================
  // TOWN CRUD
  // ========================================================================

  /**
   * Get towns with pagination and filtering
   */
  getTowns(params: TownSearchParams): Observable<PagedResult<TownListItem>> {
    let httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('pageSize', params.pageSize.toString());

    if (params.nameQuery) {
      httpParams = httpParams.set('nameQuery', params.nameQuery);
    }
    if (params.country) {
      httpParams = httpParams.set('country', params.country);
    }

    return this.http.get<PagedResult<TownListItem>>(this.apiUrl, { params: httpParams });
  }

  /**
   * Get all towns (for dropdowns, without pagination)
   */
  getAllTowns(): Observable<TownListItem[]> {
    return this.http.get<PagedResult<TownListItem>>(this.apiUrl, {
      params: new HttpParams().set('page', '1').set('pageSize', '1000')
    }).pipe(
      map(result => result.items)
    );
  }

  /**
   * Get a specific town by ID
   */
  getTown(id: string): Observable<Town> {
    return this.http.get<Town>(`${this.apiUrl}/${id}`);
  }

  /**
   * Get all trees in a specific town
   */
  getTownTrees(townId: string): Observable<FamilyTreeListItem[]> {
    return this.http.get<FamilyTreeListItem[]>(`${this.apiUrl}/${townId}/trees`);
  }

  /**
   * Get aggregated statistics for a town
   */
  getTownStatistics(townId: string): Observable<TownStatistics> {
    return this.http.get<TownStatistics>(`${this.apiUrl}/${townId}/statistics`);
  }

  /**
   * Create a new town (Admin/SuperAdmin only)
   */
  createTown(request: CreateTownRequest): Observable<Town> {
    return this.http.post<Town>(this.apiUrl, request);
  }

  /**
   * Update a town (Admin/SuperAdmin only)
   */
  updateTown(id: string, request: UpdateTownRequest): Observable<Town> {
    return this.http.put<Town>(`${this.apiUrl}/${id}`, request);
  }

  /**
   * Delete a town (SuperAdmin only)
   */
  deleteTown(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // ========================================================================
  // CSV IMPORT
  // ========================================================================

  /**
   * Import towns from CSV file
   */
  importTowns(file: File): Observable<TownImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<TownImportResult>(`${this.apiUrl}/import`, formData);
  }

  // ========================================================================
  // HELPERS
  // ========================================================================

  /**
   * Get list of unique countries
   */
  getCountries(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/countries`);
  }
}
