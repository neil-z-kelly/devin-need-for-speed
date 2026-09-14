import { describe, expect, it } from 'vitest';
import { SUPERBIKE_LEAN, balanceLean, stepLean } from './lean';

describe('balanceLean', () => {
  it('stays upright when rolling straight or standing still', () => {
    expect(balanceLean(30, 0, SUPERBIKE_LEAN.maxLean)).toBe(0);
    expect(balanceLean(0, 0.8, SUPERBIKE_LEAN.maxLean)).toBe(0);
  });

  it('leans into the turn on both sides and grows with speed', () => {
    const slowLeft = balanceLean(8, 0.5, SUPERBIKE_LEAN.maxLean);
    const fastLeft = balanceLean(24, 0.5, SUPERBIKE_LEAN.maxLean);
    const fastRight = balanceLean(24, -0.5, SUPERBIKE_LEAN.maxLean);
    expect(slowLeft).toBeGreaterThan(0.2);
    expect(fastLeft).toBeGreaterThan(slowLeft);
    expect(fastRight).toBeCloseTo(-fastLeft, 6);
  });

  it('matches tan(lean) = lateral acceleration / g', () => {
    const lean = balanceLean(20, 0.3, SUPERBIKE_LEAN.maxLean);
    expect(Math.tan(lean)).toBeCloseTo((20 * 0.3) / 9.81, 6);
  });

  it('clamps to the configured maximum lean', () => {
    expect(balanceLean(60, 2, SUPERBIKE_LEAN.maxLean)).toBe(SUPERBIKE_LEAN.maxLean);
    expect(balanceLean(60, -2, SUPERBIKE_LEAN.maxLean)).toBe(-SUPERBIKE_LEAN.maxLean);
  });
});

describe('stepLean', () => {
  const dt = 1 / 60;

  it('approaches the target smoothly without overshooting', () => {
    let lean = 0;
    let previous = 0;
    for (let i = 0; i < 60; i++) {
      lean = stepLean(lean, 0.7, dt, SUPERBIKE_LEAN);
      expect(lean).toBeGreaterThanOrEqual(previous);
      expect(lean).toBeLessThanOrEqual(0.7);
      previous = lean;
    }
    expect(lean).toBeGreaterThan(0.6);
    expect(stepLean(0, 0.7, dt, SUPERBIKE_LEAN)).toBeLessThan(0.15);
  });

  it('returns upright once the target drops to zero', () => {
    let lean = 0.8;
    for (let i = 0; i < 90; i++) lean = stepLean(lean, 0, dt, SUPERBIKE_LEAN);
    expect(Math.abs(lean)).toBeLessThan(0.01);
  });

  it('is frame-rate independent', () => {
    let fine = 0;
    for (let i = 0; i < 120; i++) fine = stepLean(fine, 0.5, 1 / 120, SUPERBIKE_LEAN);
    let coarse = 0;
    for (let i = 0; i < 30; i++) coarse = stepLean(coarse, 0.5, 1 / 30, SUPERBIKE_LEAN);
    expect(fine).toBeCloseTo(coarse, 6);
  });
});
