import { clamp, damp } from '../util/math';

const GRAVITY = 9.81;

export interface LeanConfig {
  /** Roll the rider will not exceed (radians). */
  maxLean: number;
  /** Exponential rate (1/s) when leaning further into a corner. */
  leanInRate: number;
  /** Exponential rate (1/s) when standing back up. */
  recoverRate: number;
}

export const SUPERBIKE_LEAN: LeanConfig = {
  maxLean: 0.85,
  leanInRate: 7,
  recoverRate: 5,
};

/**
 * Roll a single-track vehicle must hold so the tyre contact force points
 * through its centre of mass: tan(lean) = lateral acceleration / g, where
 * lateral acceleration is speed times yaw rate. Positive leans towards +X, the
 * left side of a +Z-forward vehicle, which is the inside of a left (positive
 * yaw-rate) turn while driving forwards.
 */
export function balanceLean(speed: number, yawRate: number, maxLean: number): number {
  const lateralAccel = speed * yawRate;
  return clamp(Math.atan2(lateralAccel, GRAVITY), -maxLean, maxLean);
}

/** Advances the visible lean towards `target`; leaning in is quicker than recovering so the bike settles upright without overshoot. */
export function stepLean(current: number, target: number, dt: number, cfg: LeanConfig): number {
  const leaningIn = Math.abs(target) > Math.abs(current) && Math.sign(target) === Math.sign(current || target);
  return damp(current, target, leaningIn ? cfg.leanInRate : cfg.recoverRate, dt);
}
