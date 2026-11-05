// Reads the generated catalog. On the server (prerender) the build's files are
// served from memory by Angular's fetch patch; in the browser the first read
// comes from the transfer cache in the page, later ones from /api/v1/ and /_data/.
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type Text = { 'zh-Hant': string; en?: string };
export type Label = { id: string; 'zh-Hant': string; en: string };
// The API records are documented by /api/v1/schema/ and scripts/catalog/lib/api.mjs;
// the pages read them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiRecord = any;

@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);

  get<T = ApiRecord>(path: string): Observable<T> {
    return this.http.get<T>(path);
  }

  index = () => this.get('/api/v1/index.json');
  home = () => this.get('/_data/home.json');
  datasets = () => this.get<ApiRecord[]>('/api/v1/datasets.json');
  dataset = (id: string) => this.get(`/api/v1/datasets/${encodeURIComponent(id)}.json`);
  wanted = () => this.get<ApiRecord[]>('/api/v1/wanted.json');
  courses = () => this.get<ApiRecord[]>('/api/v1/courses.json');
  course = (id: string) => this.get(`/api/v1/courses/${encodeURIComponent(id)}.json`);
  news = () => this.get<ApiRecord[]>('/api/v1/news.json');
  international = () => this.get<ApiRecord[]>('/_data/international.json');
}
