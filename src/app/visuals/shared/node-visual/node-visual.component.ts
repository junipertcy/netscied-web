import {Component, Input} from '@angular/core';
import {Node} from '../../../d3';

@Component({
  selector: '[nodeVisual]',
  template: `
    <svg:g
      [attr.transform]="'translate(' + Math.max(node.r, Math.min(400 - node.r, node.x)) + \ 
      ',' + Math.max(node.r, Math.min(400 - node.r, node.y)) + ')'">
      <svg:circle
        class="node"
        [attr.fill]="node.color"
        cx="0"
        cy="0"
        [attr.r]="node.r">
      </svg:circle>
      <svg:text
        class="node-name"
        [attr.font-size]="node.fontSize">
        {{node.id}}
      </svg:text>
    </svg:g>
  `,
  styleUrls: ['./node-visual.component.css']
})
export class NodeVisualComponent {
  @Input('nodeVisual') node: Node;

  Math: any;

  constructor() {
    this.Math = Math;
  }
}
