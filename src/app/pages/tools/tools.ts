import { Component, computed, signal } from '@angular/core';
import { Tool, TOOLS } from './tools-data';

type SortKey = 'name' | 'author' | 'lang' | 'updatedTime' | 'category' | 'license';

@Component({
  selector: 'app-tools',
  templateUrl: './tools.html',
  styleUrl: './tools.css',
  host: { class: 'page' },
})
export class Tools {
  // The old table's columns (簡介 is shown under each row instead of behind an expander).
  protected readonly columns: { key: SortKey; label: string }[] = [
    { key: 'name', label: '名稱' },
    { key: 'author', label: '主要作者' },
    { key: 'lang', label: '語言' },
    { key: 'updatedTime', label: '更新時間' },
    { key: 'category', label: '類別' },
    { key: 'license', label: '授權' },
  ];

  protected readonly sortKey = signal<SortKey | null>(null);
  protected readonly ascending = signal(true);

  protected readonly rows = computed<Tool[]>(() => {
    const key = this.sortKey();
    if (!key) {
      return TOOLS;
    }
    const dir = this.ascending() ? 1 : -1;
    return [...TOOLS].sort((a, b) => dir * a[key].localeCompare(b[key], 'zh-Hant-TW'));
  });

  protected sortBy(key: SortKey): void {
    if (this.sortKey() === key) {
      this.ascending.update(v => !v);
    } else {
      this.sortKey.set(key);
      this.ascending.set(true);
    }
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) {
      return 'none';
    }
    return this.ascending() ? 'ascending' : 'descending';
  }
}
