import {Component} from '@angular/core';
import APP_CONFIG from '../app.config';
import {Node, Link} from '../d3';


@Component({
  selector: 'app-network-literacy',
  templateUrl: './network-literacy.component.html',
  styleUrls: ['./network-literacy.component.css']
})
export class NetworkLiteracyComponent {
  nodes: Node[] = [];
  links: Link[] = [];

  constructor() {
    const N = APP_CONFIG.N,
      getIndex = number => number - 1;

    /** constructing the nodes array */
    for (let i = 1; i <= N; i++) {
      this.nodes.push(new Node(i));
    }

    for (let i = 1; i <= N; i++) {
      for (let m = 2; i * m <= N; m++) {
        /** increasing connections toll on connecting nodes */
        this.nodes[getIndex(i)].linkCount++;
        this.nodes[getIndex(i * m)].linkCount++;

        /** connecting the nodes before starting the simulation */
        this.links.push(new Link(i, i * m));
      }
    }
  }

  download_nl_en() {
    window.location.href = 'https://sites.google.com/a/binghamton.edu/netscied/Network-Literacy-high-res.pdf';
  }

  download_nl_zh() {
    window.location.href = 'https://wiki.junipertcy.info/images/c/ce/Network_Literacy_tw_Mandarin.pdf';
  }

  download_ce_en() {
    window.location.href = 'https://complexityexplained.github.io/ComplexityExplained.pdf';
  }

  download_ce_zh() {
    window.location.href = 'https://complexityexplained.github.io/ComplexityExplained[Chinese].pdf';
  }


}
