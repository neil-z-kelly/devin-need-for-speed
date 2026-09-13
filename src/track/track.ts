import { CatmullRomCurve3, Vector3 } from 'three';

export type SectionKind = 'downtown' | 'waterfront' | 'tunnel' | 'hillside';

export interface ControlPoint {
  x: number;
  y: number;
  z: number;
  section: SectionKind;
}

export interface TrackFrame {
  position: Vector3;
  /** Unit tangent along the driving direction. */
  forward: Vector3;
  /** Unit right vector, perpendicular to forward, in the road plane. */
  right: Vector3;
  up: Vector3;
  /** Distance along the centreline from the start line (metres). */
  s: number;
  width: number;
  section: SectionKind;
  /** Signed curvature (1/m); positive turns left. */
  curvature: number;
}

export interface NearestResult {
  index: number;
  s: number;
  /** Signed lateral offset from the centreline; positive is right. */
  lateral: number;
  frame: TrackFrame;
}

export interface TrackDefinition {
  name: string;
  controlPoints: ControlPoint[];
  roadWidth: number;
  checkpointCount: number;
  sampleSpacing: number;
}

export const HARBOR_CIRCUIT: TrackDefinition = {
  name: 'Harbor Circuit',
  roadWidth: 14,
  checkpointCount: 12,
  sampleSpacing: 2,
  controlPoints: [
    { x: 0, y: 0, z: 0, section: 'downtown' },
    { x: 0, y: 0, z: 160, section: 'downtown' },
    { x: 0, y: 0, z: 300, section: 'downtown' },
    { x: 40, y: 0, z: 390, section: 'downtown' },
    { x: 130, y: 0, z: 430, section: 'downtown' },
    { x: 300, y: 0, z: 450, section: 'downtown' },
    { x: 480, y: 0, z: 445, section: 'waterfront' },
    { x: 660, y: 0, z: 400, section: 'waterfront' },
    { x: 790, y: 0, z: 290, section: 'waterfront' },
    { x: 840, y: 0, z: 150, section: 'waterfront' },
    { x: 830, y: -3, z: 40, section: 'tunnel' },
    { x: 770, y: -7, z: -70, section: 'tunnel' },
    { x: 680, y: -4, z: -140, section: 'tunnel' },
    { x: 580, y: 6, z: -190, section: 'hillside' },
    { x: 460, y: 22, z: -250, section: 'hillside' },
    { x: 330, y: 34, z: -270, section: 'hillside' },
    { x: 200, y: 30, z: -230, section: 'hillside' },
    { x: 110, y: 18, z: -150, section: 'hillside' },
    { x: 50, y: 6, z: -70, section: 'hillside' },
    { x: 10, y: 0, z: -25, section: 'downtown' },
  ],
};

const WORLD_UP = new Vector3(0, 1, 0);

/**
 * Sampled closed-loop circuit shared by road geometry, physics colliders,
 * checkpoints, AI navigation and the minimap. Frames are evenly spaced in arc
 * length so `s` can be used directly for lap progress.
 */
export class Track {
  readonly frames: TrackFrame[];
  readonly length: number;
  readonly checkpointS: number[];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(readonly def: TrackDefinition) {
    const curve = new CatmullRomCurve3(
      def.controlPoints.map((p) => new Vector3(p.x, p.y, p.z)),
      true,
      'centripetal',
      0.5,
    );
    curve.arcLengthDivisions = 2000;
    this.length = curve.getLength();
    const count = Math.max(8, Math.round(this.length / def.sampleSpacing));
    const frames: TrackFrame[] = [];
    for (let i = 0; i < count; i++) {
      const u = i / count;
      const position = curve.getPointAt(u);
      const forward = curve.getTangentAt(u).normalize();
      const right = new Vector3().crossVectors(forward, WORLD_UP).normalize();
      const up = new Vector3().crossVectors(right, forward).normalize();
      frames.push({
        position,
        forward,
        right,
        up,
        s: u * this.length,
        width: def.roadWidth,
        section: sectionAt(def.controlPoints, u),
        curvature: 0,
      });
    }
    for (let i = 0; i < count; i++) {
      const prev = frames[(i - 1 + count) % count];
      const next = frames[(i + 1) % count];
      const dtheta = signedAngle(prev.forward, next.forward);
      frames[i].curvature = dtheta / (2 * def.sampleSpacing);
    }
    this.frames = frames;
    this.checkpointS = Array.from({ length: def.checkpointCount }, (_, i) => (i / def.checkpointCount) * this.length);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const f of frames) {
      minX = Math.min(minX, f.position.x);
      maxX = Math.max(maxX, f.position.x);
      minZ = Math.min(minZ, f.position.z);
      maxZ = Math.max(maxZ, f.position.z);
    }
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  frameAtS(s: number): TrackFrame {
    const n = this.frames.length;
    const idx = Math.round(wrapS(s, this.length) / this.def.sampleSpacing) % n;
    return this.frames[idx];
  }

  /** Nearest frame by horizontal distance; `hint` is a previous index to search around. */
  nearest(x: number, z: number, hint?: number): NearestResult {
    const n = this.frames.length;
    let best = -1;
    let bestD = Infinity;
    if (hint !== undefined) {
      const radius = 40;
      for (let k = -radius; k <= radius; k++) {
        const i = (hint + k + n * 4) % n;
        const d = horizDist2(this.frames[i].position, x, z);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (bestD > 60 * 60) best = -1;
    }
    if (best < 0) {
      bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const d = horizDist2(this.frames[i].position, x, z);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    const frame = this.frames[best];
    const dx = x - frame.position.x;
    const dz = z - frame.position.z;
    const lateral = dx * frame.right.x + dz * frame.right.z;
    const along = dx * frame.forward.x + dz * frame.forward.z;
    return { index: best, s: wrapS(frame.s + along, this.length), lateral, frame };
  }

  /** World position offset laterally from the centreline at `s`. */
  positionAt(s: number, lateral: number, out = new Vector3()): Vector3 {
    const f = this.frameAtS(s);
    return out.copy(f.position).addScaledVector(f.right, lateral);
  }
}

export function wrapS(s: number, length: number): number {
  const r = s % length;
  return r < 0 ? r + length : r;
}

/** Shortest signed distance from `a` to `b` along a loop of `length`. */
export function deltaS(a: number, b: number, length: number): number {
  let d = wrapS(b - a, length);
  if (d > length / 2) d -= length;
  return d;
}

function sectionAt(points: ControlPoint[], u: number): SectionKind {
  const n = points.length;
  const i = Math.floor(u * n) % n;
  return points[i].section;
}

function signedAngle(a: Vector3, b: Vector3): number {
  const cross = a.x * b.z - a.z * b.x;
  const dot = a.x * b.x + a.z * b.z;
  return -Math.atan2(cross, dot);
}

function horizDist2(p: Vector3, x: number, z: number): number {
  const dx = p.x - x;
  const dz = p.z - z;
  return dx * dx + dz * dz;
}
