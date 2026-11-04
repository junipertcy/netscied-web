import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

// TODO(owner): no 404 page existed before (every URL served the home page); this one has no prose yet.
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `<h1>404</h1><p><a routerLink="/">台灣網絡科學教育</a></p>`,
  host: { class: 'page' },
})
export class NotFound {}
