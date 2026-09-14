import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { COLLISION_GROUP } from '../physics/PhysicsWorld';
import { buildBarrierSegments, buildGroundTrimesh, buildStrip, flat } from '../track/roadGeometry';
import type { Track, TrackFrame } from '../track/track';
import { createRng } from '../util/math';
import { FACADE_GRID, createConcreteTexture, createFacadeTextures, createRoadTextures, createWaterNormal } from './textures';

export interface SceneQuality {
  anisotropy: number;
  skylineDensity: number;
  shadows: boolean;
  cheapShading: boolean;
}

export interface StreetLamp {
  position: Vector3;
}

const isUrban = (f: TrackFrame) => f.section === 'downtown' || f.section === 'waterfront';
const isTunnel = (f: TrackFrame) => f.section === 'tunnel';
const isHillside = (f: TrackFrame) => f.section === 'hillside';
const isDowntown = (f: TrackFrame) => f.section === 'downtown';
const isWaterfront = (f: TrackFrame) => f.section === 'waterfront';

/** Normal-mapped surfaces (wet road, water) stay PBR: they carry the look, the rest is fill. */
function toLambert(mat: MeshStandardMaterial | MeshBasicMaterial): Material {
  if (!(mat instanceof MeshStandardMaterial) || mat.normalMap) return mat;
  return new MeshLambertMaterial({
    color: mat.color,
    map: mat.map,
    emissive: mat.emissive,
    emissiveMap: mat.emissiveMap,
    emissiveIntensity: mat.emissiveIntensity,
  });
}

const SIDEWALK_W = 4;
const SIDEWALK_H = 0.15;
const TUNNEL_H = 6.5;

/**
 * Builds every static visual and collider for the circuit from the shared
 * track data. Returns the root group plus lamp positions the renderer uses to
 * place a handful of real lights around the player.
 */
export class TrackScene {
  readonly root = new Group();
  readonly lamps: StreetLamp[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly waterNormal: Texture;
  private readonly cheapShading: boolean;

  constructor(
    readonly track: Track,
    readonly physics: PhysicsWorld,
    quality: SceneQuality,
    envMap: Texture | null,
  ) {
    this.cheapShading = quality.cheapShading;
    const W = track.def.roadWidth;
    const half = W / 2;
    const aniso = quality.anisotropy;

    const road = createRoadTextures(aniso);
    const roadMat = new MeshStandardMaterial({
      map: road.map,
      roughnessMap: road.roughnessMap,
      normalMap: road.normalMap,
      roughness: 1,
      metalness: 0.08,
      envMap,
      envMapIntensity: 0.6,
    });
    this.add(buildStrip(track, { left: flat(-half), right: flat(half), vScale: 8 }), roadMat, true);

    const concrete = createConcreteTexture(aniso);
    const concreteMat = new MeshStandardMaterial({ map: concrete, roughness: 0.85, metalness: 0, envMap, envMapIntensity: 0.4 });
    const sidewalks = [
      buildStrip(track, { left: flat(-(half + SIDEWALK_W), SIDEWALK_H), right: flat(-half, SIDEWALK_H), filter: isUrban, vScale: 4 }),
      buildStrip(track, { left: flat(half, SIDEWALK_H), right: flat(half + SIDEWALK_W, SIDEWALK_H), filter: isUrban, vScale: 4 }),
      buildStrip(track, { left: flat(-half, SIDEWALK_H), right: flat(-half, 0), filter: isUrban, vScale: 4 }),
      buildStrip(track, { left: flat(half, 0), right: flat(half, SIDEWALK_H), filter: isUrban, vScale: 4 }),
    ];
    this.add(mergeGeometries(sidewalks), concreteMat, true);

    const groundMat = new MeshStandardMaterial({ color: new Color('#1b1d1f'), roughness: 0.95, metalness: 0 });
    const ground = [
      buildStrip(track, { left: flat(-(half + 260)), right: flat(-(half + SIDEWALK_W)), filter: (f) => !isHillside(f) && !isTunnel(f), vScale: 50 }),
      buildStrip(track, { left: flat(half + SIDEWALK_W), right: flat(half + 260), filter: (f) => isDowntown(f), vScale: 50 }),
    ];
    this.add(mergeGeometries(ground), groundMat, false);

    const hillMat = new MeshStandardMaterial({ color: new Color('#2a3320'), roughness: 1, metalness: 0 });
    const hills = [
      buildStrip(track, { left: flat(half + 1.2), right: flat(half + 16, 11), filter: isHillside, vScale: 20 }),
      buildStrip(track, { left: flat(half + 16, 11), right: flat(half + 220, 34), filter: isHillside, vScale: 20 }),
      buildStrip(track, { left: flat(-(half + 90), -22), right: flat(-(half + 1.2)), filter: isHillside, vScale: 20 }),
      buildStrip(track, { left: flat(-(half + 260), -22), right: flat(-(half + 90), -22), filter: isHillside, vScale: 20 }),
      buildStrip(track, { left: flat(-(half + 1.2)), right: flat(-half), filter: (f) => !isUrban(f), vScale: 4 }),
      buildStrip(track, { left: flat(half), right: flat(half + 1.2), filter: (f) => !isUrban(f), vScale: 4 }),
    ];
    this.add(mergeGeometries(hills), hillMat, true);

    const tunnelMat = new MeshStandardMaterial({ map: concrete, color: new Color('#8a8f96'), roughness: 0.7, metalness: 0.05, envMap, envMapIntensity: 0.3 });
    const tunnel = [
      buildStrip(track, { left: flat(-(half + 1.2), TUNNEL_H), right: flat(-(half + 1.2), 0), filter: isTunnel, vScale: 6 }),
      buildStrip(track, { left: flat(half + 1.2, 0), right: flat(half + 1.2, TUNNEL_H), filter: isTunnel, vScale: 6 }),
      buildStrip(track, { left: flat(half + 1.2, TUNNEL_H), right: flat(-(half + 1.2), TUNNEL_H), filter: isTunnel, vScale: 6 }),
      buildStrip(track, { left: flat(-(half + 1.2), TUNNEL_H), right: flat(-(half + 8), TUNNEL_H + 3), filter: isTunnel, vScale: 6 }),
      buildStrip(track, { left: flat(half + 8, TUNNEL_H + 3), right: flat(half + 1.2, TUNNEL_H), filter: isTunnel, vScale: 6 }),
    ];
    this.add(mergeGeometries(tunnel), tunnelMat, true);
    const tunnelLightMat = new MeshBasicMaterial({ color: new Color('#ffcf7a') });
    this.add(buildStrip(track, { left: flat(0.25, TUNNEL_H - 0.05), right: flat(-0.25, TUNNEL_H - 0.05), filter: isTunnel }), tunnelLightMat, false);

    this.waterNormal = createWaterNormal();
    const waterMat = new MeshStandardMaterial({
      color: new Color('#0a1a2a'),
      roughness: 0.18,
      metalness: 0.9,
      normalMap: this.waterNormal,
      envMap,
      envMapIntensity: 0.7,
    });
    waterMat.normalScale.set(0.35, 0.35);
    const water = buildStrip(track, { left: flat(half + SIDEWALK_W + 6, -2.4), right: flat(half + 500, -2.4), filter: isWaterfront, vScale: 40 });
    this.add(water, waterMat, false);
    const seawall = [
      buildStrip(track, { left: flat(half + SIDEWALK_W, SIDEWALK_H), right: flat(half + SIDEWALK_W + 6, SIDEWALK_H), filter: isWaterfront, vScale: 6 }),
      buildStrip(track, { left: flat(half + SIDEWALK_W + 6, SIDEWALK_H), right: flat(half + SIDEWALK_W + 6, -2.6), filter: isWaterfront, vScale: 6 }),
    ];
    this.add(mergeGeometries(seawall), concreteMat, true);

    this.buildBuildings(quality, envMap);
    this.buildStreetLamps(envMap);
    this.buildBarriers(concreteMat);
    this.buildColliders();
  }

  update(time: number): void {
    this.waterNormal.offset.set(time * 0.012, time * 0.008);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }

  private add(geo: BufferGeometry, mat: MeshStandardMaterial | MeshBasicMaterial, receiveShadow: boolean): Mesh {
    const mesh = new Mesh(geo, this.cheapShading ? toLambert(mat) : mat);
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    this.root.add(mesh);
    this.disposables.push(geo, mesh.material);
    return mesh;
  }

  private buildBuildings(quality: SceneQuality, envMap: Texture | null): void {
    const track = this.track;
    const half = track.def.roadWidth / 2;
    const rng = createRng(1234);
    const styles = ['glass', 'concrete', 'brick'] as const;
    const geoms: BufferGeometry[][] = [[], [], []];
    const placed: Array<{ x: number; z: number; r: number }> = [];

    const place = (center: Vector3, yaw: number, w: number, h: number, d: number, styleIndex: number) => {
      for (const p of placed) {
        if (Math.hypot(p.x - center.x, p.z - center.z) < (p.r + Math.max(w, d) / 2) * 0.8) return false;
      }
      placed.push({ x: center.x, z: center.z, r: Math.max(w, d) / 2 });
      const geo = new BoxGeometry(w, h, d);
      scaleBoxUv(geo, w, h, d);
      geo.applyMatrix4(new Matrix4().compose(center, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1)));
      geoms[styleIndex].push(geo);
      return true;
    };

    const frames = track.frames;
    const stride = 13;
    for (let i = 0; i < frames.length; i += stride) {
      const f = frames[i];
      if (!isUrban(f)) continue;
      const sides = isWaterfront(f) ? [-1] : [-1, 1];
      for (const side of sides) {
        const w = 18 + rng() * 12;
        const d = 18 + rng() * 22;
        const tall = isDowntown(f);
        const h = tall ? 22 + Math.pow(rng(), 1.6) * 110 : 9 + rng() * 14;
        const gap = 0.8 + rng() * 2.5;
        const lateral = side * (half + SIDEWALK_W + gap + d / 2);
        const center = f.position.clone().addScaledVector(f.right, lateral);
        center.y = f.position.y + h / 2 - 0.2;
        const styleIndex = tall ? (rng() < 0.55 ? 0 : rng() < 0.6 ? 1 : 2) : rng() < 0.5 ? 2 : 1;
        place(center, Math.atan2(f.forward.x, f.forward.z), w, h, d, styleIndex);
      }
    }

    const centerX = (track.bounds.minX + track.bounds.maxX) / 2;
    const centerZ = (track.bounds.minZ + track.bounds.maxZ) / 2;
    const skylineCount = Math.round(260 * quality.skylineDensity);
    const skyRng = createRng(777);
    for (let i = 0; i < skylineCount; i++) {
      const angle = skyRng() * Math.PI * 2;
      const dist = 420 + skyRng() * 600;
      const x = centerX + Math.cos(angle) * dist;
      const z = centerZ + Math.sin(angle) * dist;
      const near = track.nearest(x, z);
      if (Math.abs(near.lateral) < 70) continue;
      const onHarbor = isWaterfront(near.frame) && near.lateral > 0 && near.lateral < 380;
      if (onHarbor) continue;
      const w = 30 + skyRng() * 40;
      const d = 30 + skyRng() * 40;
      const h = 60 + Math.pow(skyRng(), 1.4) * 220;
      place(new Vector3(x, h / 2 - 1, z), skyRng() * Math.PI, w, h, d, skyRng() < 0.6 ? 0 : 1);
    }

    styles.forEach((style, idx) => {
      if (geoms[idx].length === 0) return;
      const tex = createFacadeTextures(100 + idx, quality.anisotropy, style);
      const mat = new MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.emissiveMap,
        emissive: new Color('#ffffff'),
        emissiveIntensity: 1.1,
        roughness: style === 'glass' ? 0.25 : 0.8,
        metalness: style === 'glass' ? 0.6 : 0.05,
        envMap,
        envMapIntensity: style === 'glass' ? 0.5 : 0.15,
      });
      const merged = mergeGeometries(geoms[idx]);
      const mesh = this.add(merged, mat, true);
      mesh.castShadow = quality.shadows;
      for (const g of geoms[idx]) g.dispose();
    });
  }

  private buildStreetLamps(envMap: Texture | null): void {
    const track = this.track;
    const half = track.def.roadWidth / 2;
    const frames = track.frames;
    const stride = 16;
    const poles: Matrix4[] = [];
    const arms: Matrix4[] = [];
    const heads: Matrix4[] = [];
    const up = new Vector3(0, 1, 0);
    const unit = new Vector3(1, 1, 1);
    const poleHeight = 9;
    for (let i = 0, k = 0; i < frames.length; i += stride, k++) {
      const f = frames[i];
      if (isTunnel(f)) continue;
      const side = isWaterfront(f) ? 1 : k % 2 === 0 ? -1 : 1;
      const lateral = side * (half + (isUrban(f) ? 1.2 : 1.6));
      const base = f.position.clone().addScaledVector(f.right, lateral);
      base.y += isUrban(f) ? SIDEWALK_H : 0;
      const q = new Quaternion().setFromAxisAngle(up, Math.atan2(f.forward.x, f.forward.z));
      poles.push(new Matrix4().compose(base.clone().add(new Vector3(0, poleHeight / 2, 0)), q, unit));
      const top = base.clone().add(new Vector3(0, poleHeight, 0));
      const head = top.clone().addScaledVector(f.right, -side * 2.4);
      const armDir = new Vector3().subVectors(head, top).normalize();
      const armQ = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), armDir);
      arms.push(new Matrix4().compose(top.clone().add(head).multiplyScalar(0.5), armQ, unit));
      heads.push(new Matrix4().compose(head, q, unit));
      this.lamps.push({ position: head.clone().add(new Vector3(0, -0.6, 0)) });
    }
    const poleMat = new MeshStandardMaterial({ color: new Color('#2f3338'), roughness: 0.5, metalness: 0.8, envMap });
    const poleGeo = new CylinderGeometry(0.09, 0.14, poleHeight, 8);
    const armGeo = new BoxGeometry(0.12, 0.12, 2.4);
    const headGeo = new SphereGeometry(0.28, 10, 8);
    const headMat = new MeshBasicMaterial({ color: new Color('#ffd9a8'), toneMapped: false });
    for (const [geo, mat, mats] of [
      [poleGeo, poleMat, poles],
      [armGeo, poleMat, arms],
      [headGeo, headMat, heads],
    ] as const) {
      const mesh = new InstancedMesh(geo, mat, mats.length);
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      this.root.add(mesh);
    }
    this.disposables.push(poleGeo, poleMat, armGeo, headGeo, headMat);
  }

  private buildBarriers(mat: MeshStandardMaterial): void {
    const track = this.track;
    const half = track.def.roadWidth / 2;
    const stride = 3;
    const segs = [
      ...buildBarrierSegments(track, () => -(half + 1.0), stride, isHillside),
      ...buildBarrierSegments(track, () => half + 1.0, stride, isHillside),
    ];
    if (segs.length === 0) return;
    const geo = new BoxGeometry(0.5, 0.9, 1);
    const mesh = new InstancedMesh(geo, mat, segs.length);
    const up = new Vector3(0, 1, 0);
    segs.forEach((s, i) => {
      const q = new Quaternion().setFromAxisAngle(up, s.yaw);
      const pos = s.center.clone();
      pos.y += 0.45;
      mesh.setMatrixAt(i, new Matrix4().compose(pos, q, new Vector3(1, 1, s.length)));
    });
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.disposables.push(geo);
  }

  private buildColliders(): void {
    const track = this.track;
    const half = track.def.roadWidth / 2;
    const ground = buildGroundTrimesh(track, (f) => half + (isUrban(f) ? SIDEWALK_W + 0.5 : 1.4));
    this.physics.addTrimesh(ground.vertices, ground.indices, COLLISION_GROUP.GROUND, 1);

    const wallOffset = (f: TrackFrame) => half + (isUrban(f) ? SIDEWALK_W + 0.8 : 1.25);
    const stride = 3;
    for (const sign of [-1, 1]) {
      const segs = buildBarrierSegments(track, (f) => sign * wallOffset(f), stride);
      for (const s of segs) {
        const c = s.center.clone();
        c.y += 1.2;
        this.physics.addBox(c, { x: 0.25, y: 1.2, z: s.length / 2 }, s.yaw, COLLISION_GROUP.STATIC);
      }
    }
  }
}

function scaleBoxUv(geo: BoxGeometry, w: number, h: number, d: number): void {
  const uv = geo.attributes.uv;
  const metresPerWindowU = 2.4;
  const metresPerWindowV = 3.3;
  const repeatsU = [d, d, w, w, w, w].map((m) => m / metresPerWindowU / FACADE_GRID);
  const repeatsV = [h, h, d, d, h, h].map((m) => m / metresPerWindowV / FACADE_GRID);
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      if (face === 2 || face === 3) {
        uv.setXY(i, 0.001, 0.001);
        continue;
      }
      uv.setXY(i, uv.getX(i) * repeatsU[face], uv.getY(i) * repeatsV[face]);
    }
  }
  uv.needsUpdate = true;
}
