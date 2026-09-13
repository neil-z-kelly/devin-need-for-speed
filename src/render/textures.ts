import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { createRng } from '../util/math';

export interface RoadTextures {
  map: Texture;
  roughnessMap: Texture;
  normalMap: Texture;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

/** Per-pixel grain over a smooth (bilinear, tiling) low-frequency value noise so surfaces read as one material rather than a grid of blocks. */
function fillNoise(ctx: CanvasRenderingContext2D, size: number, base: number, amplitude: number, seed: number, cells = 1, grain = 1): void {
  const img = ctx.getImageData(0, 0, size, size);
  const rng = createRng(seed);
  const d = img.data;
  const cellNoise = new Float32Array(cells * cells);
  for (let i = 0; i < cellNoise.length; i++) cellNoise[i] = rng() - 0.5;
  const at = (cx: number, cy: number) => cellNoise[(cy % cells) * cells + (cx % cells)];
  const scale = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = y * scale;
    const cy = Math.floor(fy);
    const ty = fy - cy;
    for (let x = 0; x < size; x++) {
      const fx = x * scale;
      const cx = Math.floor(fx);
      const tx = fx - cx;
      const top = at(cx, cy) * (1 - tx) + at(cx + 1, cy) * tx;
      const bottom = at(cx, cy + 1) * (1 - tx) + at(cx + 1, cy + 1) * tx;
      const smooth = top * (1 - ty) + bottom * ty;
      const i = (y * size + x) * 4;
      const v = base + ((rng() - 0.5) * grain + smooth) * amplitude;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function texture(canvas: HTMLCanvasElement, anisotropy: number, srgb: boolean): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Road surface with lane markings baked in. UV.u spans the full road width, so
 * marking positions are fractions of the width; UV.v repeats every `repeatMetres`.
 */
export function createRoadTextures(anisotropy: number, repeatMetres = 8): RoadTextures {
  const size = 1024;
  const [albedo, a] = makeCanvas(size);
  fillNoise(a, size, 44, 22, 11, 6, 0.9);
  const [rough, r] = makeCanvas(size);
  fillNoise(r, size, 150, 70, 23, 5, 0.5);

  const px = (m: number) => (m / repeatMetres) * size;
  const laneX = (u: number) => u * size;

  const seams = createRng(7);
  a.strokeStyle = 'rgba(18,18,20,0.7)';
  for (let i = 0; i < 5; i++) {
    a.lineWidth = 1 + seams() * 2;
    a.beginPath();
    let x = seams() * size;
    let y = seams() * size;
    a.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (seams() - 0.5) * 90;
      y += 40 + seams() * 60;
      a.lineTo(x, y);
    }
    a.stroke();
  }

  const puddles = createRng(99);
  for (let i = 0; i < 26; i++) {
    const x = puddles() * size;
    const y = puddles() * size;
    const rx = 30 + puddles() * 120;
    const ry = 20 + puddles() * 60;
    const g = r.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, 'rgba(8,8,8,1)');
    g.addColorStop(0.6, 'rgba(8,8,8,0.85)');
    g.addColorStop(1, 'rgba(8,8,8,0)');
    r.fillStyle = g;
    r.beginPath();
    r.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    r.fill();
    a.fillStyle = 'rgba(14,16,20,0.5)';
    a.beginPath();
    a.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    a.fill();
  }

  const stripe = (u: number, widthM: number, color: string, dash?: [number, number]) => {
    const w = Math.max(2, (widthM / 14) * size);
    a.fillStyle = color;
    r.fillStyle = '#404040';
    if (!dash) {
      a.fillRect(laneX(u) - w / 2, 0, w, size);
      r.fillRect(laneX(u) - w / 2, 0, w, size);
      return;
    }
    const [on, off] = dash;
    for (let y = 0; y < size; y += px(on + off)) {
      a.fillRect(laneX(u) - w / 2, y, w, px(on));
      r.fillRect(laneX(u) - w / 2, y, w, px(on));
    }
  };
  stripe(0.03, 0.15, '#d8d8d0');
  stripe(0.97, 0.15, '#d8d8d0');
  stripe(0.49, 0.12, '#e0b93a');
  stripe(0.51, 0.12, '#e0b93a');
  stripe(0.25, 0.14, '#d8d8d0', [3, 5]);
  stripe(0.75, 0.14, '#d8d8d0', [3, 5]);

  const [normal, nctx] = makeCanvas(256);
  const img = nctx.getImageData(0, 0, 256, 256);
  const nr = createRng(5);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 128 + (nr() - 0.5) * 22;
    img.data[i + 1] = 128 + (nr() - 0.5) * 22;
    img.data[i + 2] = 255;
    img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
  const normalTex = texture(normal, anisotropy, false);
  normalTex.repeat.set(6, 3);

  return { map: texture(albedo, anisotropy, true), roughnessMap: texture(rough, anisotropy, false), normalMap: normalTex };
}

export function createConcreteTexture(anisotropy: number): Texture {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  fillNoise(ctx, size, 118, 30, 41, 16);
  ctx.strokeStyle = 'rgba(40,40,44,0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (i / 4) * size);
    ctx.lineTo(size, (i / 4) * size);
    ctx.stroke();
  }
  return texture(c, anisotropy, true);
}

/** Windows per facade tile along each axis; building UVs are scaled so one window is roughly 2.4 m wide and 3.3 m tall. */
export const FACADE_GRID = 16;

export interface FacadeTextures {
  map: Texture;
  emissiveMap: Texture;
}

/**
 * Facade with a window grid; the emissive map lights a random subset of
 * windows so towers read as occupied at dusk.
 */
export function createFacadeTextures(seed: number, anisotropy: number, style: 'glass' | 'concrete' | 'brick'): FacadeTextures {
  const size = 1024;
  const rng = createRng(seed);
  const [albedo, a] = makeCanvas(size);
  const [emissive, e] = makeCanvas(size);
  const wall = style === 'glass' ? '#141b26' : style === 'brick' ? '#3d2822' : '#2e3036';
  a.fillStyle = wall;
  a.fillRect(0, 0, size, size);
  e.fillStyle = '#000';
  e.fillRect(0, 0, size, size);
  const cols = FACADE_GRID;
  const rows = FACADE_GRID;
  const cw = size / cols;
  const rh = size / rows;
  const winW = style === 'glass' ? cw * 0.88 : cw * 0.52;
  const winH = style === 'glass' ? rh * 0.72 : rh * 0.55;
  const warm = ['#ffd9a0', '#ffc27a', '#fff1d6', '#9fd3ff', '#ffe8b8'];
  for (let y = 0; y < rows; y++) {
    if (style === 'glass') {
      a.fillStyle = '#0c1018';
      a.fillRect(0, y * rh, size, rh * 0.14);
    }
    const floorLit = rng() < 0.8;
    for (let x = 0; x < cols; x++) {
      const px = x * cw + (cw - winW) / 2;
      const py = y * rh + (rh - winH) / 2;
      const lit = floorLit && rng() < (style === 'glass' ? 0.38 : 0.26);
      a.fillStyle = style === 'glass' ? '#0a1626' : '#080a0e';
      a.fillRect(px, py, winW, winH);
      if (!lit) continue;
      e.fillStyle = warm[Math.floor(rng() * warm.length)];
      e.globalAlpha = 0.45 + rng() * 0.55;
      e.fillRect(px, py, winW, winH);
      e.globalAlpha = 1;
      if (rng() < 0.3) {
        e.fillStyle = 'rgba(0,0,0,0.6)';
        e.fillRect(px, py + winH * 0.6, winW, winH * 0.4);
      }
    }
  }
  if (style === 'brick') {
    a.globalAlpha = 0.25;
    for (let y = 0; y < size; y += 6) {
      a.fillStyle = y % 12 === 0 ? '#2b1c16' : '#5a3a2e';
      a.fillRect(0, y, size, 2);
    }
    a.globalAlpha = 1;
  }
  return { map: texture(albedo, anisotropy, true), emissiveMap: texture(emissive, anisotropy, true) };
}

export function createWaterNormal(): Texture {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const nx = Math.sin((x / size) * Math.PI * 8 + Math.sin((y / size) * Math.PI * 6) * 1.5) * 0.25;
      const ny = Math.cos((y / size) * Math.PI * 10 + Math.sin((x / size) * Math.PI * 4) * 1.2) * 0.25;
      img.data[i] = 128 + nx * 127;
      img.data[i + 1] = 128 + ny * 127;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return texture(c, 1, false);
}
