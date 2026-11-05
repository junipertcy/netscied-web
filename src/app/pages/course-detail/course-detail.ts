import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiRecord } from '../../core/api';
import { zhDate } from '../../core/format';
import { Head } from '../../core/head';
import { breadcrumbs, courseJsonLd } from '../../core/jsonld';

// /courses/<id>/ (course-catalog spec, "Course detail page and freshness").
@Component({
  selector: 'app-course-detail',
  imports: [RouterLink],
  templateUrl: './course-detail.html',
  host: { class: 'page page-detail' },
})
export class CourseDetail {
  readonly record = input.required<ApiRecord>();
  protected readonly c = computed(() => this.record());
  protected readonly zhDate = zhDate;
  private readonly head = inject(Head);

  ngOnInit() {
    const c = this.c();
    const path = `/courses/${c.id}/`;
    this.head.set({
      title: `${c.title['zh-Hant']}（${c.university.short ?? c.university['zh-Hant']}）`,
      path,
      description: c.summary?.['zh-Hant'] ?? c.inclusion_note['zh-Hant'],
      alternates: [
        { type: 'application/json', href: `/api/v1/courses/${c.id}.json`, title: 'JSON' },
        { type: 'text/markdown', href: `${path}index.md`, title: 'Markdown' },
      ],
      jsonld: [courseJsonLd(c), breadcrumbs([{ name: '課程', path: '/courses/' }, { name: c.title['zh-Hant'], path }])],
    });
  }

  protected instructors(o: ApiRecord): string {
    const names = o.instructors.map((i: ApiRecord) => (i.role === 'guest' ? `${i.name}（客座）` : i.name)).join('、');
    return names || (o.unverified?.fields?.includes('instructors') ? '待確認' : '未列出');
  }
}
