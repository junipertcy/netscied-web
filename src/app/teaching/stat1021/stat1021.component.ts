import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-network',
  templateUrl: './stat1021.component.html',
  styleUrls: ['./stat1021.component.css']
})
export class Stat1021Component implements OnInit {

  urlToProblemSet1: string;
  urlToProblemSet2: string;
  urlToInClassSocialNetwork: string;
  urlToDetailedOutline: string;

  constructor() {
    this.urlToProblemSet1 = 'http://wiki.junipertcy.info/images/e/ec/Stat1021_2018_hw5.pdf';
    this.urlToProblemSet2 = 'http://wiki.junipertcy.info/images/1/19/Stat1021_2018_hw6.pdf';
    this.urlToInClassSocialNetwork = '';
    this.urlToDetailedOutline = 'http://wiki.junipertcy.info/images/4/49/Stat1021_2018_syllabus_special.pdf';

  }
  ngOnInit() {
  }




}
