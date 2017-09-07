import { BrowserModule } from '@angular/platform-browser';
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

const appRoutes: Routes = [
  { path: '', component: NetworkLiteracyComponent },
  { path: 'network/:id', component: NetworkComponent }
];


@NgModule({
  declarations: [
    AppComponent,
    GraphComponent,
    ...SHARED_VISUALS,
    ...D3_DIRECTIVES,
    NetworkInfoComponent,
    NetworkComponent,
    NetworkLiteracyComponent


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
  providers: [D3Service],
  bootstrap: [AppComponent]
})
export class AppModule { }
