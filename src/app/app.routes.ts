import { Routes } from '@angular/router';
import { Booklet } from './pages/booklet/booklet';
import { Home } from './pages/home/home';
import { Networks } from './pages/networks/networks';
import { NotFound } from './pages/not-found/not-found';
import { Refs } from './pages/refs/refs';
import { Stat1021 } from './pages/stat1021/stat1021';
import { Tools } from './pages/tools/tools';

// Paths are the old site's, unchanged, so every existing link to netscied.tw keeps working.
const SITE = '台灣網絡科學教育';

export const routes: Routes = [
  { path: '', component: Home, title: `${SITE} - NetSciEd` },
  { path: 'networks', component: Networks, title: `生活中的網絡 - ${SITE}` },
  { path: 'tools', component: Tools, title: `電腦工具 - ${SITE}` },
  { path: 'refs', component: Refs, title: `參考資料 - ${SITE}` },
  { path: 'booklet', component: Booklet, title: `網絡素養小冊 - ${SITE}` },
  { path: 'stat1021', component: Stat1021, title: 'STAT1021: 資料科學導論' },
  { path: '**', component: NotFound, title: SITE },
];
