import { Component } from '@angular/core';
import APP_CONFIG from '../app.config';
import { Node, Link } from '../d3';

@Component({
  selector: 'app-refs',
  templateUrl: './refs.component.html',
  styleUrls: ['./refs.component.css']
})
export class RefsComponent {

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
      name: 'Graph-tool',
      author: 'Tiago P. Peixoto',
      lang: 'Python & C++',
      desc: 'Graph-tool 是 Python 的套件，用來處理網絡數據或是網絡的視覺化，尤其是統計分析。和其他 Python 裡的套件不一樣的地方是，它的數據結構和演算法是以 C++ 寫成，並且進行了最佳化。這使得它的效率媲美純粹用 C++ 寫成的程式。',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'GNU GPL v3'
    },
    {
      name: 'NetSciDraw',
      author: 'Matt Dabrowski 等人',
      lang: 'JavaScript',
      desc: 'NetSciDraw 是一個學習工具，它可以用來畫一個網絡。例如：家譜、水循環的過程、書中各章節的關聯性，甚至是畫出複雜政治角力的現狀 (status quo) 等。畫好的網絡可以以連接方式，分享給別人閱讀。',
      updatedTime: '2019',
      category: '網頁 app：視覺化',
      license: '未知'
    },
    {
      name: 'Gephi',
      author: 'Mathieu Bastian 等人',
      lang: 'Java',
      desc: 'Gephi 是一個可以安裝在 Win/Mac/Linux 的獨立程式。它可以用來探索網絡的結構和視覺化，並能分析如中心度等網絡的度量。',
      updatedTime: '2017',
      category: '獨立程式: 萬用工具',
      license: 'CDDL + GNU GPL v3'
    },
    {
      name: 'webweb',
      author: 'Daniel B. Larremore 等人',
      lang: 'JavaScript, MATLAB, & Python',
      desc: 'webweb 幫助用戶在瀏覽器上，藉由 D3.js 視覺化 MATLAB 生成的網絡數據。這方便網絡科學家分享數據。',
      updatedTime: '2019',
      category: '視覺化',
      license: '未知'
    },
    {
      name: 'igraph',
      author: 'Gábor Csárdi 等人',
      lang: 'Python, C++, R, & Mathematica',
      desc: 'igraph 是 Python 的套件，用來處理網絡數據或是網絡的視覺化，且大部分底層的程式碼也由 C++ 寫成。',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'GNU GPL v2'
    },
    {
      name: 'MuxViz',
      author: 'Manlio De Domenico',
      lang: 'R & GNU Octave',
      desc: 'MuxViz 是分析多層網絡的平台，它也可以視覺化多層網絡 [指網絡中的節點同時呈現不同性質，如路網中的台北車站，其實是台鐵、捷運和高鐵三鐵共構]。',
      updatedTime: '2014',
      category: '獨立程式: 萬用工具',
      license: 'GNU GPL v3'
    },
    {
      name: 'Pymnet',
      author: 'Mikko Kivelä',
      lang: 'Python',
      desc: 'Pymnet 是分析多層網絡的平台，它也可以視覺化多層網絡 [指網絡中的節點同時呈現不同性質，如路網中的台北車站，其實是台鐵、捷運和高鐵三鐵共構]。',
      updatedTime: '2018',
      category: '函式庫: 萬用工具',
      license: 'GNU GPL v3'
    },
    {
      name: 'NetworkX',
      author: 'Aric Hagberg 等人',
      lang: 'Python',
      desc: 'NetworkX 是 Python 的套件，用來處理網絡數據或是網絡的視覺化。因為大部分的程式碼由 Python 寫成，它沒有 igraph 或 Graph-tool 的效率，但它卻是三者之中最方便安裝且更新最頻繁的，容易找到最新的工具。',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'BSD 3-Clause'
    }
  ];
  //
  sortMap = {
    name: null,
    author: null,
    lang: null,
    updatedTime: null,
    category: null,
    license: null
  };
  sortName = null;
  sortValue = null;
  displayData = [ ...this.dataSet ];

  searchNameList = [];
  searchAddressList = [];

  sort(sortName: string, value: string): void {
    this.sortName = sortName;
    this.sortValue = value;
    for (const key in this.sortMap) {
      this.sortMap[ key ] = (key === sortName ? value : null);
    }
    this.search(this.searchNameList, this.searchAddressList);
  }

  search(searchNameList: string[], searchAddressList: string[]): void {
    this.searchNameList = searchNameList;
    this.searchAddressList = searchAddressList;
    const filterFunc = item => (this.searchAddressList.length ? this.searchAddressList.some(address => item.address.indexOf(address) !== -1) : true) && (this.searchNameList.length ? this.searchNameList.some(name => item.name.indexOf(name) !== -1) : true);
    const data = this.dataSet.filter(item => filterFunc(item));
    if (this.sortName && this.sortValue) {
      this.displayData = data.sort((a, b) => (this.sortValue === 'ascend') ? (a[ this.sortName ] > b[ this.sortName ] ? 1 : -1) : (b[ this.sortName ] > a[ this.sortName ] ? 1 : -1));
    } else {
      this.displayData = data;
    }
  }


}
