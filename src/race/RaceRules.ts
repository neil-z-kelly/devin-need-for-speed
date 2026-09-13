import { deltaS, wrapS } from '../track/track';

export interface CarProgress {
  /** Index of the next checkpoint the car must pass; 0 is the start/finish line. */
  nextCheckpoint: number;
  /** Time the current lap started; null until the line is first crossed. */
  lapStart: number | null;
  lapTimes: number[];
  finishTime: number | null;
  /** Latest track distance, used for standings. */
  s: number;
}

export interface RaceConfig {
  checkpointS: number[];
  trackLength: number;
  laps: number;
}

/** A checkpoint counts as passed while the car is within this many metres after it. */
const CAPTURE_WINDOW = 60;

export function newProgress(s: number): CarProgress {
  return { nextCheckpoint: 0, lapStart: null, lapTimes: [], finishTime: null, s };
}

/**
 * Ordered checkpoint logic. Cars start behind the line so the first crossing
 * of checkpoint 0 begins lap 1; every later crossing records a lap time.
 */
export function updateProgress(p: CarProgress, cfg: RaceConfig, s: number, time: number): CarProgress {
  const next = { ...p, s };
  if (p.finishTime !== null) return next;
  const ahead = deltaS(cfg.checkpointS[p.nextCheckpoint], s, cfg.trackLength);
  if (ahead < 0 || ahead > CAPTURE_WINDOW) return next;
  next.nextCheckpoint = (p.nextCheckpoint + 1) % cfg.checkpointS.length;
  if (p.nextCheckpoint !== 0) return next;
  if (p.lapStart !== null) next.lapTimes = [...p.lapTimes, time - p.lapStart];
  next.lapStart = time;
  if (next.lapTimes.length >= cfg.laps) next.finishTime = time;
  return next;
}

/** Current lap number for display, 1-based once the line has been crossed. */
export function currentLap(p: CarProgress): number {
  return p.lapStart === null ? 0 : p.lapTimes.length + 1;
}

/** Distance covered since the start line, monotonic across the line so standings do not flicker. */
export function raceDistance(p: CarProgress, cfg: RaceConfig): number {
  if (p.finishTime !== null) return cfg.laps * cfg.trackLength;
  const along = wrapS(p.s - cfg.checkpointS[0], cfg.trackLength);
  const laps = p.lapStart === null ? -1 : p.lapTimes.length;
  return laps * cfg.trackLength + along;
}

/** Indices of `cars` in race order: finished cars first by time, then by distance. */
export function standings(cars: readonly CarProgress[], cfg: RaceConfig): number[] {
  return cars
    .map((p, i) => ({ i, p, d: raceDistance(p, cfg) }))
    .sort((a, b) => {
      if (a.p.finishTime !== null && b.p.finishTime !== null) return a.p.finishTime - b.p.finishTime;
      if (a.p.finishTime !== null) return -1;
      if (b.p.finishTime !== null) return 1;
      return b.d - a.d;
    })
    .map((x) => x.i);
}

export function bestLap(p: CarProgress): number | null {
  return p.lapTimes.length === 0 ? null : Math.min(...p.lapTimes);
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
