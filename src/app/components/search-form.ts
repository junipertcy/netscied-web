// The one search form (site-search spec, "One search form with a 資料/課程 toggle").
// A native GET form to /search/, so it works without JavaScript and every search
// has a URL. It never submits on Enter while an input method is composing
// (注音, 倉頡 ...): browsers already suppress that, and the keydown guard covers
// older engines that report the confirming Enter as keyCode 229.
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-search-form',
  template: `
    <search class="search-form" [class.compact]="compact()">
      <form action="/search/" method="get" (keydown)="guardIme($event)">
        <label class="search-label" [attr.for]="inputId()">{{ label() }}</label>
        <div class="search-row">
          <input
            [id]="inputId()"
            name="q"
            type="search"
            enterkeyhint="search"
            lang="zh-Hant-TW"
            autocomplete="off"
            spellcheck="false"
            [value]="q()"
            [attr.placeholder]="compact() ? null : '例如：捷運、超圖、金馬獎、社會網絡分析'"
          />
          <button type="submit">搜尋</button>
        </div>
        <fieldset class="search-toggle">
          <legend class="visually-hidden">搜尋範圍</legend>
          <label><input type="radio" name="type" value="datasets" [checked]="type() !== 'courses'" /> 資料</label>
          <label><input type="radio" name="type" value="courses" [checked]="type() === 'courses'" /> 課程</label>
        </fieldset>
      </form>
    </search>
  `,
})
export class SearchForm {
  readonly compact = input(false);
  readonly inputId = input('q');
  readonly label = input('搜尋台灣的網絡資料與課程');
  readonly q = input('');
  readonly type = input<string>('datasets');

  protected guardIme(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
  }
}
