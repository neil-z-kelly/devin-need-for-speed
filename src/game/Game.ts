import { Quaternion, Vector3, type Group } from 'three';
import { RaceAudio } from '../audio/RaceAudio';
import { Input } from '../input/Input';
import { PhysicsWorld, loadRapier } from '../physics/PhysicsWorld';
import { FERRARI_SPEC, type Pose } from '../physics/VehicleSim';
import { AI_ROSTER } from '../race/AiDriver';
import { AiCar } from '../race/AiCar';
import { bestLap, newProgress, raceDistance, standings, updateProgress, type CarProgress, type RaceConfig } from '../race/RaceRules';
import { CarModel } from '../render/CarModel';
import { ChaseCamera } from '../render/ChaseCamera';
import { Renderer, probeGpu } from '../render/Renderer';
import { TrackScene } from '../render/TrackScene';
import { loadBestTimes, recordBestTimes, type BestTimes } from '../state/bestTimes';
import { PAINT_COLORS, QUALITY_PROFILES, hasSavedSettings, isQuality, settingsStore, type CarDetail, type QualityLevel, type Settings } from '../state/settings';
import { hudStore, type Standing } from '../state/store';
import { PerfMonitor } from '../telemetry/PerfMonitor';
import { HARBOR_CIRCUIT, Track, wrapS } from '../track/track';
import { Minimap } from '../ui/Minimap';
import { KMH_PER_MS } from '../util/math';
import { FixedStepLoop } from './FixedStepLoop';
import { PlayerVehicle } from './PlayerVehicle';

/** Player car relative to the track; exposed on `window.__nfsDrive` for scripted driving and handling measurements. */
export interface DriveTelemetry {
  s: number;
  lateral: number;
  /** Radians the car points away from the road direction; positive is left, the same side as positive `lateral`. */
  headingError: number;
  /** Nose-up angle in radians; negative when the vehicle dips forward. */
  pitch: number;
  speed: number;
  lap: number;
}

declare global {
  interface Window {
    __nfsDrive?: () => DriveTelemetry;
    /** Places the player on the centreline at track distance `s`, for inspecting sections. */
    __nfsTeleport?: (s: number) => void;
  }
}

const STEP_DT = 1 / 60;
const CAR_URLS: Record<CarDetail, { player: string; opponent: string }> = {
  full: { player: '/assets/car/ferrari.glb', opponent: '/assets/car/ferrari.glb' },
  reduced: { player: '/assets/car/ferrari.glb', opponent: '/assets/car/ferrari_lod.glb' },
};
const ENV_URL = '/assets/env/venice_sunset_1k.hdr';
const COUNTDOWN_SECONDS = 3;
const GRID_GAP = 7;
const GRID_BEHIND_LINE = 12;

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe/i;

/** `?quality=` overrides everything (used by the FPS measurement script); first launch on a software rasterizer starts low. */
function pickQuality(gpu: string): QualityLevel {
  const requested = new URLSearchParams(window.location.search).get('quality');
  if (isQuality(requested)) return requested;
  if (!hasSavedSettings() && SOFTWARE_GPU.test(gpu)) return 'low';
  return settingsStore.get().quality;
}

const tmpQuat = new Quaternion();
const UP = new Vector3(0, 1, 0);
const HOLD = { throttle: 0, brake: 0, steer: 0, handbrake: true, nitrous: false };

/**
 * Owns the simulation, rendering, race rules and input for one play session.
 * React only observes `hudStore` and calls the phase transitions below.
 */
export class Game {
  private renderer: Renderer | null = null;
  private physics: PhysicsWorld | null = null;
  private player: PlayerVehicle | null = null;
  private carAsset: Group | null = null;
  private trackScene: TrackScene | null = null;
  private chase: ChaseCamera | null = null;
  private loop: FixedStepLoop | null = null;
  private minimap: Minimap | null = null;
  private aiCars: AiCar[] = [];
  private readonly input = new Input();
  private readonly perf = new PerfMonitor();
  private readonly audio = new RaceAudio(settingsStore.get().masterVolume);
  private readonly track = new Track(HARBOR_CIRCUIT);
  private raceConfig: RaceConfig = { checkpointS: this.track.checkpointS, trackLength: this.track.length, laps: settingsStore.get().laps };
  private playerProgress: CarProgress = newProgress(0);
  private best: BestTimes = loadBestTimes();
  private nearestHint = 0;
  private offTrackTime = 0;
  private raceTime = 0;
  private countdown = 0;
  private elapsed = 0;
  private hudAccumulator = 0;
  private unsubscribeSettings: (() => void) | null = null;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly minimapCanvas: HTMLCanvasElement,
  ) {}

  async start(): Promise<void> {
    const setLoading = (progress: number, label: string) => hudStore.set({ loadingProgress: progress, loadingLabel: label });

    setLoading(0.05, 'Starting renderer');
    settingsStore.set({ quality: pickQuality(probeGpu()) });
    const settings = settingsStore.get();
    const profile = QUALITY_PROFILES[settings.quality];
    const renderer = new Renderer(this.canvas, profile);
    this.renderer = renderer;
    this.perf.gpu = renderer.info.gpu;
    hudStore.set({ gpu: renderer.info.gpu, bestLapTime: this.best.bestLap });

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
    this.minimap = new Minimap(this.minimapCanvas, this.track);

    setLoading(0.6, 'Loading car');
    const urls = CAR_URLS[profile.carDetail];
    const asset = await CarModel.loadAsset(urls.player, (f) => setLoading(0.6 + f * 0.35, 'Loading car'));
    if (this.disposed) return;
    const opponentAsset = urls.opponent === urls.player ? asset : await CarModel.loadAsset(urls.opponent);
    if (this.disposed) return;
    this.carAsset = asset;
    this.spawnPlayer(settings.vehicle);

    this.aiCars = AI_ROSTER.map((entry, i) => {
      const model = new CarModel(opponentAsset, { envMap: renderer.environment, castShadow: profile.shadows, headlights: false });
      model.setPaint(entry.paint);
      renderer.scene.add(model.root);
      const pose = this.gridPose(i);
      return new AiCar(this.track, physics, FERRARI_SPEC, model, entry.skill, pose.s, pose.lateral);
    });
    this.placeGrid();

    const chase = new ChaseCamera(renderer.camera);
    this.chase = chase;
    this.snapCamera();

    this.unsubscribeSettings = settingsStore.subscribe(() => this.applySettings(settingsStore.get()));
    window.__nfsDrive = () => this.driveTelemetry();
    window.__nfsTeleport = (s) => this.player!.sim.teleport(this.trackPose(s, 0));
    this.input.attach();
    window.addEventListener('resize', this.onResize);
    renderer.resize();

    setLoading(1, 'Ready');
    hudStore.set({ phase: 'menu', showPerf: settings.showPerf });

    this.loop = new FixedStepLoop(
      {
        simulate: (dt) => this.perf.time(() => this.simulate(dt)),
        render: (alpha, frameDt) => {
          this.perf.time(() => this.render(alpha, frameDt));
          this.perf.endFrame(performance.now());
        },
      },
      STEP_DT,
    );
    this.loop.start();
  }

  startRace(): void {
    this.audio.start();
    this.raceConfig = { ...this.raceConfig, laps: settingsStore.get().laps };
    this.placeGrid();
    this.raceTime = 0;
    this.countdown = COUNTDOWN_SECONDS;
    this.snapCamera();
    hudStore.set({ phase: 'countdown', countdown: COUNTDOWN_SECONDS, result: null, lap: 0, totalLaps: this.raceConfig.laps, lapTime: 0, lastLapTime: null, wrongWay: false });
    this.canvas.focus();
  }

  resume(): void {
    hudStore.set({ phase: 'racing' });
    this.canvas.focus();
  }

  toMenu(): void {
    this.audio.mute();
    this.placeGrid();
    hudStore.set({ phase: 'menu', result: null });
  }

  private readonly onResize = () => this.renderer?.resize();

  private applySettings(s: Settings): void {
    if (this.player && s.vehicle !== this.player.kind && hudStore.get().phase === 'menu') {
      this.spawnPlayer(s.vehicle);
      this.snapCamera();
    }
    this.player?.visual.setPaint(PAINT_COLORS[s.paintIndex].hex);
    this.audio.setVolume(s.masterVolume);
    hudStore.set({ showPerf: s.showPerf });
  }

  /** Builds (or rebuilds) the player's physics body and model for the selected vehicle and parks it on the grid. */
  private spawnPlayer(kind: Settings['vehicle']): void {
    const renderer = this.renderer!;
    const profile = QUALITY_PROFILES[settingsStore.get().quality];
    if (this.player) {
      renderer.scene.remove(this.player.root);
      this.player.dispose();
    }
    const slot = this.gridPose(AI_ROSTER.length);
    const player = new PlayerVehicle(kind, {
      physics: this.physics!,
      spawn: this.trackPose(slot.s, slot.lateral),
      carAsset: this.carAsset!,
      envMap: renderer.environment,
      castShadow: profile.shadows,
      headlights: profile.streetLightCount > 0,
    });
    player.visual.setPaint(PAINT_COLORS[settingsStore.get().paintIndex].hex);
    renderer.scene.add(player.root);
    this.player = player;
    this.placeGrid();
    player.syncVisual(1, 0);
  }

  private snapCamera(): void {
    const root = this.player?.root;
    if (root) this.chase?.snap({ position: root.position, quaternion: root.quaternion, speed: 0 });
  }

  /** Grid slot 0 is the front row; the player takes the last slot. */
  private gridPose(slot: number): { s: number; lateral: number } {
    return { s: wrapS(this.track.length - GRID_BEHIND_LINE - slot * GRID_GAP, this.track.length), lateral: slot % 2 === 0 ? -2.4 : 2.4 };
  }

  private placeGrid(): void {
    this.aiCars.forEach((ai, i) => {
      const pose = this.gridPose(i);
      ai.driver.reset(pose.s, pose.lateral);
      ai.progress = newProgress(pose.s);
      ai.place();
    });
    const player = this.gridPose(this.aiCars.length);
    const vehicle = this.player!.sim;
    vehicle.teleport(this.trackPose(player.s, player.lateral));
    for (let i = 0; i < 30; i++) {
      vehicle.step(STEP_DT, HOLD);
      this.physics!.step();
    }
    this.playerProgress = newProgress(player.s);
    this.nearestHint = this.track.nearest(vehicle.position().x, vehicle.position().z).index;
    this.offTrackTime = 0;
  }

  private driveTelemetry(): DriveTelemetry {
    const vehicle = this.player!.sim;
    const p = vehicle.position();
    const near = this.track.nearest(p.x, p.z, this.nearestHint);
    const roadYaw = Math.atan2(near.frame.forward.x, near.frame.forward.z);
    const yawDiff = roadYaw - vehicle.heading();
    const headingError = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
    return {
      s: near.s,
      lateral: near.lateral,
      headingError,
      pitch: vehicle.pitch(),
      speed: vehicle.speed,
      lap: this.playerProgress.lapTimes.length,
    };
  }

  private trackPose(s: number, lateral: number): Pose {
    const frame = this.track.frameAtS(s);
    const pos = this.track.positionAt(s, lateral);
    const q = tmpQuat.setFromAxisAngle(UP, Math.atan2(frame.forward.x, frame.forward.z));
    return { x: pos.x, y: pos.y + 0.6, z: pos.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w };
  }

  private simulate(dt: number): void {
    const vehicle = this.player?.sim;
    const physics = this.physics;
    if (!vehicle || !physics) return;
    this.input.update(dt);
    const st = this.input.state;
    const phase = hudStore.get().phase;

    if (st.pauseToggle && phase === 'racing') hudStore.set({ phase: 'paused' });
    else if (st.pauseToggle && phase === 'paused') this.resume();
    if (st.cameraToggle) this.chase?.cycle();

    if (phase === 'countdown') {
      this.countdown -= dt;
      vehicle.step(dt, HOLD);
      physics.step();
      hudStore.set({ countdown: Math.max(this.countdown, 0) });
      if (this.countdown <= 0) hudStore.set({ phase: 'racing' });
      return;
    }
    if (phase !== 'racing') {
      this.audio.mute();
      return;
    }

    this.raceTime += dt;
    const p = vehicle.position();
    const near = this.track.nearest(p.x, p.z, this.nearestHint);
    this.nearestHint = near.index;
    const offRoad = Math.abs(near.lateral) > near.frame.width / 2 + 2.5 || p.y < near.frame.position.y - 8;
    const stuck = st.throttle > 0 && Math.abs(vehicle.speed) < 0.5;
    this.offTrackTime = offRoad || stuck || !vehicle.upright() ? this.offTrackTime + dt : 0;
    if (st.reset || this.offTrackTime > 2.5) {
      vehicle.teleport(this.trackPose(near.s, 0));
      this.offTrackTime = 0;
    }

    const fwd = near.frame.forward;
    const v = vehicle.velocity();
    const wrongWay = v.x * fwd.x + v.z * fwd.z < -4;

    vehicle.step(dt, { throttle: st.throttle, brake: st.brake, steer: st.steer, handbrake: st.handbrake, nitrous: st.nitrous });
    const obstacles = [...this.aiCars.map((ai) => ai.obstacle()), { s: near.s, lateral: near.lateral, speed: vehicle.speed }];
    this.aiCars.forEach((ai, i) => {
      ai.step(dt, obstacles.filter((_, j) => j !== i));
      ai.progress = updateProgress(ai.progress, this.raceConfig, ai.driver.s, this.raceTime);
    });
    physics.step();
    this.perf.simSteps++;

    this.playerProgress = updateProgress(this.playerProgress, this.raceConfig, near.s, this.raceTime);
    this.audio.update(
      {
        rpm: vehicle.rpm,
        redline: vehicle.spec.drivetrain.redlineRpm,
        throttle: st.throttle,
        slip: Math.max(...vehicle.wheels.map((w) => w.slip)),
        speed: Math.abs(vehicle.speed),
        nitrous: vehicle.nitrousActive,
      },
      dt,
    );
    hudStore.set({ wrongWay, handbrake: st.handbrake, countdown: this.raceTime < 1 ? 0 : -1 });
    if (this.playerProgress.finishTime !== null) this.finish();
  }

  private finish(): void {
    const total = this.playerProgress.finishTime!;
    const lap = bestLap(this.playerProgress);
    const record = recordBestTimes(this.best, lap, total);
    this.best = record.best;
    this.audio.mute();
    hudStore.set({
      phase: 'finished',
      bestLapTime: this.best.bestLap,
      result: {
        position: this.standingsPatch().position,
        lapTimes: this.playerProgress.lapTimes,
        totalTime: total,
        bestLap: lap,
        newBestLap: record.newBestLap,
        newBestRace: record.newBestRace,
      },
    });
  }

  private render(alpha: number, frameDt: number): void {
    const renderer = this.renderer;
    const player = this.player;
    const chase = this.chase;
    if (!renderer || !player || !chase || !this.trackScene) return;
    const vehicle = player.sim;
    const car = player.root;

    this.elapsed += frameDt;
    player.syncVisual(alpha, frameDt);
    player.visual.setBraking(this.input.state.brake > 0 && !vehicle.reversing);
    const target = { position: car.position, quaternion: car.quaternion, speed: vehicle.speed };
    if (hudStore.get().phase === 'menu') chase.orbit(target, this.elapsed);
    else chase.update(target, frameDt);
    this.trackScene.update(this.elapsed);
    renderer.updateLighting(car.position, this.trackScene.lamps);
    renderer.render();

    this.perf.drawCalls = renderer.drawCalls;
    this.perf.triangles = renderer.triangles;
    this.hudAccumulator += frameDt;
    if (this.hudAccumulator < 0.1) return;
    this.hudAccumulator = 0;
    const snap = this.perf.snapshot();
    this.perf.resolution = renderer.resolutionLabel();
    this.perf.quality = settingsStore.get().quality;
    const lapStart = this.playerProgress.lapStart;
    const lapTimes = this.playerProgress.lapTimes;
    hudStore.set({
      speedKmh: Math.abs(vehicle.speed) * KMH_PER_MS,
      rpm: vehicle.rpm,
      gear: vehicle.reversing ? 0 : vehicle.gear,
      nitrous: vehicle.nitrous,
      nitrousActive: vehicle.nitrousActive,
      fps: snap.fps,
      frameMs: snap.frameMs,
      worst1PercentMs: snap.worst1PercentMs,
      scriptMs: snap.scriptMs,
      drawCalls: snap.drawCalls,
      triangles: snap.triangles,
      lap: lapStart === null ? 0 : Math.min(lapTimes.length + 1, this.raceConfig.laps),
      lapTime: lapStart === null ? 0 : this.raceTime - lapStart,
      lastLapTime: lapTimes.length === 0 ? null : lapTimes[lapTimes.length - 1],
      ...this.standingsPatch(),
    });
    this.minimap?.draw([
      { x: car.position.x, z: car.position.z, color: PAINT_COLORS[settingsStore.get().paintIndex].hex, isPlayer: true },
      ...this.aiCars.map((ai) => ({ x: ai.model.root.position.x, z: ai.model.root.position.z, color: ai.model.bodyMaterial.color.getStyle(), isPlayer: false })),
    ]);
  }

  private standingsPatch(): { position: number; standings: Standing[] } {
    const all = [this.playerProgress, ...this.aiCars.map((ai) => ai.progress)];
    const order = standings(all, this.raceConfig);
    const leader = raceDistance(all[order[0]], this.raceConfig);
    const rows = order.map((i) => ({
      name: i === 0 ? 'YOU' : AI_ROSTER[i - 1].name,
      paint: i === 0 ? PAINT_COLORS[settingsStore.get().paintIndex].hex : AI_ROSTER[i - 1].paint,
      isPlayer: i === 0,
      lapsDone: all[i].lapTimes.length,
      metresBehind: leader - raceDistance(all[i], this.raceConfig),
      finishTime: all[i].finishTime,
    }));
    return { position: order.indexOf(0) + 1, standings: rows };
  }

  dispose(): void {
    this.disposed = true;
    this.loop?.stop();
    window.removeEventListener('resize', this.onResize);
    delete window.__nfsDrive;
    delete window.__nfsTeleport;
    this.unsubscribeSettings?.();
    this.input.detach();
    this.audio.dispose();
    this.player?.dispose();
    for (const ai of this.aiCars) ai.model.dispose();
    this.trackScene?.dispose();
    this.physics?.dispose();
    this.renderer?.dispose();
  }
}
