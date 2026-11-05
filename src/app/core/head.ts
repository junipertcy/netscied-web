// Per-page <head>: title, description, canonical URL, robots, machine-readable
// alternates and JSON-LD. Elements this service adds carry data-page="1" and
// are replaced on every page, so client-side navigation never leaves stale tags.
import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { SITE } from './site';

export interface PageHead {
  title: string;
  description?: string;
  /** Site path with trailing slash, e.g. /datasets/; omitted for noindex pages. */
  path?: string;
  noindex?: boolean;
  /** Extra robots directives, e.g. 'noindex, follow'. */
  robots?: string;
  alternates?: { type: string; href: string; title?: string }[];
  jsonld?: object[];
  /** A site path to send the visitor to (renamed records): a meta refresh plus canonical. */
  refreshTo?: string;
}

@Injectable({ providedIn: 'root' })
export class Head {
  private readonly doc = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);

  set(page: PageHead) {
    this.titleService.setTitle(page.title === SITE.name ? `${SITE.name} - NetSciEd` : `${page.title} - ${SITE.name}`);
    if (page.description) {
      this.meta.updateTag({ name: 'description', content: page.description });
      this.meta.updateTag({ property: 'og:description', content: page.description });
    }
    this.meta.updateTag({ property: 'og:title', content: page.title });
    const robots = page.robots ?? (page.noindex ? 'noindex' : null);
    if (robots) this.meta.updateTag({ name: 'robots', content: robots });
    else this.meta.removeTag("name='robots'");

    const head = this.doc.head;
    head.querySelectorAll('[data-page]').forEach((el) => el.remove());
    if (page.path) {
      const url = SITE.origin + page.path;
      this.link({ rel: 'canonical', href: url });
      this.meta.updateTag({ property: 'og:url', content: url });
    }
    if (page.refreshTo) {
      const meta = this.doc.createElement('meta');
      meta.setAttribute('http-equiv', 'refresh');
      meta.setAttribute('content', `0; url=${page.refreshTo}`);
      meta.setAttribute('data-page', '1');
      head.appendChild(meta);
      this.link({ rel: 'canonical', href: SITE.origin + page.refreshTo });
    }
    for (const a of page.alternates ?? []) this.link({ rel: 'alternate', type: a.type, href: a.href, ...(a.title ? { title: a.title } : {}) });
    for (const data of page.jsonld ?? []) {
      const script = this.doc.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('data-page', '1');
      // JSON in a script element: escape "<" so no value can close the element.
      script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
      head.appendChild(script);
    }
  }

  private link(attrs: Record<string, string>) {
    const el = this.doc.createElement('link');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.setAttribute('data-page', '1');
    this.doc.head.appendChild(el);
  }
}
