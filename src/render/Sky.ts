import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

export interface SkyPalette {
  zenith: Color;
  horizon: Color;
  sunGlow: Color;
  ground: Color;
  fog: Color;
  sunDirection: Vector3;
}

/** Dusk over the harbor: deep blue overhead, amber band at the horizon towards the sun. */
export const DUSK: SkyPalette = {
  zenith: new Color('#0b1430'),
  horizon: new Color('#4b3a66'),
  sunGlow: new Color('#ff8a3d'),
  ground: new Color('#141018'),
  fog: new Color('#2a2338'),
  sunDirection: new Vector3(-0.72, 0.09, -0.35).normalize(),
};

const vertexShader = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(worldPos.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
    gl_Position.z = gl_Position.w;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 sunGlow;
  uniform vec3 ground;
  uniform vec3 sunDirection;
  varying vec3 vWorldDir;
  void main() {
    vec3 d = normalize(vWorldDir);
    float h = d.y;
    float t = pow(clamp(h, 0.0, 1.0), 0.42);
    vec3 sky = mix(horizon, zenith, t);
    float sunDot = max(dot(d, sunDirection), 0.0);
    float glow = pow(sunDot, 6.0) * (1.0 - smoothstep(0.0, 0.35, h)) * 0.9;
    float band = exp(-abs(h) * 7.0) * (0.15 + pow(sunDot, 1.4)) * 0.9;
    sky += sunGlow * (glow + band);
    float disc = smoothstep(0.9985, 0.9995, sunDot);
    sky += vec3(1.0, 0.85, 0.65) * disc * 6.0;
    vec3 below = mix(horizon, ground, clamp(-h * 6.0, 0.0, 1.0));
    vec3 col = h < 0.0 ? below : sky;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSkyDome(palette: SkyPalette): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      zenith: { value: palette.zenith },
      horizon: { value: palette.horizon },
      sunGlow: { value: palette.sunGlow },
      ground: { value: palette.ground },
      sunDirection: { value: palette.sunDirection },
    },
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new Mesh(new SphereGeometry(1, 32, 16), material);
  mesh.scale.setScalar(3000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}
