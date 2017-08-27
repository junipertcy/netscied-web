import { Node } from './';

export class Link implements d3.SimulationLinkDatum<Node> {
  // optional - defining optional implementation properties - required for relevant typing assistance
  index?: number;

  // must - defining enforced implementation properties
  // source: Node | string | number;
  // target: Node | string | number;

  // https://stackoverflow.com/questions/41905301/angular-2-typescript-d3-type-issue-property-x-does-not-exist-on-type-number
  source: Node | any;  // work around
  target: Node | any;  // work around

  constructor(source, target) {
    this.source = source;
    this.target = target;
  }
}
