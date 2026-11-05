import { Routes } from '@angular/router';
import * as r from './core/resolvers';
import { About } from './pages/about/about';
import { CourseDetail } from './pages/course-detail/course-detail';
import { Courses } from './pages/courses/courses';
import { DatasetDetail } from './pages/dataset-detail/dataset-detail';
import { Datasets } from './pages/datasets/datasets';
import { Home } from './pages/home/home';
import { News } from './pages/news/news';
import { NotFound } from './pages/not-found/not-found';
import { Search } from './pages/search/search';
import { Stat1021 } from './pages/stat1021/stat1021';
import { Wanted } from './pages/wanted/wanted';

// Page set and URLs: site-structure spec. URLs end in a slash
// (TrailingSlashPathLocationStrategy). The CloudFront function answers the
// legacy paths with real 301s; the redirect routes below cover client-side
// navigation and a bare origin.
export const routes: Routes = [
  { path: '', component: Home, resolve: { home: r.homeResolver } },
  { path: 'search', component: Search, resolve: { datasets: r.datasetsResolver, index: r.indexResolver } },
  { path: 'datasets', component: Datasets, resolve: { datasets: r.datasetsResolver, index: r.indexResolver } },
  { path: 'datasets/:id', component: DatasetDetail, resolve: { record: r.datasetResolver } },
  { path: 'wanted', component: Wanted, resolve: { wanted: r.wantedResolver } },
  { path: 'courses', component: Courses, resolve: { courses: r.coursesResolver, international: r.internationalResolver } },
  { path: 'courses/:id', component: CourseDetail, resolve: { record: r.courseResolver } },
  { path: 'news', component: News, resolve: { news: r.newsResolver } },
  { path: 'about', component: About, resolve: { index: r.indexResolver } },
  { path: 'stat1021', component: Stat1021 },
  // Legacy URLs of the 2018–2020 site (site-structure spec, "Legacy URLs keep
  // working"), for client-side navigation. /tools goes to GitHub, which only the
  // CloudFront 301 and the fallback page from scripts/build/redirect-pages.mjs can do.
  { path: 'networks', redirectTo: '/datasets' },
  { path: 'refs', redirectTo: '/courses' },
  { path: 'booklet', redirectTo: '/about#booklet' },
  // Prerendered page that CloudFront serves, with status 404, for any missing path.
  { path: '404', component: NotFound },
  // Client-side navigation to an unknown path renders the same page.
  { path: '**', component: NotFound },
];
