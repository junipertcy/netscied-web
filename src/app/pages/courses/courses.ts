import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiRecord } from '../../core/api';
import { Head } from '../../core/head';
import { breadcrumbs } from '../../core/jsonld';
import { SITE } from '../../core/site';

// /courses/ (course-catalog spec, "Course table page" and "Taiwan scope and
// international references").
@Component({
  selector: 'app-courses',
  imports: [RouterLink],
  templateUrl: './courses.html',
  host: { class: 'page' },
})
export class Courses {
  readonly courses = input.required<ApiRecord[]>();
  readonly international = input.required<ApiRecord[]>();
  protected readonly site = SITE;
  private readonly head = inject(Head);

  ngOnInit() {
    this.head.set({
      title: '課程',
      path: '/courses/',
      description: '台灣各大學開設的網絡科學、社會網絡分析、圖論與圖機器學習課程，附最近開課學期與教師。',
      alternates: [
        { type: 'application/json', href: '/api/v1/courses.json', title: 'JSON' },
        { type: 'text/csv', href: '/api/v1/courses.csv', title: 'CSV' },
      ],
      jsonld: [breadcrumbs([{ name: '課程', path: '/courses/' }])],
    });
  }

  protected teachers(c: ApiRecord): string {
    const names = c.latest.instructors.map((i: ApiRecord) => i.name).join('、');
    return names || (c.latest.instructors_unverified ? '待確認' : '未列出');
  }

  protected langs(c: ApiRecord): string {
    const l = c.languages.map((x: ApiRecord) => x['zh-Hant']).join('、');
    return c.languages_unverified ? (l ? `${l}（未確認）` : '未確認') : l;
  }
}
