import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiRecord } from '../../core/api';
import { Head } from '../../core/head';
import { breadcrumbs } from '../../core/jsonld';
import { SITE, requestLinks } from '../../core/site';
import { BOOKLET, COMPLEXITY_EXPLAINED } from './publications';

// /about/ (site-structure spec, "About page absorbs secondary content"): mission,
// #contribute, #cite, #takedown, #privacy, #disclaimer, #booklet, history,
// maintainer and contact, #machine-access.
@Component({
  selector: 'app-about',
  imports: [RouterLink],
  templateUrl: './about.html',
  host: { class: 'page page-about' },
})
export class About {
  readonly index = input.required<ApiRecord>();
  protected readonly site = SITE;
  protected readonly links = requestLinks('');
  protected readonly booklet = BOOKLET;
  protected readonly complexity = COMPLEXITY_EXPLAINED;
  private readonly head = inject(Head);

  ngOnInit() {
    this.head.set({
      title: '關於本站',
      path: '/about/',
      description: '台灣網絡科學教育的宗旨、提供與徵求資料的方式、引用方式、下架與更正程序、隱私權聲明與免責聲明。',
      jsonld: [breadcrumbs([{ name: '關於本站', path: '/about/' }])],
    });
  }
}
