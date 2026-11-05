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

  constructor() {
    const router = inject(Router);
    router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) this.isHome.set(e.urlAfterRedirects.split(/[?#]/)[0].replace(/\/+$/, '') === '');
    });
  }
}
