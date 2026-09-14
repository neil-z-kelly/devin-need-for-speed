import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { VehicleSpec, WheelState } from '../physics/VehicleSim';
import type { CarModel } from '../render/CarModel';
import type { Track } from '../track/track';
import { AiDriver, type AiSkill, type Obstacle } from './AiDriver';
import { newProgress, type CarProgress } from './RaceRules';

/** One opponent: kinematic driver, collider the player can bump, and its visual. */
export class AiCar {
  readonly driver: AiDriver;
  readonly body: RAPIER.RigidBody;
  readonly wheels: WheelState[];
  progress: CarProgress;

  constructor(
    track: Track,
    physics: PhysicsWorld,
    readonly spec: VehicleSpec,
    readonly model: CarModel,
    skill: AiSkill,
    startS: number,
    startLateral: number,
  ) {
    this.driver = new AiDriver(track, skill, startS, startLateral);
    this.body = physics.addKinematicBox(spec.halfExtents, spec.colliderOffsetY);
    this.wheels = spec.wheels.map(() => ({ steering: 0, spin: 0, suspensionLength: spec.suspensionRestLength, inContact: true, slip: 0 }));
    this.progress = newProgress(startS);
    this.place();
  }

  obstacle(): Obstacle {
    return { s: this.driver.s, lateral: this.driver.lateral, speed: this.driver.speed };
  }

  step(dt: number, others: readonly Obstacle[]): void {
    this.driver.step(dt, others);
    this.place();
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      w.spin += (this.driver.speed / this.spec.wheels[i].radius) * dt;
      w.steering = this.spec.wheels[i].steered ? this.driver.steering : 0;
    }
  }

  place(): void {
    const p = this.driver.pose();
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    this.body.setNextKinematicRotation({ x: p.qx, y: p.qy, z: p.qz, w: p.qw });
    this.model.root.position.set(p.x, p.y, p.z);
    this.model.root.quaternion.set(p.qx, p.qy, p.qz, p.qw);
    this.model.updateWheels(this.wheels, this.spec);
  }
}
