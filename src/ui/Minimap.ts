import type { Track } from '../track/track';

export interface MapMarker {
  x: number;
  z: number;
  color: string;
  isPlayer: boolean;
}

const PAD = 14;

/** Top-down track outline plus car markers, drawn straight to a 2D canvas outside React. */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scale: number;
  private readonly offsetX: number;
  private readonly offsetZ: number;
  private readonly outline: Path2D;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly track: Track,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Minimap canvas has no 2D context');
    this.ctx = ctx;
    const b = track.bounds;
    this.scale = Math.min((canvas.width - PAD * 2) / (b.maxX - b.minX), (canvas.height - PAD * 2) / (b.maxZ - b.minZ));
    this.offsetX = (canvas.width - (b.maxX - b.minX) * this.scale) / 2 - b.minX * this.scale;
    this.offsetZ = (canvas.height - (b.maxZ - b.minZ) * this.scale) / 2 - b.minZ * this.scale;
    this.outline = new Path2D();
    track.frames.forEach((f, i) => {
      const [x, y] = this.project(f.position.x, f.position.z);
      if (i === 0) this.outline.moveTo(x, y);
      else this.outline.lineTo(x, y);
    });
    this.outline.closePath();
  }

  private project(x: number, z: number): [number, number] {
    return [x * this.scale + this.offsetX, this.canvas.height - (z * this.scale + this.offsetZ)];
  }

  draw(markers: readonly MapMarker[]): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.track.def.roadWidth * this.scale + 4;
    ctx.strokeStyle = 'rgba(8, 10, 18, 0.7)';
    ctx.stroke(this.outline);
    ctx.lineWidth = this.track.def.roadWidth * this.scale;
    ctx.strokeStyle = 'rgba(242, 239, 230, 0.55)';
    ctx.stroke(this.outline);

    const start = this.track.frameAtS(this.track.checkpointS[0]);
    const [sx, sy] = this.project(start.position.x, start.position.z);
    ctx.fillStyle = '#e8d418';
    ctx.fillRect(sx - 3, sy - 3, 6, 6);

    for (const m of markers) {
      const [x, y] = this.project(m.x, m.z);
      ctx.beginPath();
      ctx.arc(x, y, m.isPlayer ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.fill();
      ctx.lineWidth = m.isPlayer ? 2 : 1;
      ctx.strokeStyle = m.isPlayer ? '#fff' : 'rgba(0,0,0,0.6)';
      ctx.stroke();
    }
  }
}
