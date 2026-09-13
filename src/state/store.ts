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

export interface HudState {
  phase: GamePhase;
  loadingProgress: number;
  loadingLabel: string;
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
  drawCalls: 0,
  triangles: 0,
  gpu: '',
  showPerf: true,
  error: null,
});
