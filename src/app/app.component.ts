import { Component } from '@angular/core';
import { Router } from '@angular/router';

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
  gotoJinMa() {
    window.location.href = 'https://jinma.today/relations';
  }
  constructor(private router: Router) {
  }

}

