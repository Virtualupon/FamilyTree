import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  GedcomImportResult,
  GedcomImportOptions,
  GedcomPreviewResult
} from '../models/gedcom.models';

@Injectable({
  providedIn: 'root'
})
export class GedcomService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/gedcom`;

  /**
   * Preview a GEDCOM file without importing
   */
  preview(file: File): Observable<GedcomPreviewResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<GedcomPreviewResult>(`${this.baseUrl}/preview`, formData);
  }

  /**
   * Import a GEDCOM file into a new or existing family tree
   */
  import(file: File, options: GedcomImportOptions = {}): Observable<GedcomImportResult> {
    const formData = new FormData();
    formData.append('file', file);

    let params = new HttpParams();

    if (options.treeName) {
      params = params.set('treeName', options.treeName);
    }
    if (options.existingTreeId) {
      params = params.set('existingTreeId', options.existingTreeId);
    }
    if (options.townId) {
      params = params.set('townId', options.townId);
    }
    if (options.createNewTree !== undefined) {
      params = params.set('createNewTree', options.createNewTree.toString());
    }
    if (options.importNotes !== undefined) {
      params = params.set('importNotes', options.importNotes.toString());
    }
    if (options.importOccupations !== undefined) {
      params = params.set('importOccupations', options.importOccupations.toString());
    }

    return this.http.post<GedcomImportResult>(`${this.baseUrl}/import`, formData, { params });
  }
}
