import { Component, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NoscriptCatalog } from '../../components/noscript-catalog';
import { SearchForm } from '../../components/search-form';
import { ApiRecord } from '../../core/api';
import { Head } from '../../core/head';
import { SITE, externalCatalogs, requestLinks } from '../../core/site';

type Mode = 'datasets' | 'courses';

// /search/ (site-search spec). The prerendered page is a shell with noindex;
// after hydration it reads ?q= and ?type=, loads the search core and
// /api/v1/catalog.json (only now: the payload budget is for this page), and
// renders the results. Query text is only ever interpolated, never parsed as
// markup, and is URL-encoded wherever it goes into a link.
@Component({
  selector: 'app-search',
  imports: [RouterLink, SearchForm, NoscriptCatalog],
  templateUrl: './search.html',
  host: { class: 'page page-search' },
})
export class Search {
  readonly datasets = input.required<ApiRecord[]>();
  readonly index = input.required<ApiRecord>();
  protected readonly site = SITE;
  protected readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly query = signal('');
  protected readonly mode = signal<Mode>('datasets');
  protected readonly result = signal<any>(null);
  protected readonly facet = signal<string | null>(null);
  protected readonly hits = computed(() => {
    const r = this.result();
    if (!r) return [];
    const f = this.facet();
    return f ? r.hits.filter((h: any) => h.record.domains.includes(f)) : r.hits;
  });
  protected readonly links = computed(() => requestLinks(this.result()?.query.text ?? this.query()));
  protected readonly catalogs = computed(() => externalCatalogs(this.result()?.query.text ?? this.query()));
  protected readonly otherHref = computed(() => this.href(this.query(), this.mode() === 'datasets' ? 'courses' : 'datasets'));
  protected readonly domainLabels = signal<Record<string, string>>({});

  constructor() {
    inject(Head).set({ title: '搜尋結果', robots: 'noindex, follow' });
    afterNextRender(() => this.run());
  }

  protected href(q: string, type: Mode) {
    return `/search/?q=${encodeURIComponent(q)}${type === 'courses' ? '&type=courses' : ''}`;
  }

  private async run() {
    const params = new URLSearchParams(window.location.search);
    this.query.set(params.get('q') ?? '');
    this.mode.set(params.get('type') === 'courses' ? 'courses' : 'datasets');
    this.state.set('loading');
    try {
      const [core, catalog] = await Promise.all([
        import('../../../../search/core'),
        fetch('/api/v1/catalog.json').then((r) => {
          if (!r.ok) throw new Error(`catalog.json: ${r.status}`);
          return r.json();
        }),
      ]);
      this.domainLabels.set(catalog.labels?.domains ?? {});
      this.result.set(core.createSearch(catalog).search(this.query(), this.mode()));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected courseMail(q: string) {
    return `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(`推薦課程：${q}`)}`;
  }

  protected facetEntries(): [string, number][] {
    return Object.entries(this.result()?.facets?.domains ?? {}) as [string, number][];
  }
}
