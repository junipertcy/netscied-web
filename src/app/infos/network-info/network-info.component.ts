import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-network-info',
  templateUrl: './network-info.component.html',
  styleUrls: ['./network-info.component.css']
})
export class NetworkInfoComponent implements OnInit {
  name: string;
  n_nodes: number;
  n_edges: number;
  desc: string;

  constructor() {
    this.name = 'Social network';
    this.n_nodes = 100;
    this.n_edges = 100;
    this.desc = 'this is a social network';
  }

  ngOnInit() {
  }

}
