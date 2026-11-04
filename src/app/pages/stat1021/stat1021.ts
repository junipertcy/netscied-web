import { Component } from '@angular/core';

@Component({
  selector: 'app-stat1021',
  templateUrl: './stat1021.html',
  styleUrl: './stat1021.css',
  host: { class: 'page' },
})
export class Stat1021 {
  // TODO(owner): all four files lived on wiki.junipertcy.info, which no longer exists.
  protected readonly urlToProblemSet1 = 'https://wiki.junipertcy.info/images/2/25/Stat1021_2018_hw3.pdf';
  protected readonly urlToProblemSet2 = 'https://wiki.junipertcy.info/images/1/19/Stat1021_2018_hw6.pdf';
  protected readonly urlToInClassSocialNetwork = 'https://wiki.junipertcy.info/images/5/56/In-class_network.txt';
  protected readonly urlToDetailedOutline = 'https://wiki.junipertcy.info/images/4/49/Stat1021_2018_syllabus_special.pdf';
}
