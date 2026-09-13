import { clamp, damp } from '../util/math';

export interface AudioFrame {
  rpm: number;
  redline: number;
  throttle: number;
  /** 0..1 tyre slip across all wheels. */
  slip: number;
  speed: number;
  nitrous: boolean;
}

/**
 * Synthesised engine and tyre audio on Web Audio. Everything is created lazily
 * from a user gesture because browsers refuse to start an AudioContext otherwise.
 */
export class RaceAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private harmonics: number[] = [];
  private tyreGain: GainNode | null = null;
  private nitrousGain: GainNode | null = null;
  private level = 0;
  private volume: number;

  constructor(volume: number) {
    this.volume = volume;
  }

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.Q.value = 2;
    this.engineFilter = engineFilter;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    engineFilter.connect(this.engineGain).connect(this.master);
    const voices: Array<[OscillatorType, number, number]> = [
      ['sawtooth', 1, 0.5],
      ['square', 0.5, 0.25],
      ['sawtooth', 2, 0.15],
      ['triangle', 3, 0.1],
    ];
    this.oscillators = voices.map(([type, , gain]) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(engineFilter);
      osc.start();
      return osc;
    });
    this.harmonics = voices.map(([, h]) => h);

    const noise = ctx.createBufferSource();
    noise.buffer = whiteNoise(ctx, 2);
    noise.loop = true;
    const tyreFilter = ctx.createBiquadFilter();
    tyreFilter.type = 'bandpass';
    tyreFilter.frequency.value = 900;
    tyreFilter.Q.value = 0.7;
    this.tyreGain = ctx.createGain();
    this.tyreGain.gain.value = 0;
    noise.connect(tyreFilter).connect(this.tyreGain).connect(this.master);
    noise.start();

    const hiss = ctx.createBufferSource();
    hiss.buffer = noise.buffer;
    hiss.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'highpass';
    hissFilter.frequency.value = 3000;
    this.nitrousGain = ctx.createGain();
    this.nitrousGain.gain.value = 0;
    hiss.connect(hissFilter).connect(this.nitrousGain).connect(this.master);
    hiss.start();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master) this.master.gain.value = volume;
  }

  update(f: AudioFrame, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.engineGain || !this.engineFilter || !this.tyreGain || !this.nitrousGain) return;
    const rev = clamp(f.rpm / f.redline, 0.08, 1);
    const fundamental = 28 + rev * 190;
    this.oscillators.forEach((osc, i) => osc.frequency.setTargetAtTime(fundamental * this.harmonics[i], ctx.currentTime, 0.03));
    this.engineFilter.frequency.value = 400 + rev * 2600 + f.throttle * 800;
    this.level = damp(this.level, 0.18 + f.throttle * 0.22 + rev * 0.12, 10, dt);
    this.engineGain.gain.value = this.level;
    this.tyreGain.gain.value = clamp(f.slip, 0, 1) * 0.5 * clamp(f.speed / 8, 0, 1);
    this.nitrousGain.gain.value = damp(this.nitrousGain.gain.value, f.nitrous ? 0.25 : 0, 12, dt);
  }

  mute(): void {
    if (this.engineGain) this.engineGain.gain.value = 0;
    if (this.tyreGain) this.tyreGain.gain.value = 0;
    if (this.nitrousGain) this.nitrousGain.gain.value = 0;
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}

function whiteNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
