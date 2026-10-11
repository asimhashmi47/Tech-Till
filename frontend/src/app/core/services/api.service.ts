import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { PagedResult, QueryRequest } from '../models/api.models';

/**
 * Thin wrapper over HttpClient. Every feature goes through here so the base URL, the
 * query contract and the Excel download handling live in one place.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  get<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Observable<T> {
    return this.http.get<T>(`${this.base}/${path}`, { params: this.toParams(params) });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.base}/${path}`, body);
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.base}/${path}`, body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.base}/${path}`);
  }

  /** Server side grid query. Resource is for example `products` or `invoices`. */
  query<T>(resource: string, request: QueryRequest): Observable<PagedResult<T>> {
    return this.post<PagedResult<T>>(`${resource}/query`, request);
  }

  /**
   * Excel export of the current filter, sort and visible columns. The response is a
   * blob, and the filename comes from Content-Disposition when the server sends one.
   */
  export(resource: string, request: QueryRequest, query?: Record<string, string>): Observable<HttpDownload> {
    const url = new URL(`${this.base}/${resource}/export`, window.location.origin);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    return this.http
      .post(url.pathname + url.search, request, { observe: 'response', responseType: 'blob' })
      .pipe(
        // The header is exposed by the API's CORS policy, so the browser can read it.
        map((response) => ({
          blob: response.body as Blob,
          filename: parseFilename(response.headers.get('Content-Disposition')),
        })),
      );
  }

  exportGet(path: string, params?: Record<string, string | number | boolean | null | undefined>): Observable<HttpDownload> {
    return this.http
      .get(`${this.base}/${path}`, { params: this.toParams(params), observe: 'response', responseType: 'blob' })
      .pipe(
        map((response) => ({
          blob: response.body as Blob,
          filename: parseFilename(response.headers.get('Content-Disposition')),
        })),
      );
  }

  private toParams(source?: Record<string, string | number | boolean | null | undefined>): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(source ?? {})) {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return params;
  }
}

export interface HttpDownload {
  blob: Blob;
  filename: string;
}

function parseFilename(header: string | null): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header ?? '');
  return match ? decodeURIComponent(match[1]) : 'techtill-export.xlsx';
}

/** Saves a downloaded blob without leaving the app. */
export function saveBlob(download: HttpDownload): void {
  const url = URL.createObjectURL(download.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = download.filename;
  link.click();
  URL.revokeObjectURL(url);
}
