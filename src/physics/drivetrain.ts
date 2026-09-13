import { clamp, smoothstep } from '../util/math';

export interface DrivetrainConfig {
  /** Speed (m/s) at which each gear hits the redline; length = gear count. */
  gearTopSpeeds: number[];
  /** Peak tractive force (N) summed over the driven wheels, first gear. */
  maxForce: number;
  idleRpm: number;
  redlineRpm: number;
  /** Extra tractive force (N) while nitrous is active. */
  nitrousForce: number;
  reverseForce: number;
  reverseTopSpeed: number;
  /** Aerodynamic drag coefficient times frontal area times air density / 2 (N per (m/s)^2). */
  dragCoefficient: number;
  rollingResistance: number;
  /** Extra downforce per (m/s)^2 (N). */
  downforceCoefficient: number;
  mass: number;
}

export const SPORTS_COUPE: DrivetrainConfig = {
  gearTopSpeeds: [15, 25, 36, 48, 60, 72],
  maxForce: 9800,
  idleRpm: 1000,
  redlineRpm: 9000,
  nitrousForce: 5200,
  reverseForce: 3500,
  reverseTopSpeed: 9,
  dragCoefficient: 0.42,
  rollingResistance: 0.014,
  downforceCoefficient: 0.9,
  mass: 1450,
};

const UPSHIFT_FRACTION = 0.98;
const DOWNSHIFT_FRACTION = 0.72;

/**
 * Picks a gear for the current forward speed with hysteresis so the car does
 * not oscillate between gears at a shift boundary.
 */
export function selectGear(speed: number, currentGear: number, cfg: DrivetrainConfig): number {
  const tops = cfg.gearTopSpeeds;
  const last = tops.length;
  let gear = clamp(currentGear, 1, last);
  const s = Math.max(0, speed);
  while (gear < last && s > tops[gear - 1] * UPSHIFT_FRACTION) gear++;
  while (gear > 1 && s < tops[gear - 2] * DOWNSHIFT_FRACTION) gear--;
  return gear;
}

/** Engine RPM derived from wheel speed in the chosen gear. */
export function engineRpm(speed: number, gear: number, cfg: DrivetrainConfig, throttle: number): number {
  const tops = cfg.gearTopSpeeds;
  const top = tops[clamp(gear, 1, tops.length) - 1];
  const lower = gear > 1 ? tops[gear - 2] * DOWNSHIFT_FRACTION : 0;
  const frac = clamp((Math.abs(speed) - lower) / Math.max(top - lower, 1e-3), 0, 1);
  const base = cfg.idleRpm + frac * (cfg.redlineRpm - cfg.idleRpm);
  const idleFlare = gear === 1 && Math.abs(speed) < 1 ? throttle * 1800 : 0;
  return clamp(base + idleFlare, cfg.idleRpm, cfg.redlineRpm);
}

/** Tractive force at the driven wheels, positive forwards. */
export function driveForce(throttle: number, speed: number, gear: number, cfg: DrivetrainConfig, nitrous: boolean): number {
  const tops = cfg.gearTopSpeeds;
  const top = tops[clamp(gear, 1, tops.length) - 1];
  const vmax = tops[tops.length - 1];
  if (throttle <= 0 || speed >= vmax) return 0;
  const gearing = Math.pow(tops[0] / top, 0.72);
  const frac = clamp(speed / top, 0, 1);
  const redlineTaper = 1 - 0.55 * frac * frac * frac;
  const vmaxTaper = 1 - smoothstep(vmax * 0.9, vmax, speed);
  const engine = cfg.maxForce * gearing * redlineTaper * vmaxTaper * clamp(throttle, 0, 1);
  return engine + (nitrous ? cfg.nitrousForce : 0);
}

export function reverseForce(brake: number, speed: number, cfg: DrivetrainConfig): number {
  if (brake <= 0) return 0;
  const frac = clamp(-speed / cfg.reverseTopSpeed, 0, 1);
  return -cfg.reverseForce * clamp(brake, 0, 1) * (1 - frac * frac);
}

/** Longitudinal resistance (positive magnitude) opposing motion. */
export function resistanceForce(speed: number, cfg: DrivetrainConfig): number {
  const v = Math.abs(speed);
  return cfg.dragCoefficient * v * v + cfg.rollingResistance * cfg.mass * 9.81 * clamp(v / 0.5, 0, 1);
}

export function downforce(speed: number, cfg: DrivetrainConfig): number {
  return cfg.downforceCoefficient * speed * speed;
}

/** Steering lock shrinks with speed so keyboard steering stays controllable. */
export function maxSteerAngle(speed: number): number {
  const lowSpeedLock = 0.58;
  const highSpeedLock = 0.1;
  return lowSpeedLock + (highSpeedLock - lowSpeedLock) * smoothstep(3, 55, Math.abs(speed));
}
