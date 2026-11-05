// Route resolvers: each page gets its data before it renders, so the prerendered
// HTML is complete without JavaScript. A record id that does not exist leads to
// the not-found page.
import { inject } from '@angular/core';
import { RedirectCommand, ResolveFn, Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiRecord, CatalogApi } from './api';

const orNotFound = <T>(router: Router) =>
  catchError<T, any>(() => of(new RedirectCommand(router.parseUrl('/404'), { skipLocationChange: true })));

export const homeResolver: ResolveFn<ApiRecord> = () => inject(CatalogApi).home();
export const indexResolver: ResolveFn<ApiRecord> = () => inject(CatalogApi).index();
export const datasetsResolver: ResolveFn<ApiRecord[]> = () => inject(CatalogApi).datasets();
export const wantedResolver: ResolveFn<ApiRecord[]> = () => inject(CatalogApi).wanted();
export const coursesResolver: ResolveFn<ApiRecord[]> = () => inject(CatalogApi).courses();
export const internationalResolver: ResolveFn<ApiRecord[]> = () => inject(CatalogApi).international();
export const newsResolver: ResolveFn<ApiRecord[]> = () => inject(CatalogApi).news();

export const datasetResolver: ResolveFn<ApiRecord> = (route) => {
  const router = inject(Router);
  return inject(CatalogApi).dataset(route.paramMap.get('id') ?? '').pipe(orNotFound(router));
};

export const courseResolver: ResolveFn<ApiRecord> = (route) => {
  const router = inject(Router);
  return inject(CatalogApi).course(route.paramMap.get('id') ?? '').pipe(orNotFound(router));
};
