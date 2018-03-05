import { BrowserModule, Title } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';
import { NgZorroAntdModule } from 'ng-zorro-antd';

import { RouterModule, Routes } from '@angular/router';

import { D3Service, D3_DIRECTIVES } from './d3';

import { AppComponent } from './app.component';

import { GraphComponent } from './visuals/graph/graph.component';
import { SHARED_VISUALS } from './visuals/shared';
import { NetworkInfoComponent } from './infos/network-info/network-info.component';
import { NetworkComponent } from './network/network.component';
import { NetworkLiteracyComponent } from './network-literacy/network-literacy.component';
import { Stat1021Component } from './teaching/stat1021/stat1021.component';

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
    HttpModule,
    BrowserAnimationsModule,
    NgZorroAntdModule.forRoot()


  ],
  providers: [
    D3Service,
    Title
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
