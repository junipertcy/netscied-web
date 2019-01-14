import APP_CONFIG from '../../app.config';

export class Node implements d3.SimulationNodeDatum {
  // optional - defining optional implementation properties - required for relevant typing assistance
  index?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;

  id: string;
  linkCount: number = 0;

  constructor(id) {
    this.id = id;
  }

  normal = () => {
    return Math.sqrt(this.linkCount / APP_CONFIG.N);
  };

  get r() {
    return 6 * this.normal() + 5;
  }

  get fontSize() {
    return (3 * this.normal() + 10) + 'px';
  }

  get color() {
    let index = Math.floor(APP_CONFIG.SPECTRUM.length * this.normal());
    if (index >= APP_CONFIG.SPECTRUM.length) {
      index = APP_CONFIG.SPECTRUM.length - 1;  // I don't like black-colored nodes.
    }
    return APP_CONFIG.SPECTRUM[index];
  }
}
