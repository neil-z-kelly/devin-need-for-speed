export interface InputState {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  handbrake: boolean;
  nitrous: boolean;
  /** Edge-triggered: true for exactly one simulation step after the press. */
  reset: boolean;
  pauseToggle: boolean;
  cameraToggle: boolean;
}

const KEYMAP = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  nitrous: ['ShiftLeft', 'ShiftRight'],
  reset: ['KeyR'],
  pause: ['Escape', 'KeyP'],
  camera: ['KeyC'],
} as const;

/** Standard gamepad button indices. */
const PAD = { a: 0, x: 2, y: 3, rb: 5, lt: 6, rt: 7, back: 8, start: 9 } as const;

const DEADZONE = 0.12;
const applyDeadzone = (v: number): number =>
  Math.abs(v) < DEADZONE ? 0 : (Math.sign(v) * (Math.abs(v) - DEADZONE)) / (1 - DEADZONE);

/**
 * Keyboard + gamepad input. Keyboard steering is smoothed towards the target so
 * digital keys still produce progressive steering; analog sticks pass through.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressedEdges = new Set<string>();
  private keyboardSteer = 0;
  private gamepadIndex: number | null = null;
  private padWasDown = new Set<number>();
  readonly state: InputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    nitrous: false,
    reset: false,
    pauseToggle: false,
    cameraToggle: false,
  };

  constructor(private readonly target: Window = window) {}

  attach(): void {
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onBlur);
    this.target.addEventListener('gamepadconnected', this.onGamepad);
  }

  detach(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('gamepadconnected', this.onGamepad);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.down.add(e.code);
    this.pressedEdges.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private onBlur = (): void => {
    this.down.clear();
  };

  private onGamepad = (e: GamepadEvent): void => {
    this.gamepadIndex = e.gamepad.index;
  };

  private anyDown(codes: readonly string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  private anyEdge(codes: readonly string[]): boolean {
    return codes.some((c) => this.pressedEdges.has(c));
  }

  /** Samples devices into `state`. Call once per simulation step. */
  update(dt: number): InputState {
    const s = this.state;
    let throttle = this.anyDown(KEYMAP.throttle) ? 1 : 0;
    let brake = this.anyDown(KEYMAP.brake) ? 1 : 0;
    const steerTarget = (this.anyDown(KEYMAP.right) ? 1 : 0) - (this.anyDown(KEYMAP.left) ? 1 : 0);
    const steerRate = steerTarget === 0 ? 6 : 3.5;
    this.keyboardSteer += (steerTarget - this.keyboardSteer) * Math.min(1, steerRate * dt);
    if (Math.abs(this.keyboardSteer) < 0.001) this.keyboardSteer = 0;
    let steer = this.keyboardSteer;
    let handbrake = this.anyDown(KEYMAP.handbrake);
    let nitrous = this.anyDown(KEYMAP.nitrous);
    let reset = this.anyEdge(KEYMAP.reset);
    let pauseToggle = this.anyEdge(KEYMAP.pause);
    let cameraToggle = this.anyEdge(KEYMAP.camera);

    const pad = this.readGamepad();
    if (pad) {
      const stick = applyDeadzone(pad.axes[0] ?? 0);
      if (Math.abs(stick) > 0) steer = stick;
      throttle = Math.max(throttle, pad.buttons[PAD.rt]?.value ?? 0);
      brake = Math.max(brake, pad.buttons[PAD.lt]?.value ?? 0);
      handbrake ||= pad.buttons[PAD.a]?.pressed ?? false;
      nitrous ||= pad.buttons[PAD.x]?.pressed ?? false;
      const nowDown = new Set<number>([PAD.y, PAD.back, PAD.rb, PAD.start].filter((b) => pad.buttons[b]?.pressed));
      const edge = (b: number) => nowDown.has(b) && !this.padWasDown.has(b);
      reset ||= edge(PAD.y) || edge(PAD.back);
      cameraToggle ||= edge(PAD.rb);
      pauseToggle ||= edge(PAD.start);
      this.padWasDown = nowDown;
    }

    s.throttle = throttle;
    s.brake = brake;
    s.steer = Math.max(-1, Math.min(1, steer));
    s.handbrake = handbrake;
    s.nitrous = nitrous;
    s.reset = reset;
    s.pauseToggle = pauseToggle;
    s.cameraToggle = cameraToggle;
    this.pressedEdges.clear();
    return s;
  }

  private readGamepad(): Gamepad | null {
    if (this.gamepadIndex === null || typeof navigator.getGamepads !== 'function') return null;
    return navigator.getGamepads()[this.gamepadIndex] ?? null;
  }
}
