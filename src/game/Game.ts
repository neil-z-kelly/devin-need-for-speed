import { Quaternion, Vector3 } from 'three';
import { Input } from '../input/Input';
import { PhysicsWorld, loadRapier } from '../physics/PhysicsWorld';
import { FERRARI_SPEC, VehicleSim, type Pose } from '../physics/VehicleSim';
import { CarModel } from '../render/CarModel';
import { ChaseCamera } from '../render/ChaseCamera';
import { Renderer, probeGpu } from '../render/Renderer';
import { TrackScene } from '../render/TrackScene';
import { PAINT_COLORS, QUALITY_PROFILES, hasSavedSettings, isQuality, settingsStore, type QualityLevel, type Settings } from '../state/settings';
import { hudStore } from '../state/store';
import { PerfMonitor } from '../telemetry/PerfMonitor';
import { HARBOR_CIRCUIT, Track } from '../track/track';
import { KMH_PER_MS } from '../util/math';
import { FixedStepLoop } from './FixedStepLoop';

const STEP_DT = 1 / 60;
const CAR_URL = '/assets/car/ferrari.glb';
const ENV_URL = '/assets/env/venice_sunset_1k.hdr';

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe/i;

/** `?quality=` overrides everything (used by the FPS measurement script); first launch on a software rasterizer starts low. */
function pickQuality(gpu: string): QualityLevel {
  const requested = new URLSearchParams(window.location.search).get('quality');
  if (isQuality(requested)) return requested;
  if (!hasSavedSettings() && SOFTWARE_GPU.test(gpu)) return 'low';
  return settingsStore.get().quality;
}

const tmpPos = new Vector3();
const tmpQuat = new Quaternion();
const prevQuat = new Quaternion();

/**
 * Owns the simulation, rendering and input for one play session. React only
 * observes `hudStore`; nothing here runs inside React's render cycle.
 */
export class Game {
  private renderer: Renderer | null = null;
  private physics: PhysicsWorld | null = null;
  private vehicle: VehicleSim | null = null;
  private car: CarModel | null = null;
  private trackScene: TrackScene | null = null;
  private chase: ChaseCamera | null = null;
  private loop: FixedStepLoop | null = null;
  private readonly input = new Input();
  private readonly perf = new PerfMonitor();
  private readonly track = new Track(HARBOR_CIRCUIT);
  private nearestHint = 0;
  private offTrackTime = 0;
  private elapsed = 0;
  private hudAccumulator = 0;
  private unsubscribeSettings: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  async start(): Promise<void> {
    const setLoading = (progress: number, label: string) => hudStore.set({ loadingProgress: progress, loadingLabel: label });

    setLoading(0.05, 'Starting renderer');
    settingsStore.set({ quality: pickQuality(probeGpu()) });
    const settings = settingsStore.get();
    const profile = QUALITY_PROFILES[settings.quality];
    const renderer = new Renderer(this.canvas, profile);
    this.renderer = renderer;
    this.perf.gpu = renderer.info.gpu;
    hudStore.set({ gpu: renderer.info.gpu });

    setLoading(0.15, 'Loading physics');
    const R = await loadRapier();
    if (this.disposed) return;
    const physics = new PhysicsWorld(R, STEP_DT);
    this.physics = physics;

    setLoading(0.3, 'Loading environment lighting');
    await renderer.loadEnvironment(ENV_URL);
    if (this.disposed) return;

    setLoading(0.45, 'Building Harbor Circuit');
    const trackScene = new TrackScene(this.track, physics, profile, renderer.environment);
    renderer.scene.add(trackScene.root);
    this.trackScene = trackScene;

    setLoading(0.6, 'Loading car');
    const car = await CarModel.load(CAR_URL, { envMap: renderer.environment, castShadow: profile.shadows, headlights: profile.streetLightCount > 0 }, (f) =>
      setLoading(0.6 + f * 0.35, 'Loading car'),
    );
    if (this.disposed) return;
    car.setPaint(PAINT_COLORS[settings.paintIndex].hex);
    renderer.scene.add(car.root);
    this.car = car;

    const spawn = this.spawnPose(6, -3);
    const vehicle = new VehicleSim(physics, FERRARI_SPEC, spawn);
    this.vehicle = vehicle;
    for (let i = 0; i < 30; i++) {
      vehicle.step(STEP_DT, { throttle: 0, brake: 0, steer: 0, handbrake: true, nitrous: false });
      physics.step();
    }

    const chase = new ChaseCamera(renderer.camera);
    this.chase = chase;
    this.syncCarVisual(1);
    chase.snap({ position: car.root.position, quaternion: car.root.quaternion, speed: 0 });

    this.unsubscribeSettings = settingsStore.subscribe(() => this.applySettings(settingsStore.get()));
    this.input.attach();
    window.addEventListener('resize', this.onResize);
    renderer.resize();

    setLoading(1, 'Ready');
    hudStore.set({ phase: 'racing', showPerf: settings.showPerf });

    this.loop = new FixedStepLoop({ simulate: (dt) => this.simulate(dt), render: (alpha, frameDt) => this.render(alpha, frameDt) }, STEP_DT);
    this.loop.start();
  }

  private readonly onResize = () => this.renderer?.resize();

  private applySettings(s: Settings): void {
    this.car?.setPaint(PAINT_COLORS[s.paintIndex].hex);
    hudStore.set({ showPerf: s.showPerf });
  }

  private spawnPose(s: number, lateral: number): Pose {
    const frame = this.track.frameAtS(s);
    const pos = this.track.positionAt(s, lateral);
    const yaw = Math.atan2(frame.forward.x, frame.forward.z);
    const q = tmpQuat.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    return { x: pos.x, y: pos.y + 0.6, z: pos.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
  }

  private simulate(dt: number): void {
    const vehicle = this.vehicle;
    const physics = this.physics;
    if (!vehicle || !physics) return;
    this.input.update(dt);
    const st = this.input.state;
    const phase = hudStore.get().phase;

    if (st.pauseToggle) {
      if (phase === 'racing') hudStore.set({ phase: 'paused' });
      else if (phase === 'paused') hudStore.set({ phase: 'racing' });
    }
    if (st.cameraToggle) this.chase?.cycle();
    if (phase !== 'racing') return;

    this.elapsed += dt;
    const p = vehicle.position();
    const near = this.track.nearest(p.x, p.z, this.nearestHint);
    this.nearestHint = near.index;
    const halfWidth = near.frame.width / 2;
    const offTrack = Math.abs(near.lateral) > halfWidth + 6 || p.y < near.frame.position.y - 8 || !vehicle.upright();
    this.offTrackTime = offTrack ? this.offTrackTime + dt : 0;
    if (st.reset || this.offTrackTime > 2.5) {
      vehicle.teleport(this.spawnPose(near.s, 0));
      this.offTrackTime = 0;
    }

    const fwd = near.frame.forward;
    const v = vehicle.velocity();
    const wrongWay = v.x * fwd.x + v.z * fwd.z < -4;

    vehicle.step(dt, { throttle: st.throttle, brake: st.brake, steer: st.steer, handbrake: st.handbrake, nitrous: st.nitrous });
    physics.step();
    this.perf.simSteps++;

    hudStore.set({ wrongWay, handbrake: st.handbrake });
  }

  private render(alpha: number, frameDt: number): void {
    const renderer = this.renderer;
    const car = this.car;
    const vehicle = this.vehicle;
    const chase = this.chase;
    if (!renderer || !car || !vehicle || !chase || !this.trackScene) return;
    this.perf.beginFrame(performance.now());

    this.syncCarVisual(alpha);
    car.updateWheels(vehicle.wheels, vehicle.spec);
    car.setBraking(this.input.state.brake > 0 && !vehicle.reversing);
    chase.update({ position: car.root.position, quaternion: car.root.quaternion, speed: vehicle.speed }, frameDt);
    this.trackScene.update(this.elapsed);
    renderer.updateLighting(car.root.position, this.trackScene.lamps);
    renderer.render();

    this.perf.drawCalls = renderer.drawCalls;
    this.perf.triangles = renderer.triangles;
    this.hudAccumulator += frameDt;
    if (this.hudAccumulator >= 0.1) {
      this.hudAccumulator = 0;
      const snap = this.perf.snapshot();
      this.perf.resolution = renderer.resolutionLabel();
      this.perf.quality = settingsStore.get().quality;
      hudStore.set({
        speedKmh: Math.abs(vehicle.speed) * KMH_PER_MS,
        rpm: vehicle.rpm,
        gear: vehicle.reversing ? 0 : vehicle.gear,
        nitrous: vehicle.nitrous,
        nitrousActive: vehicle.nitrousActive,
        fps: snap.fps,
        frameMs: snap.frameMs,
        worst1PercentMs: snap.worst1PercentMs,
        drawCalls: snap.drawCalls,
        triangles: snap.triangles,
      });
    }
  }

  private syncCarVisual(alpha: number): void {
    const vehicle = this.vehicle;
    const car = this.car;
    if (!vehicle || !car) return;
    const a = vehicle.prevPose;
    const b = vehicle.pose;
    tmpPos.set(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha);
    prevQuat.set(a.qx, a.qy, a.qz, a.qw);
    tmpQuat.set(b.qx, b.qy, b.qz, b.qw);
    prevQuat.slerp(tmpQuat, alpha);
    car.root.position.copy(tmpPos);
    car.root.quaternion.copy(prevQuat);
  }

  dispose(): void {
    this.disposed = true;
    this.loop?.stop();
    window.removeEventListener('resize', this.onResize);
    this.unsubscribeSettings?.();
    this.input.detach();
    this.vehicle?.dispose();
    this.car?.dispose();
    this.trackScene?.dispose();
    this.physics?.dispose();
    this.renderer?.dispose();
  }
}
