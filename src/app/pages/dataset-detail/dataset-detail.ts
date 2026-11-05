import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiRecord } from '../../core/api';
import { bytes, number, shortSha, zhDate } from '../../core/format';
import { Head } from '../../core/head';
import { breadcrumbs, datasetJsonLd } from '../../core/jsonld';
import { SITE } from '../../core/site';

// /datasets/<id>/ (dataset-catalog spec, "Dataset detail page"), in the spec's
// section order. Every fact comes from the same record as
// /api/v1/datasets/<id>.json. Withdrawn records render a tombstone; a renamed id
// renders a redirect to the current page.
@Component({
  selector: 'app-dataset-detail',
  imports: [RouterLink],
  templateUrl: './dataset-detail.html',
  host: { class: 'page page-detail' },
})
export class DatasetDetail {
  readonly record = input.required<ApiRecord>();
  protected readonly d = computed(() => this.record());
  protected readonly paragraphs = computed(() => (this.d().description?.['zh-Hant'] ?? '').split(/\n{2,}/));
  protected readonly bytes = bytes;
  protected readonly number = number;
  protected readonly shortSha = shortSha;
  protected readonly zhDate = zhDate;
  protected readonly site = SITE;
  private readonly head = inject(Head);

  ngOnInit() {
    const d = this.d();
    const path = `/datasets/${d.id}/`;
    if (d.status === 'renamed') {
      const to = `/datasets/${d.current_id}/`;
      this.head.set({ title: '此資料集已更名', robots: 'noindex, follow', refreshTo: to });
      return;
    }
    const crumbs = breadcrumbs([
      { name: '資料集', path: '/datasets/' },
      { name: d.title['zh-Hant'], path },
    ]);
    const alternates = [
      { type: 'application/json', href: `/api/v1/datasets/${d.id}.json`, title: 'JSON' },
      ...(d.status === 'published' ? [{ type: 'text/markdown', href: `${path}index.md`, title: 'Markdown' }] : []),
    ];
    if (d.status === 'withdrawn') {
      this.head.set({ title: `${d.title['zh-Hant']}（已下架）`, path, alternates, jsonld: [crumbs] });
      return;
    }
    this.head.set({
      title: d.title['zh-Hant'],
      path,
      description: d.summary?.['zh-Hant'],
      alternates,
      jsonld: [datasetJsonLd(d), crumbs],
    });
  }

  protected creators() {
    return (this.d().creators ?? []).filter((c: ApiRecord) => !(this.d().redistribution.basis === 'own-work' && /netscied/.test(c.url ?? '')));
  }
}
