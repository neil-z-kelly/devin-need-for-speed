import { useSyncExternalStore } from 'react';

/**
 * Minimal external store. The simulation writes into it at most once per
 * rendered frame; React components subscribe with `useStore`. Keeping the game
 * loop out of React's update cycle is deliberate: React only re-renders the HUD
 * when a value it reads actually changes.
 */
export class Store<T extends object> {
  private listeners = new Set<() => void>();
  private state: T;

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  set(patch: Partial<T>): void {
    let changed = false;
    for (const key in patch) {
      if (!Object.is(this.state[key], patch[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export function useStore<T extends object, R>(store: Store<T>, selector: (s: T) => R): R {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}

export type GamePhase = 'loading' | 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';

export interface Standing {
  name: string;
  paint: string;
  isPlayer: boolean;
  lapsDone: number;
  metresBehind: number;
  finishTime: number | null;
}

export interface RaceResult {
  position: number;
  lapTimes: number[];
  totalTime: number;
  bestLap: number | null;
  newBestLap: boolean;
  newBestRace: boolean;
}

export interface HudState {
  phase: GamePhase;
  loadingProgress: number;
  loadingLabel: string;
  /** Seconds left in the countdown; 0 shows GO, negative hides the banner. */
  countdown: number;
  lap: number;
  totalLaps: number;
  lapTime: number;
  lastLapTime: number | null;
  bestLapTime: number | null;
  position: number;
  standings: Standing[];
  result: RaceResult | null;
  speedKmh: number;
  rpm: number;
  gear: number;
  nitrous: number;
  nitrousActive: boolean;
  handbrake: boolean;
  wrongWay: boolean;
  fps: number;
  frameMs: number;
  worst1PercentMs: number;
  scriptMs: number;
  drawCalls: number;
  triangles: number;
  gpu: string;
  showPerf: boolean;
  error: string | null;
}

export const hudStore = new Store<HudState>({
  phase: 'loading',
  loadingProgress: 0,
  loadingLabel: 'Starting',
  countdown: 3,
  lap: 0,
  totalLaps: 3,
  lapTime: 0,
  lastLapTime: null,
  bestLapTime: null,
  position: 1,
  standings: [],
  result: null,
  speedKmh: 0,
  rpm: 0,
  gear: 1,
  nitrous: 1,
  nitrousActive: false,
  handbrake: false,
  wrongWay: false,
  fps: 0,
  frameMs: 0,
  worst1PercentMs: 0,
  scriptMs: 0,
  drawCalls: 0,
  triangles: 0,
  gpu: '',
  showPerf: true,
  error: null,
});
