import { Component, OnInit } from '@angular/core';
import APP_CONFIG from '../app.config';
import { Node, Link } from '../d3';

@Component({
  selector: 'app-refs',
  templateUrl: './refs.component.html',
  styleUrls: ['./refs.component.css']
})
export class RefsComponent implements OnInit {

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

  dataSet = [
    {
      key: '1',
      name: 'Graph-tool',
      author: 'Tiago P. Peixoto',
      lang: 'Python & C++',
      desc: 'Graph-tool 是 Python 的套件，用來處理網絡數據或是網絡的視覺化，尤其是統計分析。和其他 Python 裡的套件不一樣的地方是，它的數據結構和演算法是以 C++ 寫成，並且進行了優化。這使得它的效率媲美純粹用 C++  寫成的程式。',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'GNU GPL v3'
    },
    {
      key: '2',
      name: 'NetSciDraw',
      author: 'Matt Dabrowski 等人',
      lang: 'JavaScript',
      desc: 'NetSciDraw 是一個學習工具，它可以用來畫一個網絡。例如：家譜、水循環的過程、書中各章節的關聯性，甚至是畫出複雜政治角力的現狀 (status quo) 等。畫好的網絡還可以分享連接給別人閱讀。',
      updatedTime: '2019',
      category: '網頁 app：視覺化',
      license: '未知'
    },
    {
      key: '3',
      name: 'Gephi',
      author: 'Mathieu Bastian 等人',
      lang: 'Java',
      desc: '',
      updatedTime: '2017',
      category: '獨立程式: 萬用工具',
      license: 'CDDL + GNU GPL v3'
    },
    {
      key: '4',
      name: 'webweb',
      author: 'Daniel B. Larremore 等人',
      lang: 'JavaScript, MATLAB, & Python',
      desc: '',
      updatedTime: '2019',
      category: '視覺化',
      license: '未知'
    },
    {
      key: '5',
      name: 'igraph',
      author: 'Gábor Csárdi 等人',
      lang: 'Python, C++, R, & Mathematica',
      desc: '',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'GNU GPL v2'
    },
    {
      key: '6',
      name: 'MuxViz',
      author: 'Manlio De Domenico',
      lang: 'R',
      desc: '',
      updatedTime: '2014',
      category: '獨立程式: 萬用工具',
      license: 'GNU GPL v3'
    },
    {
      key: '7',
      name: 'NetworkX',
      author: 'Aric Hagberg 等人',
      lang: 'Python & C++',
      desc: '',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'BSD 3-Clause'
    }
  ];

  ngOnInit() {
  }

}
