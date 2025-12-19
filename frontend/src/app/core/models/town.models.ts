/**
 * Town/City models for the frontend
 */

export interface Town {
  id: string;
  name: string;
  nameEn?: string | null;
  nameAr?: string | null;
  nameLocal?: string | null;
  description?: string | null;
  country?: string | null;
  treeCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface TownListItem {
  id: string;
  name: string;
  nameEn?: string | null;
  nameAr?: string | null;
  nameLocal?: string | null;
  country?: string | null;
  treeCount: number;
  createdAt: string;
}

export interface CreateTownRequest {
  name: string;
  nameEn?: string | null;
  nameAr?: string | null;
  nameLocal?: string | null;
  description?: string | null;
  country?: string | null;
}

export interface UpdateTownRequest {
  name?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
  nameLocal?: string | null;
  description?: string | null;
  country?: string | null;
}

export interface TownSearchParams {
  page: number;
  pageSize: number;
  nameQuery?: string;
  country?: string;
}

export interface TownImportResult {
  totalRows: number;
  created: number;
  skipped: number;
  errors: number;
  errorDetails: TownImportError[];
}

export interface TownImportError {
  row: number;
  name: string;
  errorMessage: string;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
