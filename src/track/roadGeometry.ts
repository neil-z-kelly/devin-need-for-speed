import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import type { Track, TrackFrame } from './track';

export interface Edge {
  /** Metres from the centreline, positive right. */
  lateral: number;
  /** Metres above the road surface. */
  height: number;
}

export interface StripOptions {
  left: (f: TrackFrame) => Edge;
  right: (f: TrackFrame) => Edge;
  /** World metres per texture repeat along the road. */
  vScale?: number;
  filter?: (f: TrackFrame) => boolean;
}

export const flat =
  (lateral: number, height = 0) =>
  (): Edge => ({ lateral, height });

/**
 * Builds a ribbon following the track between two edges (which may differ in
 * height, producing walls or banks). UV.u runs 0..1 across the strip and UV.v
 * is arc length divided by `vScale`, so textures tile without stretching.
 */
export function buildStrip(track: Track, opts: StripOptions): BufferGeometry {
  const frames = track.frames;
  const n = frames.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vScale = opts.vScale ?? 8;
  const tmp = new Vector3();
  const l = new Vector3();
  const r = new Vector3();
  const nrm = new Vector3();

  const pushFrame = (f: TrackFrame, sOverride?: number) => {
    const s = sOverride ?? f.s;
    const le = opts.left(f);
    const re = opts.right(f);
    l.copy(f.position).addScaledVector(f.right, le.lateral).addScaledVector(f.up, le.height);
    r.copy(f.position).addScaledVector(f.right, re.lateral).addScaledVector(f.up, re.height);
    positions.push(l.x, l.y, l.z, r.x, r.y, r.z);
    tmp.subVectors(r, l);
    nrm.crossVectors(tmp, f.forward).normalize();
    if (nrm.lengthSq() < 0.5) nrm.copy(f.up);
    normals.push(nrm.x, nrm.y, nrm.z, nrm.x, nrm.y, nrm.z);
    uvs.push(0, s / vScale, 1, s / vScale);
  };

  let runStart = -1;
  const closeRun = (endIndex: number, wrapped: boolean) => {
    if (runStart < 0) return;
    const base = positions.length / 3;
    let count = 0;
    for (let i = runStart; i <= endIndex; i++) {
      pushFrame(frames[i % n], wrapped && i >= n ? frames[i % n].s + track.length : undefined);
      count++;
    }
    for (let k = 0; k < count - 1; k++) {
      const a = base + k * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    runStart = -1;
  };

  const include = opts.filter ?? (() => true);
  const allIncluded = frames.every(include);
  if (allIncluded) {
    runStart = 0;
    closeRun(n, true);
  } else {
    for (let i = 0; i < n; i++) {
      if (include(frames[i])) {
        if (runStart < 0) runStart = i;
      } else {
        closeRun(i - 1, false);
      }
    }
    closeRun(n - 1, false);
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export interface TrimeshData {
  vertices: Float32Array;
  indices: Uint32Array;
}

/** Flat ground collider spanning the road plus shoulders. */
export function buildGroundTrimesh(track: Track, halfWidth: (f: TrackFrame) => number): TrimeshData {
  const frames = track.frames;
  const n = frames.length;
  const vertices = new Float32Array(n * 2 * 3);
  const indices = new Uint32Array(n * 6);
  const tmp = new Vector3();
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    const hw = halfWidth(f);
    tmp.copy(f.position).addScaledVector(f.right, -hw);
    vertices.set([tmp.x, tmp.y, tmp.z], i * 6);
    tmp.copy(f.position).addScaledVector(f.right, hw);
    vertices.set([tmp.x, tmp.y, tmp.z], i * 6 + 3);
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    indices.set([a, a + 1, b, a + 1, b + 1, b], i * 6);
  }
  return { vertices, indices };
}

export interface BarrierSegment {
  center: Vector3;
  yaw: number;
  length: number;
}

/** Straight box segments approximating a continuous wall at a lateral offset. */
export function buildBarrierSegments(
  track: Track,
  lateral: (f: TrackFrame) => number,
  stride: number,
  filter: (f: TrackFrame) => boolean = () => true,
): BarrierSegment[] {
  const frames = track.frames;
  const n = frames.length;
  const out: BarrierSegment[] = [];
  const a = new Vector3();
  const b = new Vector3();
  for (let i = 0; i < n; i += stride) {
    const fa = frames[i];
    const fb = frames[(i + stride) % n];
    if (!filter(fa) || !filter(fb)) continue;
    a.copy(fa.position).addScaledVector(fa.right, lateral(fa));
    b.copy(fb.position).addScaledVector(fb.right, lateral(fb));
    const center = a.clone().add(b).multiplyScalar(0.5);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    out.push({ center, yaw: Math.atan2(dx, dz), length: Math.hypot(dx, dz) + 0.3 });
  }
  return out;
}
