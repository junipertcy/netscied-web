import { BrowserModule, Title } from '@angular/platform-browser';
import { RouterModule, Routes } from '@angular/router';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { NZ_I18N, zh_TW } from 'ng-zorro-antd/i18n';
import { AppComponent } from './app.component';

import { D3Service, D3_DIRECTIVES } from './d3';

/** icons **/
import { IconDefinition } from '@ant-design/icons-angular';
import { NZ_ICON_DEFAULT_TWOTONE_COLOR, NZ_ICONS } from 'ng-zorro-antd/icon';
import {
  ShareAltOutline,
  BookOutline,
  DownloadOutline,
  ReadOutline,
  LaptopOutline
} from '@ant-design/icons-angular/icons';

import { NgZorroAntdModule } from './ng-zorro-antd.module';
import { GraphComponent } from './visuals/graph/graph.component';
import { SHARED_VISUALS } from './visuals/shared';
import { NetworkInfoComponent } from './infos/network-info/network-info.component';
import { NetworkLiteracyComponent } from './network-literacy/network-literacy.component';
import { Stat1021Component } from './teaching/stat1021/stat1021.component';
import { NetworkCommunitiesAndHierarchiesComponent } from './teaching/network-communities-and-hierarchies/network-communities-and-hierarchies.component';

import { NewsComponent } from './news/news.component';
import { RefsComponent } from './refs/refs.component';
import { NetworksComponent } from './networks/networks.component';
import { Str2urlPipe } from './str2url.pipe';
import { ToolsComponent } from './tools/tools.component';


const icons: IconDefinition[] = [ ShareAltOutline, BookOutline, DownloadOutline, ReadOutline, LaptopOutline ];

/** angular i18n **/
// import { registerLocaleData } from '@angular/common';
// import zh from '@angular/common/locales/zh';
// registerLocaleData(zh);

const appRoutes: Routes = [
  { path: '', component: NewsComponent },
  { path: 'refs', component: RefsComponent },
  { path: 'tools', component: ToolsComponent },
  { path: 'networks', component: NetworksComponent },
  { path: 'booklet', component: NetworkLiteracyComponent },
  { path: 'stat1021', component: Stat1021Component, data: { title: 'STAT1021: 資料科學導論' } },
  // { path: 'network-communities-and-hierarchies', component: NetworkCommunitiesAndHierarchiesComponent, data: { title: '數據裡的結構：隱藏的社群和階層' } }
];

@NgModule({
  declarations: [
    AppComponent,
    GraphComponent,
    ...SHARED_VISUALS,
    ...D3_DIRECTIVES,
    NetworkInfoComponent,
    NetworkLiteracyComponent,
    Stat1021Component,
    NewsComponent,
    RefsComponent,
    NetworksComponent,
    Str2urlPipe,
    ToolsComponent,
    NetworkCommunitiesAndHierarchiesComponent
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
  bootstrap: [AppComponent],
  exports: []
})
export class AppModule { }
