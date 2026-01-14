import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface AdminCountry {
  code: string;
  nameEn: string;
  nameAr?: string;
  nameLocal?: string;
  region?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface CreateCountryDto {
  code: string;
  nameEn: string;
  nameAr?: string;
  nameLocal?: string;
  region?: string;
  isActive?: boolean;
  displayOrder?: number;
}

export interface UpdateCountryDto {
  nameEn?: string;
  nameAr?: string;
  nameLocal?: string;
  region?: string;
  isActive?: boolean;
  displayOrder?: number;
}

export interface CountryFilters {
  isActive?: boolean;
  region?: string;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminCountriesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/countries`;

  getAll(filters?: CountryFilters): Observable<AdminCountry[]> {
    let params = new HttpParams();
    if (filters?.isActive !== undefined) {
      params = params.set('isActive', filters.isActive.toString());
    }
    if (filters?.region) {
      params = params.set('region', filters.region);
    }
    if (filters?.search) {
      params = params.set('search', filters.search);
    }
    return this.http.get<AdminCountry[]>(this.baseUrl, { params });
  }

  getByCode(code: string): Observable<AdminCountry> {
    return this.http.get<AdminCountry>(`${this.baseUrl}/${code}`);
  }

  create(dto: CreateCountryDto): Observable<AdminCountry> {
    return this.http.post<AdminCountry>(this.baseUrl, dto);
  }

  update(code: string, dto: UpdateCountryDto): Observable<AdminCountry> {
    return this.http.put<AdminCountry>(`${this.baseUrl}/${code}`, dto);
  }

  delete(code: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${code}`);
  }

  toggleActive(code: string): Observable<{ code: string; isActive: boolean }> {
    return this.http.patch<{ code: string; isActive: boolean }>(
      `${this.baseUrl}/${code}/toggle-active`,
      {}
    );
  }

  getRegions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/regions`);
  }
}
