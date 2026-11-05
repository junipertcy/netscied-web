import { Component, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiRecord } from '../../core/api';
import { Head } from '../../core/head';
import { breadcrumbs, dataCatalogJsonLd } from '../../core/jsonld';

type SortKey = 'version' | 'name' | 'size';
const collator = new Intl.Collator('zh-Hant-TW');

// /datasets/ (dataset-catalog spec, "Dataset table page"). The full table is in
// the prerendered HTML; sort buttons appear only once the page is interactive.
@Component({
  selector: 'app-datasets',
  imports: [RouterLink],
  templateUrl: './datasets.html',
  host: { class: 'page' },
})
export class Datasets {
  readonly datasets = input.required<ApiRecord[]>();
  readonly index = input.required<ApiRecord>();
  protected readonly interactive = signal(false);
  protected readonly sort = signal<{ key: SortKey; dir: 1 | -1 }>({ key: 'version', dir: -1 });
  protected readonly rows = computed(() => {
    const { key, dir } = this.sort();
    const list = [...this.datasets()];
    if (key === 'version') return dir === -1 ? list : list.reverse();
    const cmp =
      key === 'name'
        ? (a: ApiRecord, b: ApiRecord) => collator.compare(a.title['zh-Hant'], b.title['zh-Hant'])
        : (a: ApiRecord, b: ApiRecord) => (a.size?.edges ?? a.size?.hyperedges ?? -1) - (b.size?.edges ?? b.size?.hyperedges ?? -1);
    return list.sort((a, b) => dir * cmp(a, b));
  });

  private readonly head = inject(Head);

  constructor() {
    afterNextRender(() => this.interactive.set(true));
  }

  ngOnInit() {
    this.head.set({
      title: '資料集',
      path: '/datasets/',
      description: '本站收錄的台灣網絡資料集：圖、超圖、排名與成對比較等關聯資料，附授權、規模與下載方式。',
      alternates: [
        { type: 'application/json', href: '/api/v1/datasets.json', title: 'JSON' },
        { type: 'text/csv', href: '/api/v1/datasets.csv', title: 'CSV' },
      ],
      jsonld: [dataCatalogJsonLd(this.datasets()), breadcrumbs([{ name: '資料集', path: '/datasets/' }])],
    });
  }

  protected sortBy(key: SortKey) {
    const cur = this.sort();
    this.sort.set({ key, dir: cur.key === key ? ((-cur.dir) as 1 | -1) : key === 'name' ? 1 : -1 });
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | null {
    if (!this.interactive() || this.sort().key !== key) return null;
    return this.sort().dir === 1 ? 'ascending' : 'descending';
  }
}
