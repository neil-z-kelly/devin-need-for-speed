import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  Vector3,
  type Material,
  type Texture,
} from 'three';
import type { VehicleSim } from '../physics/VehicleSim';
import { SUPERBIKE_LEAN, balanceLean, stepLean } from '../physics/lean';
import { MOTORCYCLE_REST_COMPRESSION } from '../physics/motorcycle';

export interface MotorcycleModelOptions {
  envMap: Texture | null;
  castShadow: boolean;
  headlights: boolean;
}

const WHEEL_RADIUS = 0.32;
const FRONT_AXLE = new Vector3(0, WHEEL_RADIUS, 0.72);
const REAR_AXLE = new Vector3(0, WHEEL_RADIUS, -0.7);
const HEAD_TUBE = new Vector3(0, 0.93, 0.42);
const SWINGARM_PIVOT = new Vector3(0, 0.44, -0.18);
const SEAT_PIVOT = new Vector3(0, 0.86, -0.3);
/** How much further than the machine the rider hangs into a corner. */
const RIDER_HANG_OFF = 0.25;
const Y_AXIS = new Vector3(0, 1, 0);

/**
 * Original procedural sports motorcycle (about 4k triangles) built from
 * primitives so the low preset can afford it: twin-spar frame, fairings,
 * raked telescopic forks that steer with the physics, swingarm that follows
 * the rear suspension, lights, and a tucked rider. The physics body itself is
 * kept upright by the four-ray stance in MOTORCYCLE_SPEC; the visible roll is
 * driven from measured speed and yaw rate through `balanceLean`, pivoting
 * about the tyre contact line so the wheels stay planted while leaning.
 */
export class MotorcycleModel {
  /** Follows the physics pose (no roll), so the chase camera stays level. */
  readonly root = new Group();
  readonly paintMaterial: MeshPhysicalMaterial;
  readonly tailMaterial: MeshStandardMaterial;
  readonly headlightMaterial: MeshStandardMaterial;
  headlight: SpotLight | null = null;
  /** Current visual lean in radians, positive towards the left (+X) side. */
  lean = 0;

  private readonly leanPivot = new Group();
  private readonly steerHead = new Group();
  private readonly frontSlider = new Group();
  private readonly frontWheel = new Group();
  private readonly swingarm = new Group();
  private readonly rearWheel = new Group();
  private readonly rider = new Group();
  private readonly rake: number;
  private readonly swingarmLength: number;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(opts: MotorcycleModelOptions) {
    const env = opts.envMap;
    this.paintMaterial = new MeshPhysicalMaterial({
      color: new Color('#e8d418'),
      metalness: 0.5,
      roughness: 0.38,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMap: env,
      envMapIntensity: 1.0,
    });
    const black = new MeshStandardMaterial({ color: new Color('#111318'), roughness: 0.55, metalness: 0.25, envMap: env, envMapIntensity: 0.5 });
    const darkMetal = new MeshStandardMaterial({ color: new Color('#3a3d42'), roughness: 0.4, metalness: 0.85, envMap: env, envMapIntensity: 0.8 });
    const gold = new MeshStandardMaterial({ color: new Color('#c9a24a'), roughness: 0.25, metalness: 1, envMap: env, envMapIntensity: 1.2 });
    const chrome = new MeshStandardMaterial({ color: new Color('#d8dde3'), roughness: 0.2, metalness: 1, envMap: env, envMapIntensity: 1.2 });
    const tyre = new MeshStandardMaterial({ color: new Color('#101012'), roughness: 0.95, metalness: 0 });
    const rim = new MeshStandardMaterial({ color: new Color('#1c1e22'), roughness: 0.35, metalness: 0.8, envMap: env, envMapIntensity: 0.9 });
    const glass = new MeshPhysicalMaterial({ color: new Color('#8fb4d8'), roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.35, envMap: env, envMapIntensity: 1.4 });
    const suit = new MeshStandardMaterial({ color: new Color('#1a1c22'), roughness: 0.7, metalness: 0.05 });
    this.tailMaterial = new MeshStandardMaterial({ color: new Color('#4a0006'), emissive: new Color('#ff1a1a'), emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.2 });
    this.headlightMaterial = new MeshStandardMaterial({ color: new Color('#ffffff'), emissive: new Color('#e6f0ff'), emissiveIntensity: opts.headlights ? 6 : 0.8, roughness: 0.1, metalness: 0.1 });
    this.disposables.push(this.paintMaterial, black, darkMetal, gold, chrome, tyre, rim, glass, suit, this.tailMaterial, this.headlightMaterial);

    const paint = this.paintMaterial;
    const castShadow = opts.castShadow;
    const mesh = (geo: BufferGeometry, mat: Material, parent: Object3D): Mesh => {
      const m = new Mesh(geo, mat);
      m.castShadow = castShadow;
      m.receiveShadow = false;
      parent.add(m);
      this.disposables.push(geo);
      return m;
    };
    const box = (parent: Object3D, mat: Material, w: number, h: number, d: number, at: Vector3, taper?: Taper): Mesh => {
      const geo = new BoxGeometry(w, h, d);
      if (taper) taperBox(geo, taper);
      const m = mesh(geo, mat, parent);
      m.position.copy(at);
      return m;
    };
    const bar = (parent: Object3D, mat: Material, w: number, h: number, from: Vector3, to: Vector3): Mesh => {
      const dir = new Vector3().subVectors(to, from);
      const len = dir.length();
      const m = mesh(new BoxGeometry(w, len, h), mat, parent);
      m.position.copy(from).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
      return m;
    };
    const tube = (parent: Object3D, mat: Material, r0: number, r1: number, from: Vector3, to: Vector3, segments = 10): Mesh => {
      const dir = new Vector3().subVectors(to, from);
      const len = dir.length();
      const m = mesh(new CylinderGeometry(r1, r0, len, segments), mat, parent);
      m.position.copy(from).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
      return m;
    };
    const wheel = (parent: Object3D, width: number, discSide: number): Group => {
      const g = new Group();
      const tubeR = width / 2;
      const tyreGeo = new TorusGeometry(WHEEL_RADIUS - tubeR, tubeR, 8, 28);
      tyreGeo.rotateY(Math.PI / 2);
      mesh(tyreGeo, tyre, g);
      const rimR = WHEEL_RADIUS - tubeR * 1.7;
      const rimGeo = new CylinderGeometry(rimR, rimR, width * 0.7, 20, 1, true);
      rimGeo.rotateZ(Math.PI / 2);
      mesh(rimGeo, rim, g);
      const hubGeo = new CylinderGeometry(0.06, 0.06, width * 0.8, 10);
      hubGeo.rotateZ(Math.PI / 2);
      mesh(hubGeo, darkMetal, g);
      for (let i = 0; i < 5; i++) {
        const spoke = mesh(new BoxGeometry(width * 0.35, rimR * 2, 0.035), rim, g);
        spoke.rotation.x = (i / 5) * Math.PI;
      }
      const discGeo = new CylinderGeometry(0.15, 0.15, 0.012, 20);
      discGeo.rotateZ(Math.PI / 2);
      const disc = mesh(discGeo, chrome, g);
      disc.position.x = discSide * (width * 0.45);
      parent.add(g);
      return g;
    };
    const fender = (parent: Object3D, radius: number, arc: number, centre: Vector3): Mesh => {
      const geo = new TorusGeometry(radius, 0.065, 5, 12, arc);
      geo.rotateZ(Math.PI / 2 - arc / 2);
      geo.rotateY(Math.PI / 2);
      geo.scale(1, 1, 1.6);
      const m = mesh(geo, paint, parent);
      m.position.copy(centre);
      return m;
    };

    this.root.add(this.leanPivot);
    const chassis = new Group();
    this.leanPivot.add(chassis);

    // Engine, frame and running gear.
    box(chassis, darkMetal, 0.34, 0.3, 0.42, new Vector3(0, 0.46, 0.02));
    box(chassis, black, 0.3, 0.12, 0.28, new Vector3(0, 0.66, 0.12));
    for (const side of [-1, 1]) {
      bar(chassis, darkMetal, 0.05, 0.11, new Vector3(side * 0.13, 0.5, -0.22), new Vector3(side * 0.16, 0.86, 0.4));
      bar(chassis, darkMetal, 0.04, 0.04, new Vector3(side * 0.13, 0.5, -0.22), new Vector3(side * 0.12, 0.78, -0.55));
      box(chassis, darkMetal, 0.12, 0.03, 0.04, new Vector3(side * 0.22, 0.42, -0.2));
    }
    tube(chassis, chrome, 0.035, 0.035, new Vector3(0, 0.52, -0.1), new Vector3(0, 0.74, -0.3), 8);

    // Bodywork.
    const tank = mesh(new SphereGeometry(1, 18, 12), paint, chassis);
    tank.scale.set(0.21, 0.15, 0.34);
    tank.position.set(0, 0.9, 0.02);
    box(chassis, black, 0.28, 0.06, 0.36, new Vector3(0, 0.87, -0.34));
    const tail = box(chassis, paint, 0.26, 0.15, 0.5, new Vector3(0, 0.79, -0.52), { back: [0.5, 0.5], front: [1, 1] });
    tail.rotation.x = 0.14;
    box(chassis, this.tailMaterial, 0.14, 0.05, 0.03, new Vector3(0, 0.84, -0.77));
    box(chassis, paint, 0.44, 0.34, 0.5, new Vector3(0, 0.85, 0.62), { back: [1, 1], front: [0.55, 0.6], frontLift: -0.03 });
    for (const side of [-1, 1]) {
      const panel = box(chassis, paint, 0.06, 0.42, 0.72, new Vector3(side * 0.21, 0.6, 0.22), { back: [0.7, 0.55], front: [1, 1] });
      panel.rotation.z = -side * 0.14;
      box(chassis, this.headlightMaterial, 0.1, 0.06, 0.03, new Vector3(side * 0.1, 0.9, 0.87));
      bar(chassis, black, 0.015, 0.015, new Vector3(side * 0.2, 1.02, 0.5), new Vector3(side * 0.36, 1.1, 0.42));
      box(chassis, black, 0.1, 0.06, 0.02, new Vector3(side * 0.37, 1.1, 0.42));
    }
    box(chassis, paint, 0.36, 0.12, 0.72, new Vector3(0, 0.27, 0.05), { back: [1, 1], front: [0.8, 0.5] });
    const screen = box(chassis, glass, 0.3, 0.2, 0.02, new Vector3(0, 1.06, 0.55), { back: [1, 1], front: [1, 1] });
    screen.rotation.x = -0.6;
    tube(chassis, darkMetal, 0.028, 0.028, new Vector3(-0.12, 0.33, 0.25), new Vector3(-0.17, 0.36, -0.3), 8);
    tube(chassis, chrome, 0.05, 0.06, new Vector3(-0.17, 0.38, -0.3), new Vector3(-0.2, 0.62, -0.78), 10);
    fender(chassis, WHEEL_RADIUS + 0.05, 1.1, new Vector3(0, WHEEL_RADIUS + 0.02, REAR_AXLE.z + 0.1));

    // Swingarm and rear wheel pivot with the rear suspension.
    this.swingarm.position.copy(SWINGARM_PIVOT);
    chassis.add(this.swingarm);
    const rearLocal = new Vector3().subVectors(REAR_AXLE, SWINGARM_PIVOT);
    this.swingarmLength = rearLocal.length();
    for (const side of [-1, 1]) {
      bar(this.swingarm, darkMetal, 0.05, 0.09, new Vector3(side * 0.12, 0, 0), new Vector3(side * 0.12, rearLocal.y, rearLocal.z));
    }
    this.rearWheel.position.copy(rearLocal);
    this.swingarm.add(this.rearWheel);
    wheel(this.rearWheel, 0.19, 1);

    // Steering head: forks, clip-on bars and the front wheel steer together about the raked axis.
    const forkDir = new Vector3().subVectors(FRONT_AXLE, HEAD_TUBE);
    const forkLength = forkDir.length();
    this.rake = Math.atan2(forkDir.z, -forkDir.y);
    this.steerHead.position.copy(HEAD_TUBE);
    this.steerHead.rotation.order = 'XYZ';
    this.steerHead.rotation.x = -this.rake;
    chassis.add(this.steerHead);
    box(this.steerHead, black, 0.3, 0.04, 0.1, new Vector3(0, 0, 0));
    box(this.steerHead, black, 0.26, 0.05, 0.09, new Vector3(0, -0.2, 0.02));
    for (const side of [-1, 1]) {
      tube(this.steerHead, black, 0.03, 0.03, new Vector3(side * 0.1, 0.03, 0), new Vector3(side * 0.1, -0.34, 0), 8);
      tube(this.steerHead, darkMetal, 0.016, 0.016, new Vector3(side * 0.12, 0.03, -0.02), new Vector3(side * 0.36, 0.01, -0.13), 6);
      tube(this.steerHead, black, 0.022, 0.022, new Vector3(side * 0.26, 0.02, -0.085), new Vector3(side * 0.36, 0.01, -0.13), 6);
      bar(this.steerHead, chrome, 0.01, 0.01, new Vector3(side * 0.24, 0.0, -0.08), new Vector3(side * 0.3, -0.02, 0.06));
    }
    this.frontSlider.position.y = -forkLength;
    this.steerHead.add(this.frontSlider);
    for (const side of [-1, 1]) {
      tube(this.frontSlider, gold, 0.024, 0.024, new Vector3(side * 0.1, 0.42, 0), new Vector3(side * 0.1, -0.02, 0), 8);
      box(this.frontSlider, darkMetal, 0.05, 0.1, 0.07, new Vector3(side * 0.1, 0.07, -0.06));
    }
    this.frontSlider.add(this.frontWheel);
    wheel(this.frontWheel, 0.12, -1);
    const frontFender = fender(this.frontSlider, WHEEL_RADIUS + 0.05, 1.6, new Vector3(0, 0.02, 0));
    frontFender.rotation.x = this.rake;

    // Rider hangs off the seat pivot so extra body lean stays anchored to the bike.
    this.rider.position.copy(SEAT_PIVOT);
    chassis.add(this.rider);
    box(this.rider, suit, 0.28, 0.16, 0.22, new Vector3(0, 0.09, 0));
    bar(this.rider, suit, 0.34, 0.2, new Vector3(0, 0.12, -0.02), new Vector3(0, 0.4, 0.34));
    const helmet = mesh(new SphereGeometry(0.13, 16, 12), paint, this.rider);
    helmet.position.set(0, 0.5, 0.42);
    box(this.rider, black, 0.16, 0.07, 0.04, new Vector3(0, 0.5, 0.54));
    for (const side of [-1, 1]) {
      const shoulder = new Vector3(side * 0.17, 0.38, 0.3);
      const elbow = new Vector3(side * 0.26, 0.24, 0.5);
      const grip = new Vector3(side * 0.31, 0.06, 0.66);
      tube(this.rider, suit, 0.045, 0.045, shoulder, elbow, 8);
      tube(this.rider, suit, 0.04, 0.04, elbow, grip, 8);
      const hip = new Vector3(side * 0.12, 0.04, 0.02);
      const knee = new Vector3(side * 0.22, -0.2, 0.3);
      const peg = new Vector3(side * 0.21, -0.42, 0.1);
      tube(this.rider, suit, 0.065, 0.065, hip, knee, 8);
      tube(this.rider, suit, 0.05, 0.05, knee, peg, 8);
      box(this.rider, black, 0.09, 0.08, 0.24, new Vector3(side * 0.21, -0.44, 0.15));
    }

    if (opts.headlights) {
      const light = new SpotLight(new Color('#dfe9ff'), 220, 90, 0.5, 0.6, 1.4);
      light.position.set(0, 0.9, 0.85);
      light.target.position.set(0, -0.2, 30);
      light.castShadow = false;
      this.root.add(light, light.target);
      this.headlight = light;
    }
  }

  setPaint(hex: string): void {
    this.paintMaterial.color.set(hex);
  }

  setBraking(braking: boolean): void {
    this.tailMaterial.emissiveIntensity = braking ? 4 : 0.6;
  }

  /**
   * Pose the running gear from the physics wheels (front pair index 0, rear
   * pair last) and advance the lean from the chassis' measured motion.
   */
  update(vehicle: VehicleSim, dt: number): void {
    const spec = vehicle.spec;
    const front = vehicle.wheels[0];
    const rear = vehicle.wheels[vehicle.wheels.length - 1];
    const frontTravel = spec.suspensionRestLength - front.suspensionLength - MOTORCYCLE_REST_COMPRESSION;
    const rearTravel = spec.suspensionRestLength - rear.suspensionLength - MOTORCYCLE_REST_COMPRESSION;

    this.steerHead.rotation.y = front.steering;
    this.frontSlider.position.y = -Math.hypot(FRONT_AXLE.y - HEAD_TUBE.y, FRONT_AXLE.z - HEAD_TUBE.z) + frontTravel / Math.cos(this.rake);
    this.frontWheel.rotation.x = front.spin;
    this.swingarm.rotation.x = Math.asin(Math.max(-1, Math.min(1, rearTravel / this.swingarmLength)));
    this.rearWheel.rotation.x = rear.spin;

    const target = balanceLean(vehicle.speed, vehicle.yawRate(), SUPERBIKE_LEAN.maxLean);
    this.lean = stepLean(this.lean, target, dt, SUPERBIKE_LEAN);
    this.leanPivot.rotation.z = -this.lean;
    this.rider.rotation.z = -this.lean * RIDER_HANG_OFF;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

interface Taper {
  /** [x, y] scale applied to the -Z end. */
  back: [number, number];
  /** [x, y] scale applied to the +Z end. */
  front: [number, number];
  frontLift?: number;
}

/** Scales the two Z ends of a box independently so panels can wedge and narrow like fairings. */
function taperBox(geo: BoxGeometry, taper: Taper): void {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const [sx, sy] = z > 0 ? taper.front : taper.back;
    pos.setX(i, pos.getX(i) * sx);
    pos.setY(i, pos.getY(i) * sy + (z > 0 ? taper.frontLift ?? 0 : 0));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}
