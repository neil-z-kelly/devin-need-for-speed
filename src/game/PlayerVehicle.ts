import { Quaternion, Vector3, type Group, type Texture } from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { MOTORCYCLE_SPEC } from '../physics/motorcycle';
import { FERRARI_SPEC, VehicleSim, type Pose, type VehicleSpec } from '../physics/VehicleSim';
import { CarModel } from '../render/CarModel';
import { MotorcycleModel } from '../render/MotorcycleModel';
import type { VehicleKind } from '../state/settings';

export const PLAYER_SPECS: Record<VehicleKind, VehicleSpec> = {
  car: FERRARI_SPEC,
  motorcycle: MOTORCYCLE_SPEC,
};

/** What the game needs from any player model: a posed root plus paint, brake lights and per-frame running gear. */
export interface PlayerVisual {
  readonly root: Group;
  setPaint(hex: string): void;
  setBraking(braking: boolean): void;
  update(sim: VehicleSim, dt: number): void;
  dispose(): void;
}

export interface PlayerVehicleOptions {
  physics: PhysicsWorld;
  spawn: Pose;
  /** Loaded Ferrari glTF, shared with the opponents. */
  carAsset: Group;
  envMap: Texture | null;
  castShadow: boolean;
  headlights: boolean;
}

const tmpPos = new Vector3();
const tmpQuat = new Quaternion();
const prevQuat = new Quaternion();

/**
 * Pairs the player's physics body with its model so Game can swap between
 * the car and the motorcycle without knowing how either is drawn.
 */
export class PlayerVehicle {
  readonly sim: VehicleSim;
  readonly visual: PlayerVisual;

  constructor(
    readonly kind: VehicleKind,
    opts: PlayerVehicleOptions,
  ) {
    this.sim = new VehicleSim(opts.physics, PLAYER_SPECS[kind], opts.spawn);
    this.visual = kind === 'motorcycle' ? new MotorcycleModel(opts) : carVisual(new CarModel(opts.carAsset, opts));
  }

  get root(): Group {
    return this.visual.root;
  }

  /** Interpolates the rendered pose between the last two physics steps. */
  syncVisual(alpha: number, dt: number): void {
    const a = this.sim.prevPose;
    const b = this.sim.pose;
    tmpPos.set(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha);
    prevQuat.set(a.qx, a.qy, a.qz, a.qw);
    tmpQuat.set(b.qx, b.qy, b.qz, b.qw);
    prevQuat.slerp(tmpQuat, alpha);
    this.root.position.copy(tmpPos);
    this.root.quaternion.copy(prevQuat);
    this.visual.update(this.sim, dt);
  }

  dispose(): void {
    this.sim.dispose();
    this.visual.dispose();
  }
}

function carVisual(car: CarModel): PlayerVisual {
  return {
    root: car.root,
    setPaint: (hex) => car.setPaint(hex),
    setBraking: (braking) => car.setBraking(braking),
    update: (sim) => car.updateWheels(sim.wheels, sim.spec),
    dispose: () => car.dispose(),
  };
}
