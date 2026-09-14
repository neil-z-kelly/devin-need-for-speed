import {
  Color,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SpotLight,
  Vector3,
  type Material,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { VehicleSpec, WheelState } from '../physics/VehicleSim';

const WHEEL_NODES = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'] as const;
/** Static suspension compression under the car's weight (metres), so the wheels sit at the modelled ride height. */
const REST_COMPRESSION = 0.065;
const STEERING_COLUMN_AXIS = new Vector3(0, 1, 0);

export interface CarModelOptions {
  envMap: Texture | null;
  castShadow: boolean;
  headlights: boolean;
}

/**
 * The Ferrari 458 glTF from the three.js examples (author vicent091036, used
 * under CC BY 4.0). The source model faces -Z; it is wrapped in a group
 * rotated 180 degrees so the visual forward matches the physics forward (+Z).
 */
export class CarModel {
  readonly root = new Group();
  readonly bodyMaterial: MeshPhysicalMaterial;
  readonly tailMaterial: MeshStandardMaterial;
  readonly headlightMaterial: MeshStandardMaterial;
  headlight: SpotLight | null = null;
  private readonly wheels: Object3D[] = [];
  private readonly wheelRest: Vector3[] = [];
  private readonly steeringWheel: Object3D | null;
  private readonly steeringRestQuat: Quaternion | null;
  private readonly materials: Material[] = [];

  /** Each instance clones the shared glTF asset so paint and wheel poses are independent. */
  constructor(asset: Group, opts: CarModelOptions) {
    const scene = asset.clone(true);
    const inner = new Group();
    inner.rotation.y = Math.PI;
    inner.add(scene);
    this.root.add(inner);

    this.bodyMaterial = new MeshPhysicalMaterial({
      color: new Color('#e8d418'),
      metalness: 0.5,
      roughness: 0.38,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMap: opts.envMap,
      envMapIntensity: 1.0,
    });
    const details = new MeshStandardMaterial({ color: new Color('#cfd3d8'), metalness: 1, roughness: 0.35, envMap: opts.envMap, envMapIntensity: 1.2 });
    const glass = new MeshPhysicalMaterial({
      color: new Color('#0c1118'),
      metalness: 0.6,
      roughness: 0.05,
      transparent: true,
      opacity: 0.9,
      envMap: opts.envMap,
      envMapIntensity: 1.6,
    });
    this.tailMaterial = new MeshStandardMaterial({ color: new Color('#4a0006'), emissive: new Color('#ff1a1a'), emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.2 });
    this.headlightMaterial = new MeshStandardMaterial({ color: new Color('#ffffff'), emissive: new Color('#e6f0ff'), emissiveIntensity: opts.headlights ? 6 : 0.8, roughness: 0.1, metalness: 0.1 });
    const tires = new MeshStandardMaterial({ color: new Color('#0d0d0f'), roughness: 0.92, metalness: 0 });
    const carbon = new MeshStandardMaterial({ color: new Color('#15171a'), roughness: 0.35, metalness: 0.6, envMap: opts.envMap });
    this.materials.push(this.bodyMaterial, details, glass, this.tailMaterial, this.headlightMaterial, tires, carbon);

    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      obj.castShadow = opts.castShadow;
      obj.receiveShadow = false;
      const current = obj.material as Material & { name?: string };
      switch (current.name) {
        case 'Body_Color':
          obj.material = this.bodyMaterial;
          break;
        case 'metal_chrome':
        case 'metal_gray':
          obj.material = details;
          break;
        case 'Glass_Gray':
          obj.material = glass;
          break;
        case 'Taillight_Glass':
          obj.material = this.tailMaterial;
          break;
        case 'Projector_Glass':
          obj.material = this.headlightMaterial;
          break;
        case 'Tires':
          obj.material = tires;
          break;
        case 'Carbon_Fiber':
          obj.material = carbon;
          break;
        default:
          if (current instanceof MeshStandardMaterial) {
            current.envMap = opts.envMap;
            current.envMapIntensity = 0.6;
          }
      }
    });

    for (let i = 0; i < WHEEL_NODES.length; i++) {
      const node = scene.getObjectByName(WHEEL_NODES[i]);
      if (!node) throw new Error(`Car model missing ${WHEEL_NODES[i]}`);
      this.wheels.push(node);
      this.wheelRest.push(node.position.clone());
    }
    this.steeringWheel = scene.getObjectByName('steering_wheel') ?? null;
    this.steeringRestQuat = this.steeringWheel?.quaternion.clone() ?? null;

    if (opts.headlights) {
      const light = new SpotLight(new Color('#dfe9ff'), 260, 90, 0.55, 0.6, 1.4);
      light.position.set(0, 0.7, 1.9);
      light.target.position.set(0, -0.2, 30);
      light.castShadow = false;
      this.root.add(light, light.target);
      this.headlight = light;
    }
  }

  static async loadAsset(url: string, onProgress?: (fraction: number) => void): Promise<Group> {
    const draco = new DRACOLoader();
    draco.setDecoderPath('/assets/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    const gltf = await loader.loadAsync(url, (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });
    draco.dispose();
    return gltf.scene;
  }

  setPaint(hex: string): void {
    this.bodyMaterial.color.set(hex);
  }

  setBraking(braking: boolean): void {
    this.tailMaterial.emissiveIntensity = braking ? 4 : 0.6;
  }

  /**
   * Wheel nodes live in the source model's frame (forward -Z): the axle is the
   * node's local X, so forward rolling is a negative rotation about X.
   */
  updateWheels(states: readonly WheelState[], spec: VehicleSpec): void {
    for (let i = 0; i < this.wheels.length && i < states.length; i++) {
      const node = this.wheels[i];
      const st = states[i];
      const rest = this.wheelRest[i];
      const travel = spec.suspensionRestLength - st.suspensionLength;
      node.position.set(rest.x, rest.y - travel + REST_COMPRESSION, rest.z);
      node.rotation.order = 'YXZ';
      node.rotation.set(-Math.PI / 2 - st.spin, st.steering, 0);
    }
    if (this.steeringWheel && this.steeringRestQuat && states.length > 0) {
      this.steeringWheel.quaternion.copy(this.steeringRestQuat);
      this.steeringWheel.rotateOnAxis(STEERING_COLUMN_AXIS, -states[0].steering * 5);
    }
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
  }
}
