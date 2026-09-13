export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  /** Average of the slowest 1% of frames in the window (ms). */
  worst1PercentMs: number;
  drawCalls: number;
  triangles: number;
  simSteps: number;
  gpu: string;
  resolution: string;
  quality: string;
  sampleCount: number;
}

export interface PerfGlobal {
  snapshot: () => PerfSnapshot;
  history: number[];
}

declare global {
  interface Window {
    __nfsPerf?: PerfGlobal;
  }
}

/**
 * Rolling frame-time statistics. Exposed on `window.__nfsPerf` so automated
 * measurement (Playwright) can read the same numbers the on-screen panel shows.
 */
export class PerfMonitor {
  private readonly frameTimes: number[] = [];
  private readonly windowSize: number;
  private lastNow: number | null = null;
  drawCalls = 0;
  triangles = 0;
  simSteps = 0;
  gpu = 'unknown';
  resolution = '';
  quality = '';

  constructor(windowSize = 240) {
    this.windowSize = windowSize;
    if (typeof window !== 'undefined') {
      window.__nfsPerf = { snapshot: () => this.snapshot(), history: this.frameTimes };
    }
  }

  beginFrame(now: number): void {
    if (this.lastNow !== null) {
      this.frameTimes.push(now - this.lastNow);
      if (this.frameTimes.length > this.windowSize) this.frameTimes.shift();
    }
    this.lastNow = now;
  }

  reset(): void {
    this.frameTimes.length = 0;
    this.lastNow = null;
  }

  snapshot(): PerfSnapshot {
    const n = this.frameTimes.length;
    if (n === 0) {
      return {
        fps: 0,
        frameMs: 0,
        worst1PercentMs: 0,
        drawCalls: this.drawCalls,
        triangles: this.triangles,
        simSteps: this.simSteps,
        gpu: this.gpu,
        resolution: this.resolution,
        quality: this.quality,
        sampleCount: 0,
      };
    }
    let sum = 0;
    for (const t of this.frameTimes) sum += t;
    const sorted = [...this.frameTimes].sort((a, b) => b - a);
    const worstCount = Math.max(1, Math.round(n * 0.01));
    let worstSum = 0;
    for (let i = 0; i < worstCount; i++) worstSum += sorted[i];
    const frameMs = sum / n;
    return {
      fps: 1000 / frameMs,
      frameMs,
      worst1PercentMs: worstSum / worstCount,
      drawCalls: this.drawCalls,
      triangles: this.triangles,
      simSteps: this.simSteps,
      gpu: this.gpu,
      resolution: this.resolution,
      quality: this.quality,
      sampleCount: n,
    };
  }
}
