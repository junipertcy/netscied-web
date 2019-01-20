import {Pipe, PipeTransform} from '@angular/core';

@Pipe({
  name: 'str2url'
})
export class Str2urlPipe implements PipeTransform {

  transform(value: string): any {
    switch (value) {
      // Licenses
      case 'GNU GPL v3':
        return 'https://www.gnu.org/licenses/gpl-3.0.html';
      case 'GNU GPL v2':
        return 'https://www.gnu.org/licenses/gpl-2.0.html';
      case 'BSD 3-Clause':
        return 'https://opensource.org/licenses/BSD-3-Clause';
      //  Humans
      case 'Tiago P. Peixoto':
        return 'https://skewed.de/tiago';
      case 'Manlio De Domenico':
        return 'https://comunelab.fbk.eu/manlio/index.php';
      case 'Mikko Kivelä':
        return 'http://www.mkivela.com/';
      //  Tools
      case 'Graph-tool':
        return 'https://graph-tool.skewed.de/';
      case 'NetSciDraw':
        return 'http://coco.binghamton.edu/netscidraw/';
      case 'Gephi':
        return 'https://gephi.org/';
      case 'webweb':
        return 'http://danlarremore.com/webweb/';
      case 'igraph':
        return 'http://igraph.org/';
      case 'MuxViz':
        return 'http://muxviz.net/';
      case 'Pymnet':
        return 'http://www.mkivela.com/pymnet/';
      case 'NetworkX':
        return 'https://networkx.github.io/';
      default:
        return false;
    }
  }


}
