import { Quaternion, Vector3 } from 'three';
import { deltaS, wrapS, type Track } from '../track/track';
import { clamp, damp } from '../util/math';
import type { Pose } from '../physics/VehicleSim';

export interface AiSkill {
  topSpeed: number;
  /** Lateral acceleration the driver is willing to pull in corners (m/s^2). */
  cornerAccel: number;
  accel: number;
  brake: number;
  /** Preferred offset from the centreline on straights (metres, positive right). */
  lane: number;
}

export interface Obstacle {
  s: number;
  lateral: number;
  speed: number;
}

const WHEELBASE = 2.65;
const LOOKAHEAD_STEP = 8;
const LOOKAHEAD_COUNT = 16;
const UP = new Vector3(0, 1, 0);

/**
 * Kinematic opponent that follows the track centreline with a lane offset,
 * brakes for upcoming curvature and eases around slower cars ahead.
 */
export class AiDriver {
  s = 0;
  lateral = 0;
  speed = 0;
  steering = 0;
  private targetLateral = 0;
  private readonly pos = new Vector3();
  private readonly quat = new Quaternion();

  constructor(
    private readonly track: Track,
    readonly skill: AiSkill,
    startS: number,
    startLateral: number,
  ) {
    this.reset(startS, startLateral);
  }

  reset(s: number, lateral: number): void {
    this.s = s;
    this.lateral = lateral;
    this.targetLateral = lateral;
    this.speed = 0;
    this.steering = 0;
  }

  step(dt: number, others: readonly Obstacle[]): void {
    const L = this.track.length;
    let target = this.skill.topSpeed;
    let hug = 0;
    for (let i = 1; i <= LOOKAHEAD_COUNT; i++) {
      const d = i * LOOKAHEAD_STEP;
      const k = this.track.frameAtS(this.s + d).curvature;
      const cornerSpeed = Math.sqrt(this.skill.cornerAccel / Math.max(Math.abs(k), 1e-4));
      target = Math.min(target, Math.sqrt(cornerSpeed * cornerSpeed + 2 * this.skill.brake * d));
      if (i <= 4) hug -= Math.sign(k) * Math.min(Math.abs(k) * 400, 3);
    }
    this.targetLateral = clamp(this.skill.lane + hug / 4, -4.5, 4.5);

    for (const o of others) {
      const ahead = deltaS(this.s, o.s, L);
      if (ahead < 2 || ahead > 30) continue;
      if (Math.abs(o.lateral - this.lateral) > 3.2) continue;
      target = Math.min(target, Math.max(o.speed - 1, 5) + (ahead - 8) * 0.6);
      this.targetLateral = clamp(o.lateral + (this.lateral >= o.lateral ? 3.4 : -3.4), -4.5, 4.5);
    }

    this.speed += clamp(target - this.speed, -this.skill.brake * dt, this.skill.accel * dt);
    this.s = wrapS(this.s + this.speed * dt, L);
    const prevLateral = this.lateral;
    this.lateral = damp(this.lateral, this.targetLateral, 1.8, dt);
    const drift = this.speed > 1 ? Math.atan2(this.lateral - prevLateral, this.speed * dt) : 0;
    this.steering = damp(this.steering, Math.atan(this.track.frameAtS(this.s).curvature * WHEELBASE) + drift, 8, dt);
  }

  pose(): Pose {
    const f = this.track.frameAtS(this.s);
    this.track.positionAt(this.s, this.lateral, this.pos);
    const yaw = Math.atan2(f.forward.x, f.forward.z) + this.steering * 0.5;
    this.quat.setFromAxisAngle(UP, yaw);
    return { x: this.pos.x, y: this.pos.y + 0.03, z: this.pos.z, qx: this.quat.x, qy: this.quat.y, qz: this.quat.z, qw: this.quat.w };
  }
}

export const AI_ROSTER: Array<{ name: string; paint: string; skill: AiSkill }> = [
  { name: 'Vega', paint: '#c8102e', skill: { topSpeed: 52, cornerAccel: 8.5, accel: 8, brake: 13, lane: -2.2 } },
  { name: 'Okafor', paint: '#e9ecef', skill: { topSpeed: 50, cornerAccel: 8, accel: 7.5, brake: 13, lane: 2.4 } },
  { name: 'Lind', paint: '#16236b', skill: { topSpeed: 48, cornerAccel: 7.5, accel: 7.5, brake: 12, lane: -0.4 } },
  { name: 'Sato', paint: '#3a3f47', skill: { topSpeed: 46, cornerAccel: 7, accel: 7, brake: 12, lane: 1.2 } },
  { name: 'Moreau', paint: '#12a5a0', skill: { topSpeed: 44, cornerAccel: 6.5, accel: 6.5, brake: 11, lane: -1.6 } },
];
