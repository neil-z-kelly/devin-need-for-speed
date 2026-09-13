import { Store } from './store';

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

export interface QualityProfile {
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  postProcessing: boolean;
  bloom: boolean;
  antialias: boolean;
  /** Number of dynamic street-light sources kept live around the car. */
  streetLightCount: number;
  anisotropy: number;
  drawDistance: number;
  skylineDensity: number;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: {
    pixelRatio: 0.66,
    shadows: false,
    shadowMapSize: 1024,
    postProcessing: false,
    bloom: false,
    antialias: false,
    streetLightCount: 0,
    anisotropy: 2,
    drawDistance: 420,
    skylineDensity: 0.5,
  },
  medium: {
    pixelRatio: 1,
    shadows: true,
    shadowMapSize: 1024,
    postProcessing: false,
    bloom: false,
    antialias: true,
    streetLightCount: 2,
    anisotropy: 4,
    drawDistance: 600,
    skylineDensity: 0.75,
  },
  high: {
    pixelRatio: 1,
    shadows: true,
    shadowMapSize: 2048,
    postProcessing: true,
    bloom: true,
    antialias: true,
    streetLightCount: 4,
    anisotropy: 8,
    drawDistance: 800,
    skylineDensity: 1,
  },
  ultra: {
    pixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 4096,
    postProcessing: true,
    bloom: true,
    antialias: true,
    streetLightCount: 6,
    anisotropy: 16,
    drawDistance: 1000,
    skylineDensity: 1,
  },
};

export const PAINT_COLORS = [
  { name: 'Volt Yellow', hex: '#e8d418' },
  { name: 'Rosso', hex: '#c8102e' },
  { name: 'Glacier White', hex: '#e9ecef' },
  { name: 'Midnight Blue', hex: '#16236b' },
  { name: 'Gunmetal', hex: '#3a3f47' },
  { name: 'Miami Teal', hex: '#12a5a0' },
] as const;

export interface Settings {
  quality: QualityLevel;
  masterVolume: number;
  paintIndex: number;
  showPerf: boolean;
}

const STORAGE_KEY = 'nfs.settings.v1';

const DEFAULTS: Settings = { quality: 'high', masterVolume: 0.7, paintIndex: 0, showPerf: false };

export function isQuality(v: unknown): v is QualityLevel {
  return typeof v === 'string' && (QUALITY_LEVELS as readonly string[]).includes(v);
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Settings {
  const raw = storage?.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS };
    const p = parsed as Record<string, unknown>;
    return {
      quality: isQuality(p.quality) ? p.quality : DEFAULTS.quality,
      masterVolume: typeof p.masterVolume === 'number' ? Math.min(1, Math.max(0, p.masterVolume)) : DEFAULTS.masterVolume,
      paintIndex:
        typeof p.paintIndex === 'number' && p.paintIndex >= 0 && p.paintIndex < PAINT_COLORS.length
          ? Math.floor(p.paintIndex)
          : DEFAULTS.paintIndex,
      showPerf: typeof p.showPerf === 'boolean' ? p.showPerf : DEFAULTS.showPerf,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function hasSavedSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  return storage?.getItem(STORAGE_KEY) != null;
}

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(s));
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const settingsStore = new Store<Settings>(loadSettings());
settingsStore.subscribe(() => saveSettings(settingsStore.get()));
