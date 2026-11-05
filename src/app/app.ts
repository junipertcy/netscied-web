import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SearchForm } from './components/search-form';
import { SITE } from './core/site';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, SearchForm],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  protected readonly site = SITE;
  protected readonly nav = [
    { path: '/datasets', label: '資料集' },
    { path: '/courses', label: '課程' },
    { path: '/news', label: '消息' },
    { path: '/about', label: '關於' },
  ];
  /** The home page has its own large search form; every other page gets one in the header. */
  protected readonly isHome = signal(true);
  /**
   * The skip link names the current page: with <base href="/">, a bare "#main"
   * would resolve to the home page (final review W1).
   */
  protected readonly skipHref = signal('/#main');

  constructor() {
    const router = inject(Router);
    router.events.subscribe((e) => {
      if (!(e instanceof NavigationEnd)) return;
      const [beforeHash] = e.urlAfterRedirects.split('#');
      const [rawPath, query] = beforeHash.split('?');
      const path = rawPath.replace(/\/+$/, '');
      this.isHome.set(path === '');
      // Keep the query, or the skip link on /search/?q=… would load a new, empty search.
      this.skipHref.set(`${path}/${query ? `?${query}` : ''}#main`);
    });
  }
}
