import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Union, CreateUnionRequest, UnionSearchRequest } from '../models/union.models';

@Injectable({
  providedIn: 'root'
})
export class UnionService {
  private readonly apiUrl = `${environment.apiUrl}/union`;

  constructor(private http: HttpClient) {}

  searchUnions(request: UnionSearchRequest): Observable<any> {
    let params = new HttpParams()
      .set('page', request.page.toString())
      .set('pageSize', request.pageSize.toString());

    if (request.type !== undefined) params = params.set('type', request.type.toString());
    if (request.personId) params = params.set('personId', request.personId);
    if (request.startDateFrom) params = params.set('startDateFrom', request.startDateFrom);
    if (request.startDateTo) params = params.set('startDateTo', request.startDateTo);
    if (request.placeId) params = params.set('placeId', request.placeId);

    return this.http.get<any>(this.apiUrl, { params });
  }

  getUnion(id: string): Observable<Union> {
    return this.http.get<Union>(`${this.apiUrl}/${id}`);
  }

  createUnion(request: CreateUnionRequest): Observable<Union> {
    return this.http.post<Union>(this.apiUrl, request);
  }

  updateUnion(id: string, request: Partial<CreateUnionRequest>): Observable<Union> {
    return this.http.put<Union>(`${this.apiUrl}/${id}`, request);
  }

  deleteUnion(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  addMember(unionId: string, personId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${unionId}/members`, { personId });
  }

  removeMember(unionId: string, personId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${unionId}/members/${personId}`);
  }
}
