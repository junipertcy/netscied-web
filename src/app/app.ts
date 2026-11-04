import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly nav = [
    { path: '/', label: '簡介', exact: true },
    { path: '/networks', label: '生活中的網絡', exact: false },
    { path: '/tools', label: '電腦工具', exact: false },
    { path: '/refs', label: '參考資料', exact: false },
    { path: '/booklet', label: '網絡素養小冊', exact: false },
  ];
}
