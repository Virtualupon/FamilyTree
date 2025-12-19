import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  TreePersonNode,
  PedigreeRequest,
  DescendantRequest,
  HourglassRequest,
  RelationshipCalculationRequest,
  RelationshipCalculationResponse
} from '../models/tree.models';

@Injectable({
  providedIn: 'root'
})
export class TreeService {
  private readonly apiUrl = `${environment.apiUrl}/tree`;

  constructor(private http: HttpClient) {}

  getPedigree(request: PedigreeRequest): Observable<TreePersonNode> {
    return this.http.post<TreePersonNode>(`${this.apiUrl}/pedigree`, request);
  }

  getDescendants(request: DescendantRequest): Observable<TreePersonNode> {
    return this.http.post<TreePersonNode>(`${this.apiUrl}/descendants`, request);
  }

  getHourglass(request: HourglassRequest): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/hourglass`, request);
  }

  calculateRelationship(request: RelationshipCalculationRequest): Observable<RelationshipCalculationResponse> {
    const params = new URLSearchParams();
    params.set('person1Id', request.person1Id);
    params.set('person2Id', request.person2Id);
    return this.http.get<RelationshipCalculationResponse>(`${this.apiUrl}/relationship?${params.toString()}`);
  }
}
