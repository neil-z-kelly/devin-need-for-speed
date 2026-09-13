import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from './FixedStepLoop';

function loopWithCounter(maxSteps = 15) {
  const dts: number[] = [];
  const alphas: number[] = [];
  const loop = new FixedStepLoop({ simulate: (dt) => dts.push(dt), render: (alpha) => alphas.push(alpha) }, 1 / 60, maxSteps, 0.25);
  return { loop, dts, alphas };
}

describe('FixedStepLoop', () => {
  it('advances the same simulated time for a fast and a slow render rate', () => {
    const fast = loopWithCounter();
    const slow = loopWithCounter();
    for (let i = 0; i < 60; i++) fast.loop.advance(1 / 60);
    for (let i = 0; i < 10; i++) slow.loop.advance(0.1);
    expect(fast.dts).toHaveLength(60);
    expect(slow.dts).toHaveLength(60);
    expect(new Set(slow.dts)).toEqual(new Set([1 / 60]));
  });

  it('carries leftover time into the next frame and reports it as the interpolation alpha', () => {
    const { loop, dts, alphas } = loopWithCounter();
    loop.advance(0.025);
    expect(dts).toHaveLength(1);
    expect(alphas[0]).toBeCloseTo((0.025 - 1 / 60) / (1 / 60));
    loop.advance(0.01);
    expect(dts).toHaveLength(2);
  });

  it('drops accumulated time instead of spiralling when a frame exceeds the step budget', () => {
    const { loop, dts, alphas } = loopWithCounter(4);
    const steps = loop.advance(0.25);
    expect(steps).toBe(4);
    expect(dts).toHaveLength(4);
    expect(alphas.at(-1)).toBe(0);
    loop.advance(1 / 60);
    expect(dts).toHaveLength(5);
  });
});
