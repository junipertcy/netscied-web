import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiRecord } from '../../core/api';
import { Head } from '../../core/head';
import { breadcrumbs } from '../../core/jsonld';
import { requestLinks } from '../../core/site';

// /wanted/ (dataset-catalog spec, "Wanted-data list"): every wanted record, with
// a permanent anchor; published ones stay as 已收錄 rows. No Dataset markup.
@Component({
  selector: 'app-wanted',
  imports: [RouterLink],
  templateUrl: './wanted.html',
  host: { class: 'page' },
})
export class Wanted {
  readonly wanted = input.required<ApiRecord[]>();
  protected readonly links = requestLinks;
  private readonly head = inject(Head);

  ngOnInit() {
    this.head.set({
      title: '資料許願池',
      path: '/wanted/',
      description: '大家想要、但本站還沒有的台灣網絡資料。你的需求會成為本站整理資料的優先順序。',
      alternates: [{ type: 'application/json', href: '/api/v1/wanted.json', title: 'JSON' }],
      jsonld: [breadcrumbs([{ name: '資料許願池', path: '/wanted/' }])],
    });
  }
}
