import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SearchForm } from '../../components/search-form';
import { Head } from '../../core/head';

// Prerendered at /404/; CloudFront serves it with status 404 for every missing
// path (site-structure spec, "Real not-found responses").
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, SearchForm],
  template: `
    <h1>找不到這個頁面</h1>
    <p>網址可能有誤，或這個頁面已經移動了。可以搜尋看看，或從資料集與課程開始找：</p>
    <app-search-form inputId="notfound-q" />
    <ul>
      <li><a routerLink="/datasets">資料集</a></li>
      <li><a routerLink="/courses">課程</a></li>
      <li><a routerLink="/">回首頁</a></li>
    </ul>
    <p lang="en">Page not found.</p>
  `,
  host: { class: 'page' },
})
export class NotFound {
  constructor() {
    inject(Head).set({ title: '找不到頁面', noindex: true });
  }
}
