import {Component} from '@angular/core';
import APP_CONFIG from '../app.config';
import {Node, Link} from '../d3';


@Component({
  selector: 'app-tools',
  templateUrl: './tools.component.html',
  styleUrls: ['./tools.component.css']
})

export class ToolsComponent {

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
      desc: 'Graph-tool 是 Python 的套件，用來處理網絡數據或是網絡的視覺化，尤其是統計分析。' +
        '和其他 Python 裡的套件不一樣的地方是，它的數據結構和演算法是以 C++ 寫成，並且進行了最佳化。' +
        '這使得它的效率媲美純粹用 C++ 寫成的程式。',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'GNU GPL v3'
    },
    {
      name: 'NetSciDraw',
      author: 'Matt Dabrowski 等人',
      lang: 'JavaScript',
      desc: 'NetSciDraw 是一個學習工具，它可以用來畫一個網絡。例如：家譜、水循環的過程、書中各章節的關聯性，' +
        '甚至是畫出複雜政治角力的現狀 (status quo) 等。畫好的網絡可以以連接方式，分享給別人閱讀。',
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
      desc: 'webweb 幫助用戶在瀏覽器上，藉由 D3.js 視覺化 MATLAB（或一般 Python 的數據結構）生成的網絡數據。' +
        '它可以作為教學使用，也可以將圖以 svg 匯出，方便網絡科學家分享數據。',
      updatedTime: '2019',
      category: '函式庫: 視覺化',
      license: 'GNU GPL v3'
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
      desc: 'MuxViz 是分析多層網絡的平台，它也可以視覺化多層網絡 [指網絡中的節點同時呈現不同性質，' +
        '如路網中的台北車站，其實是台鐵、捷運和高鐵三鐵共構]。',
      updatedTime: '2014',
      category: '獨立程式: 萬用工具',
      license: 'GNU GPL v3'
    },
    {
      name: 'Infomap',
      author: 'Martin Rosvall 等人',
      lang: 'C++',
      desc: 'Infomap 是基於 map equation 的發現網絡社群結構的函式庫。除了主要的程式外，' +
        '還包含了判定社群顯著性的 "significance-clustering" 以及能在數億級大小的網絡上平行運算的 "GossipMap" 等輔助程式。',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'GNU AGPL v3'
    },
    {
      name: 'pathpy',
      author: 'Ingo Scholtes',
      lang: 'Python',
      desc: 'pathpy 是分析能時間解析的網絡的工具，即網絡的每個邊都帶有時間戳。在我們有生成該網絡的時間序列模型的前提下，' +
        '它能分析這種網絡的結構或是數據在時序上的特徵。',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'GNU AGPL v3'
    },
    {
      name: 'Pymnet',
      author: 'Mikko Kivelä',
      lang: 'Python',
      desc: 'Pymnet 是分析多層網絡的平台，它也可以視覺化多層網絡 [指網絡中的節點同時呈現不同性質，如路網中的台北車站，其實是台鐵、' +
        '捷運和高鐵三鐵共構]。',
      updatedTime: '2018',
      category: '函式庫: 萬用工具',
      license: 'GNU GPL v3'
    },
    {
      name: 'NetworkX',
      author: 'Aric Hagberg 等人',
      lang: 'Python',
      desc: 'NetworkX 是 Python 的套件，用來處理網絡數據或是網絡的視覺化。因為大部分的程式碼由 Python 寫成，' +
        '它沒有 igraph 或 Graph-tool 的效率，但它卻是三者之中最方便安裝且更新最頻繁的，容易找到最新的工具。',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'BSD 3-Clause'
    },
    {
      name: 'PNet',
      author: 'Peng Wang 等人',
      lang: 'Java & .NET',
      desc: 'PNet 是在 Windows 上運行的獨立程式。它使用 ERGM (Exponential Random Graph Model) 與 ' +
        'ALAAM (Auto-logistic Actor Attribute Model) 等方法分析社交網絡。',
      updatedTime: '未知',
      category: '獨立程式: 萬用工具',
      license: '未知'
    },
    {
      name: 'statnet',
      author: 'Martina Morris 等人',
      lang: 'R',
      desc: 'statnet 是 R 的函式庫。它可以分析、模擬與視覺化網絡。尤其是 ERGMs (Exponential Random Graph Models) 相關的分析。',
      updatedTime: '2016',
      category: '函式庫: 萬用工具',
      license: 'GNU GPL v3'
    },
    {
      name: 'netwulf',
      author: 'Benjamin F. Maier',
      lang: 'Python',
      desc: 'netwulf 可以在 networkx 的基礎上，有效地視覺化網絡數據。因為使用 canvas 作為繪圖引擎，它可以渲染比較大的網絡。',
      updatedTime: '2018',
      category: '函式庫: 視覺化',
      license: 'MIT'
    },
    {
      name: 'GrasPy',
      author: 'Avanti Athreya 等人',
      lang: 'Python',
      desc: 'GrasPy 是一個根基於 scikit-learn 的函式庫，它可以處理網絡數據，並對網絡做許多統計分析。',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'Apache-2.0'
    },
    {
      name: 'nauty',
      author: 'Brendan D. McKay',
      lang: 'C',
      desc: 'nauty 是用來計算無向或有向圖的自同構群 (automorphism groups) 的函式庫。',
      updatedTime: '2018',
      category: '函式庫: 特殊工具',
      license: 'Apache-2.0'
    },
    {
      name: 'GraphPruning',
      author: 'Navid Dianati',
      lang: 'Python',
      desc: 'GraphPruning 可以過濾有權重的網絡，讓密集的網絡稀疏些，幫助視覺化呈現。他採用 configuration model 作為基準模型，' +
        '挑出權重比較特別的邊，並過濾掉剩下的。',
      updatedTime: '2016',
      category: '函式庫: 特殊工具',
      license: 'GNU LGPL v3'
    },
    {
      name: 'tikz-network',
      author: 'Juergen Hackl',
      lang: 'TeX',
      desc: '可以在 LaTeX 中視覺化複雜網絡的工具。',
      updatedTime: '2018',
      category: '函式庫: 特殊工具',
      license: 'GNU GPL v3'
    },
    {
      name: 'DDLab',
      author: 'Andy Wuensche',
      lang: 'C',
      desc: 'DDLab 有可以互動的圖形使用者介面 (GUI)，用來研究複雜系統、湧現現象、神經網絡或基因調控網絡等在有向網絡中運作的動態' +
        '系統，例如細胞自動機 (cellular automata)、隨機布林網絡 (random boolean networks) 以及多值動態網絡 (discrete ' +
        'dynamical networks) 等等。',
      updatedTime: '2019',
      category: '函式庫: 萬用工具',
      license: 'GNU GPL v3'
    },
    {
      name: 'leidenalg',
      author: 'Vincent Traag',
      lang: 'Python & C++',
      desc: 'Leiden 演算法改善了 Louvain 演算法的問題，例如挖掘到的社群，應該歸納成同一群的節點，結果是斷開的。' +
        'Leiden 演算法保證可以用更快的速度，找到「高品質」的社群。',
      updatedTime: '2019',
      category: '函式庫: 特殊工具',
      license: 'GNU GPL v3'
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
  displayData = [...this.dataSet];

  searchNameList = [];
  searchAddressList = [];

  sort(sortName: string, value: string): void {
    this.sortName = sortName;
    this.sortValue = value;
    for (const key in this.sortMap) {
      this.sortMap[key] = (key === sortName ? value : null);
    }
    this.search(this.searchNameList, this.searchAddressList);
  }

  search(searchNameList: string[], searchAddressList: string[]): void {
    this.searchNameList = searchNameList;
    this.searchAddressList = searchAddressList;
    const filterFunc = item => (this.searchAddressList.length ? this.searchAddressList.some(
      address => item.address.indexOf(address) !== -1) : true) && (
        this.searchNameList.length ? this.searchNameList.some(name => item.name.indexOf(name) !== -1) : true);
    const data = this.dataSet.filter(item => filterFunc(item));
    if (this.sortName && this.sortValue) {
      this.displayData = data.sort((a, b) => (
        this.sortValue === 'ascend') ? (
          a[this.sortName] > b[this.sortName] ? 1 : -1) : (b[this.sortName] > a[this.sortName] ? 1 : -1));
    } else {
      this.displayData = data;
    }
  }


}
