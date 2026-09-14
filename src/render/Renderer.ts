import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Fog,
  HemisphereLight,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { QualityProfile } from '../state/settings';
import { DUSK, createSkyDome } from './Sky';
import type { StreetLamp } from './TrackScene';

export interface RendererInfo {
  gpu: string;
  webgl2: boolean;
}

export class Renderer {
  readonly gl: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly sun: DirectionalLight;
  readonly info: RendererInfo;
  environment: Texture | null = null;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private readonly streetLights: PointLight[] = [];
  private profile: QualityProfile;
  private readonly sunOffset = new Vector3();

  constructor(
    readonly canvas: HTMLCanvasElement,
    profile: QualityProfile,
  ) {
    this.profile = profile;
    this.gl = new WebGLRenderer({ canvas, antialias: profile.antialias, powerPreference: 'high-performance', stencil: false });
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 0.9;
    this.gl.shadowMap.enabled = profile.shadows;
    this.gl.shadowMap.type = PCFShadowMap;
    this.gl.info.autoReset = false;
    this.info = readInfo(this.gl);

    this.camera = new PerspectiveCamera(60, 16 / 9, 0.3, 1400);
    this.scene.fog = new Fog(DUSK.fog, 60, profile.drawDistance);
    this.scene.background = DUSK.fog;
    this.scene.add(createSkyDome(DUSK));

    const hemi = new HemisphereLight(new Color('#2c3a66'), new Color('#15100f'), 0.35);
    this.scene.add(hemi);

    this.sun = new DirectionalLight(new Color('#ff9a5c'), 1.1);
    this.sunOffset.copy(DUSK.sunDirection).multiplyScalar(140);
    this.sun.castShadow = profile.shadows;
    this.sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 320;
    const ext = 70;
    this.sun.shadow.camera.left = -ext;
    this.sun.shadow.camera.right = ext;
    this.sun.shadow.camera.top = ext;
    this.sun.shadow.camera.bottom = -ext;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    for (let i = 0; i < profile.streetLightCount; i++) {
      const light = new PointLight(new Color('#ffb761'), 45, 30, 2);
      light.castShadow = false;
      this.scene.add(light);
      this.streetLights.push(light);
    }

    this.applyProfile(profile);
  }

  async loadEnvironment(url: string): Promise<void> {
    const hdr = await new HDRLoader().loadAsync(url);
    hdr.mapping = EquirectangularReflectionMapping;
    const pmrem = new PMREMGenerator(this.gl);
    this.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.25;
  }

  applyProfile(profile: QualityProfile): void {
    this.profile = profile;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2) * profile.pixelRatio);
    this.gl.shadowMap.enabled = profile.shadows;
    this.sun.castShadow = profile.shadows;
    if (this.sun.shadow.map && this.sun.shadow.mapSize.x !== profile.shadowMapSize) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    if (this.scene.fog instanceof Fog) this.scene.fog.far = profile.drawDistance;
    this.camera.far = Math.max(profile.drawDistance * 1.6, 1400);
    this.camera.updateProjectionMatrix();
    this.setupComposer();
    this.resize();
  }

  private setupComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    if (!this.profile.postProcessing) return;
    const composer = new EffectComposer(this.gl);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.profile.bloom) {
      const size = new Vector2();
      this.gl.getSize(size);
      this.bloom = new UnrealBloomPass(size, 0.35, 0.5, 1.0);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  /** Keep the shadow frustum centred on the player and light the nearest lamps. */
  updateLighting(focus: Vector3, lamps: readonly StreetLamp[]): void {
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(this.sunOffset);
    if (this.streetLights.length === 0 || lamps.length === 0) return;
    const nearest = lamps
      .map((l) => ({ l, d: l.position.distanceToSquared(focus) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.streetLights.length);
    for (let i = 0; i < this.streetLights.length; i++) {
      const light = this.streetLights[i];
      const pick = nearest[i];
      if (!pick) {
        light.visible = false;
        continue;
      }
      light.visible = true;
      light.position.copy(pick.l.position);
    }
  }

  render(): void {
    this.gl.info.reset();
    if (this.composer) this.composer.render();
    else this.gl.render(this.scene, this.camera);
  }

  get drawCalls(): number {
    return this.gl.info.render.calls;
  }

  get triangles(): number {
    return this.gl.info.render.triangles;
  }

  resolutionLabel(): string {
    const size = new Vector2();
    this.gl.getDrawingBufferSize(size);
    return `${size.x}x${size.y}`;
  }

  dispose(): void {
    this.composer?.dispose();
    this.environment?.dispose();
    this.gl.dispose();
  }
}

function readInfo(gl: WebGLRenderer): RendererInfo {
  return { gpu: gpuName(gl.getContext()), webgl2: gl.capabilities.isWebGL2 };
}

function gpuName(ctx: WebGLRenderingContext | WebGL2RenderingContext): string {
  const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
  return String(ctx.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : ctx.RENDERER));
}

/** GPU name from a throwaway context, so the quality profile can be chosen before the real renderer exists. */
export function probeGpu(): string {
  const ctx = document.createElement('canvas').getContext('webgl2');
  if (!ctx) return 'unavailable';
  const name = gpuName(ctx);
  ctx.getExtension('WEBGL_lose_context')?.loseContext();
  return name;
}
