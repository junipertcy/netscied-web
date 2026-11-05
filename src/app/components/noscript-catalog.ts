import { Component, input } from '@angular/core';
import { ApiRecord } from '../core/api';

// The /search/ fallback without JavaScript (site-search spec, "Search page
// without JavaScript"). With scripting on, browsers parse <noscript> content as
// text, so the host carries ngSkipHydration (set where it is used).
@Component({
  selector: 'app-noscript-catalog',
  template: `
    <noscript>
      <div class="notice">
        <p>搜尋結果需要啟用 JavaScript。你也可以直接瀏覽：<a href="/datasets/">資料集</a> · <a href="/courses/">課程</a> · <a href="/wanted/">資料許願池</a> · <a href="/api/v1/datasets.json">JSON 目錄</a></p>
        @if (datasets().length < 50) {
          <p>本站收錄的資料集：</p>
          <ul>
            @for (d of datasets(); track d.id) {<li><a [href]="'/datasets/' + d.id + '/'">{{ d.title['zh-Hant'] }}</a></li>}
          </ul>
        }
      </div>
    </noscript>
  `,
})
export class NoscriptCatalog {
  readonly datasets = input.required<ApiRecord[]>();
}
