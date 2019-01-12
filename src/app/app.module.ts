import { BrowserModule, Title } from '@angular/platform-browser';
import { RouterModule, Routes } from '@angular/router';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { NgZorroAntdModule, NZ_I18N, zh_TW } from 'ng-zorro-antd';
import { AppComponent } from './app.component';

import { D3Service, D3_DIRECTIVES } from './d3';

import { GraphComponent } from './visuals/graph/graph.component';
import { SHARED_VISUALS } from './visuals/shared';
import { NetworkInfoComponent } from './infos/network-info/network-info.component';
import { NetworkComponent } from './network/network.component';
import { NetworkLiteracyComponent } from './network-literacy/network-literacy.component';
import { Stat1021Component } from './teaching/stat1021/stat1021.component';

/** icons **/
import { IconDefinition } from '@ant-design/icons-angular';
import { NZ_ICON_DEFAULT_TWOTONE_COLOR, NZ_ICONS } from 'ng-zorro-antd';

import { ShareAltOutline, BookOutline, DownloadOutline } from '@ant-design/icons-angular/icons';

const icons: IconDefinition[] = [ ShareAltOutline, BookOutline, DownloadOutline ];

/** angular i18n **/
// import { registerLocaleData } from '@angular/common';
// import zh from '@angular/common/locales/zh';
// registerLocaleData(zh);

const appRoutes: Routes = [
  { path: '', component: NetworkLiteracyComponent },
  { path: 'network/:id', component: NetworkComponent },
  { path: 'stat1021', component: Stat1021Component, data: { title: 'STAT1021: 資料科學導論' } }
];

@NgModule({
  declarations: [
    AppComponent,
    GraphComponent,
    ...SHARED_VISUALS,
    ...D3_DIRECTIVES,
    NetworkInfoComponent,
    NetworkComponent,
    NetworkLiteracyComponent,
    Stat1021Component

  ],
  imports: [
    RouterModule.forRoot(
      appRoutes,
      {
        enableTracing: true,  // <-- debugging purposes only
        useHash: false}
    ),
    BrowserModule,
    FormsModule,
    HttpClientModule,
    BrowserAnimationsModule,
    NgZorroAntdModule


  ],
  providers: [
    D3Service,
    Title,
    { provide: NZ_I18N, useValue: zh_TW },
    { provide: NZ_ICON_DEFAULT_TWOTONE_COLOR, useValue: '#00ff00' },
    { provide: NZ_ICONS, useValue: icons }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
