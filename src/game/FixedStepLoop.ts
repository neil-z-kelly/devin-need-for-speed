export interface FixedStepCallbacks {
  simulate: (dt: number) => void;
  render: (alpha: number, frameDt: number) => void;
}

/**
 * Accumulator-based fixed timestep. Simulation always advances in `stepDt`
 * increments regardless of render frame rate; `render` receives the
 * interpolation factor between the previous and current simulation states.
 */
export class FixedStepLoop {
  private accumulator = 0;
  private lastTime: number | null = null;
  private rafId = 0;
  running = false;

  constructor(
    private readonly callbacks: FixedStepCallbacks,
    readonly stepDt = 1 / 60,
    readonly maxStepsPerFrame = 15,
    readonly maxFrameDt = 0.25,
  ) {}

  /** Advances the loop by a wall-clock delta. Returns the number of simulation steps run. */
  advance(frameDt: number): number {
    const dt = Math.min(Math.max(frameDt, 0), this.maxFrameDt);
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.stepDt && steps < this.maxStepsPerFrame) {
      this.callbacks.simulate(this.stepDt);
      this.accumulator -= this.stepDt;
      steps++;
    }
    if (steps === this.maxStepsPerFrame && this.accumulator >= this.stepDt) {
      this.accumulator = 0;
    }
    this.callbacks.render(this.accumulator / this.stepDt, dt);
    return steps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = null;
    const tick = (now: number) => {
      if (!this.running) return;
      const frameDt = this.lastTime === null ? this.stepDt : (now - this.lastTime) / 1000;
      this.lastTime = now;
      this.advance(frameDt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
