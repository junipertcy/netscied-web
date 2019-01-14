import { Component, OnInit } from '@angular/core';
import APP_CONFIG from '../app.config';
import { Node, Link } from '../d3';

@Component({
  selector: 'app-news',
  templateUrl: './news.component.html',
  styleUrls: ['./news.component.css']
})
export class NewsComponent implements OnInit {

  nodes: Node[] = [];
  links: Link[] = [];

  constructor() {
    const N = APP_CONFIG.ZKC_NETWORK.N,
          getIndex = number => number - 1;

    /** constructing the nodes array */
    for (let i = 1; i <= N; i++) {
      this.nodes.push(new Node(i));
    }

    console.log(getIndex);
    console.log(N);

    const that = this;
    APP_CONFIG.ZKC_NETWORK.EDGELIST.forEach(function (e) {
      that.nodes[getIndex(e[0])].linkCount++;
      that.nodes[getIndex(e[1])].linkCount++;
      that.links.push(new Link(e[0], e[1]));
    });


    console.log(this.nodes);
    console.log(this.links);

  }

  ngOnInit() {
  }

}
