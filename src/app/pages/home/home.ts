import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SearchForm } from '../../components/search-form';
import { ApiRecord } from '../../core/api';
import { zhDate } from '../../core/format';
import { Head } from '../../core/head';
import { SITE } from '../../core/site';

// Home (site-structure spec, "Minimal home page"): the search form, an honest
// count line, up to five example queries that the build checked return results,
// and the three newest news items.
@Component({
  selector: 'app-home',
  imports: [RouterLink, SearchForm],
  templateUrl: './home.html',
  host: { class: 'page page-home' },
})
export class Home {
  readonly home = input.required<ApiRecord>();
  protected readonly counts = computed(() => this.home().counts);
  protected readonly zhDate = zhDate;

  constructor() {
    inject(Head).set({
      title: SITE.name,
      path: '/',
      description: '搜尋和台灣有關的網絡資料集（圖、超圖、排名等關聯資料），以及台灣各大學的網絡科學、社會網絡分析與圖論課程。',
      alternates: [{ type: 'application/json', href: '/api/v1/index.json', title: 'JSON API' }],
      jsonld: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: SITE.name,
          alternateName: ['NetSciEd', SITE.nameEn],
          url: `${SITE.origin}/`,
          inLanguage: 'zh-Hant-TW',
          potentialAction: { '@type': 'SearchAction', target: `${SITE.origin}/search/?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
        },
      ],
    });
  }
}
