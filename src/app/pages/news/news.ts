import { Component, inject, input } from '@angular/core';
import { ApiRecord } from '../../core/api';
import { zhDate } from '../../core/format';
import { Head } from '../../core/head';
import { breadcrumbs } from '../../core/jsonld';

// /news/ (site-structure spec, "News"): every item newest first, each with a
// permanent anchor <YYYY-MM-DD>-<slug>.
@Component({
  selector: 'app-news',
  templateUrl: './news.html',
  host: { class: 'page' },
})
export class News {
  readonly news = input.required<ApiRecord[]>();
  protected readonly zhDate = zhDate;
  private readonly head = inject(Head);

  ngOnInit() {
    this.head.set({
      title: '消息',
      path: '/news/',
      description: '台灣網絡科學教育的最新消息：新收錄的資料集、課程與網站更新。',
      alternates: [{ type: 'application/json', href: '/api/v1/news.json', title: 'JSON' }],
      jsonld: [breadcrumbs([{ name: '消息', path: '/news/' }])],
    });
  }
}
