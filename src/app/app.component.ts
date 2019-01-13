import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

export class AppComponent {
  title = 'app';

  btnClick = function () {
    this.router.navigateByUrl('/network/fish');
  };
  gotoJinMa = function() {
    window.location.href = 'https://jinma.today/relations';
  };
  gotoLinkedJazz = function() {
    window.location.href = 'https://linkedjazz.org/network/';
  };
  public setTitle( newTitle: string) {
    this.titleService.setTitle( newTitle );
  }
  getTitleFromRouter = function( router: Router) {
    for (const r of router.config) {
      if ('/' + r.path === router.url) {
        return r.data ? r.data.title : '台灣網絡科學教育';
      }
    }
  }
  constructor(private router: Router, private titleService: Title) {
    router.events.subscribe((event) => {  // fires on every URL change
      console.log(router);
      this.setTitle(this.getTitleFromRouter(router));
    });
  }
}

