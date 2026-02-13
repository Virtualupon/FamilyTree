export interface EntityNote {
  id: string;
  entityType: string;
  entityId: string;
  notesEn: string | null;
  notesAr: string | null;
  notesNob: string | null;
  createdByUserId: number | null;
  createdByUserName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteRequest {
  notesEn?: string;
  notesAr?: string;
  notesNob?: string;
}

export interface UpdateNoteRequest {
  notesEn?: string;
  notesAr?: string;
  notesNob?: string;
}
