import { describe, expect, it } from 'vitest';
import { hasSavedSettings, loadSettings, saveSettings } from './settings';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('settings persistence', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    expect(hasSavedSettings(storage)).toBe(false);
    const saved = { quality: 'low', masterVolume: 0.2, paintIndex: 3, showPerf: true, laps: 5, vehicle: 'motorcycle' } as const;
    saveSettings(saved, storage);
    expect(hasSavedSettings(storage)).toBe(true);
    expect(loadSettings(storage)).toEqual(saved);
  });

  it('falls back field by field when stored values are invalid', () => {
    const storage = memoryStorage({ 'nfs.settings.v1': JSON.stringify({ quality: 'insane', masterVolume: 4, paintIndex: 99, showPerf: 'yes', laps: 7, vehicle: 'hovercraft' }) });
    expect(loadSettings(storage)).toEqual({ quality: 'high', masterVolume: 1, paintIndex: 0, showPerf: false, laps: 3, vehicle: 'car' });
  });

  it('keeps the car for settings saved before vehicle selection existed', () => {
    const legacy = { quality: 'medium', masterVolume: 0.5, paintIndex: 2, showPerf: false, laps: 1 };
    const storage = memoryStorage({ 'nfs.settings.v1': JSON.stringify(legacy) });
    expect(loadSettings(storage)).toEqual({ ...legacy, vehicle: 'car' });
  });

  it('ignores corrupt JSON and missing storage', () => {
    expect(loadSettings(memoryStorage({ 'nfs.settings.v1': '{not json' })).quality).toBe('high');
    expect(loadSettings(null).quality).toBe('high');
    expect(hasSavedSettings(null)).toBe(false);
  });
});
