import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EntityNote, CreateNoteRequest, UpdateNoteRequest } from '../models/note.models';

@Injectable({
  providedIn: 'root'
})
export class NoteService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/notes`;

  /**
   * Get all notes for an entity
   */
  getNotes(entityType: string, entityId: string): Observable<EntityNote[]> {
    return this.http.get<EntityNote[]>(`${this.apiUrl}/${entityType}/${entityId}`);
  }

  /**
   * Create a note for an entity
   */
  createNote(entityType: string, entityId: string, note: CreateNoteRequest): Observable<EntityNote> {
    return this.http.post<EntityNote>(`${this.apiUrl}/${entityType}/${entityId}`, note);
  }

  /**
   * Update a note
   */
  updateNote(noteId: string, note: UpdateNoteRequest): Observable<EntityNote> {
    return this.http.put<EntityNote>(`${this.apiUrl}/${noteId}`, note);
  }

  /**
   * Delete a note
   */
  deleteNote(noteId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${noteId}`);
  }
}
