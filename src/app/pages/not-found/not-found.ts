import { Component, DestroyRef, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

// Prerendered at /404/; CloudFront serves it with status 404 for every missing path.
// Phase 1 adds the search form and the /datasets/ and /courses/ links (site-structure spec).
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <h1>找不到這個頁面</h1>
    <p>網址可能有誤，或這個頁面已經移動了。</p>
    <ul>
      <li><a routerLink="/">回首頁</a></li>
      <li><a routerLink="/networks">生活中的網絡（資料）</a></li>
      <li><a routerLink="/refs">參考資料（課程）</a></li>
    </ul>
    <p lang="en">Page not found.</p>
  `,
  host: { class: 'page' },
})
export class NotFound {
  constructor() {
    const meta = inject(Meta);
    meta.updateTag({ name: 'robots', content: 'noindex' });
    inject(DestroyRef).onDestroy(() => meta.removeTag("name='robots'"));
  }
}
