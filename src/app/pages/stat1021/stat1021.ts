import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Head } from '../../core/head';
import { breadcrumbs } from '../../core/jsonld';

// The 2018 NCKU guest-lecture page, kept as an archive with all its links
// (site-structure spec, "Archived course page"; owner decision 2026-11-04).
@Component({
  selector: 'app-stat1021',
  imports: [RouterLink],
  templateUrl: './stat1021.html',
  host: { class: 'page page-stat1021' },
})
export class Stat1021 {
  // These files lived on wiki.junipertcy.info, which no longer exists.
  protected readonly urlToProblemSet1 = 'https://wiki.junipertcy.info/images/2/25/Stat1021_2018_hw3.pdf';
  protected readonly urlToProblemSet2 = 'https://wiki.junipertcy.info/images/1/19/Stat1021_2018_hw6.pdf';
  protected readonly urlToInClassSocialNetwork = 'https://wiki.junipertcy.info/images/5/56/In-class_network.txt';
  protected readonly urlToDetailedOutline = 'https://wiki.junipertcy.info/images/4/49/Stat1021_2018_syllabus_special.pdf';

  constructor() {
    inject(Head).set({
      title: 'STAT1021：資料科學導論（2018 年課程封存頁）',
      path: '/stat1021/',
      description: '2018 年春季成功大學統計系《資料科學導論》的兩次網絡科學客座講授，課程封存頁。',
      jsonld: [breadcrumbs([{ name: '課程', path: '/courses/' }, { name: 'STAT1021 封存頁', path: '/stat1021/' }])],
    });
  }
}
