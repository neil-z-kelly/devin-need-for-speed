import { describe, expect, it } from 'vitest';
import { currentLap, formatTime, newProgress, raceDistance, standings, updateProgress, type CarProgress, type RaceConfig } from './RaceRules';

const cfg: RaceConfig = { checkpointS: [0, 250, 500, 750], trackLength: 1000, laps: 2 };

function drive(p: CarProgress, positions: Array<[s: number, t: number]>): CarProgress {
  return positions.reduce((acc, [s, t]) => updateProgress(acc, cfg, s, t), p);
}

describe('updateProgress', () => {
  it('starts lap 1 on the first line crossing and records a lap time on the next', () => {
    let p = newProgress(990);
    expect(currentLap(p)).toBe(0);
    p = drive(p, [[5, 1]]);
    expect(currentLap(p)).toBe(1);
    expect(p.lapTimes).toEqual([]);
    p = drive(p, [[260, 10], [510, 20], [760, 30], [10, 41]]);
    expect(p.lapTimes).toEqual([40]);
    expect(currentLap(p)).toBe(2);
  });

  it('ignores a checkpoint reached out of order', () => {
    let p = drive(newProgress(990), [[5, 1]]);
    p = drive(p, [[510, 5]]);
    expect(p.nextCheckpoint).toBe(1);
    p = drive(p, [[10, 30]]);
    expect(p.lapTimes).toEqual([]);
  });

  it('does not count a checkpoint approached from behind', () => {
    const p = drive(newProgress(990), [[995, 1]]);
    expect(p.nextCheckpoint).toBe(0);
  });

  it('finishes after the configured laps and then freezes', () => {
    const lap = (t0: number): Array<[number, number]> => [[260, t0 + 1], [510, t0 + 2], [760, t0 + 3], [10, t0 + 4]];
    let p = drive(newProgress(990), [[5, 0], ...lap(0), ...lap(4)]);
    expect(p.finishTime).toBe(8);
    expect(p.lapTimes).toEqual([4, 4]);
    p = drive(p, [...lap(8)]);
    expect(p.lapTimes).toHaveLength(2);
    expect(p.finishTime).toBe(8);
  });
});

describe('standings', () => {
  it('orders by laps then distance, keeping a car that just crossed the line ahead of one about to', () => {
    const behind = drive(newProgress(990), [[5, 0], [260, 1], [510, 2], [760, 3], [990, 4]]);
    const ahead = drive(newProgress(990), [[5, 0], [260, 1], [510, 2], [760, 3], [10, 4]]);
    const notStarted = newProgress(995);
    expect(raceDistance(ahead, cfg)).toBeGreaterThan(raceDistance(behind, cfg));
    expect(standings([behind, notStarted, ahead], cfg)).toEqual([2, 0, 1]);
  });

  it('ranks finished cars by finish time ahead of everyone still racing', () => {
    const lap = (t0: number): Array<[number, number]> => [[260, t0 + 1], [510, t0 + 2], [760, t0 + 3], [10, t0 + 4]];
    const slowFinisher = drive(newProgress(990), [[5, 0], ...lap(0), ...lap(4), [300, 20]]);
    const fastFinisher = drive(newProgress(990), [[5, 0], ...lap(-1), ...lap(3)]);
    const racing = drive(newProgress(990), [[5, 0], ...lap(0), ...lap(4).slice(0, 3)]);
    expect(standings([slowFinisher, racing, fastFinisher], cfg)).toEqual([2, 0, 1]);
  });

  it('holds a finished car at the full race distance while it keeps driving', () => {
    const lap = (t0: number): Array<[number, number]> => [[260, t0 + 1], [510, t0 + 2], [760, t0 + 3], [10, t0 + 4]];
    const finished = drive(newProgress(990), [[5, 0], ...lap(0), ...lap(4), [600, 20]]);
    expect(raceDistance(finished, cfg)).toBe(cfg.laps * cfg.trackLength);
  });
});

describe('formatTime', () => {
  it('pads seconds under ten', () => {
    expect(formatTime(65.5)).toBe('1:05.500');
    expect(formatTime(0)).toBe('0:00.000');
  });
});
