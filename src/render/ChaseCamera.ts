import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { clamp, damp } from '../util/math';

export interface CameraTarget {
  position: Vector3;
  quaternion: Quaternion;
  /** Signed forward speed (m/s). */
  speed: number;
}

export type CameraMode = 'chase' | 'far' | 'hood';

const FORWARD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);

/**
 * Low third-person chase camera. Position follows a damped spring behind the
 * car, yaw follows the car's velocity heading rather than its body yaw so
 * drifts read as the car rotating under a steady camera.
 */
export class ChaseCamera {
  mode: CameraMode = 'chase';
  private readonly desired = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly forward = new Vector3();
  private readonly flatForward = new Vector3();
  private readonly headingQuat = new Quaternion();
  private heading = 0;
  private initialised = false;
  private fov = 60;

  constructor(readonly camera: PerspectiveCamera) {}

  cycle(): void {
    this.mode = this.mode === 'chase' ? 'far' : this.mode === 'far' ? 'hood' : 'chase';
  }

  snap(target: CameraTarget): void {
    this.initialised = false;
    this.update(target, 1 / 60);
  }

  /** Slow showcase orbit for the menu; `time` in seconds. */
  orbit(t: CameraTarget, time: number): void {
    this.initialised = false;
    const a = time * 0.25;
    this.camera.position.set(Math.sin(a) * 6.5, 1.6, Math.cos(a) * 6.5).add(t.position);
    this.lookAt.copy(t.position).setY(t.position.y + 0.6);
    this.camera.lookAt(this.lookAt);
  }

  update(t: CameraTarget, dt: number): void {
    this.forward.copy(FORWARD).applyQuaternion(t.quaternion);
    this.flatForward.set(this.forward.x, 0, this.forward.z);
    if (this.flatForward.lengthSq() < 1e-4) this.flatForward.set(0, 0, 1);
    this.flatForward.normalize();
    const bodyHeading = Math.atan2(this.flatForward.x, this.flatForward.z);
    if (!this.initialised) this.heading = bodyHeading;
    const headingRate = this.mode === 'hood' ? 40 : 6 + Math.min(Math.abs(t.speed), 40) * 0.12;
    this.heading = dampAngle(this.heading, bodyHeading, headingRate, dt);
    this.headingQuat.setFromAxisAngle(UP, this.heading);

    const speedKmh = Math.abs(t.speed) * 3.6;
    const speedT = clamp(speedKmh / 220, 0, 1);
    let back: number;
    let height: number;
    let lookHeight: number;
    if (this.mode === 'hood') {
      back = -0.6;
      height = 1.05;
      lookHeight = 0.9;
    } else if (this.mode === 'far') {
      back = 8.5 + speedT * 1.5;
      height = 2.6;
      lookHeight = 1.0;
    } else {
      back = 5.6 + speedT * 1.4;
      height = 1.55 + speedT * 0.2;
      lookHeight = 0.85;
    }

    this.desired.set(0, height, -back).applyQuaternion(this.headingQuat).add(t.position);
    if (!this.initialised) {
      this.camera.position.copy(this.desired);
      this.initialised = true;
    } else {
      const rate = this.mode === 'hood' ? 60 : 9;
      this.camera.position.x = damp(this.camera.position.x, this.desired.x, rate, dt);
      this.camera.position.y = damp(this.camera.position.y, this.desired.y, rate * 0.8, dt);
      this.camera.position.z = damp(this.camera.position.z, this.desired.z, rate, dt);
    }

    const lookAhead = this.mode === 'hood' ? 12 : 3.5 + speedT * 4;
    this.lookAt.set(0, lookHeight, lookAhead).applyQuaternion(this.headingQuat).add(t.position);
    this.camera.lookAt(this.lookAt);

    const targetFov = (this.mode === 'hood' ? 68 : 58) + speedT * 12;
    this.fov = damp(this.fov, targetFov, 3, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

function dampAngle(a: number, b: number, rate: number, dt: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-rate * dt));
}
