import { describe, expect, it } from 'vitest';
import { SPORTS_COUPE, driveForce, selectGear } from './drivetrain';

const tops = SPORTS_COUPE.gearTopSpeeds;

describe('selectGear', () => {
  it('shifts up just below the redline speed of the current gear', () => {
    expect(selectGear(tops[0] * 0.9, 1, SPORTS_COUPE)).toBe(1);
    expect(selectGear(tops[0] * 0.99, 1, SPORTS_COUPE)).toBe(2);
  });

  it('does not shift back down until speed drops well below the shift point', () => {
    const justAboveShift = tops[0] * 0.99;
    const gear = selectGear(justAboveShift, 1, SPORTS_COUPE);
    expect(selectGear(justAboveShift - 0.5, gear, SPORTS_COUPE)).toBe(gear);
    expect(selectGear(tops[0] * 0.5, gear, SPORTS_COUPE)).toBe(1);
  });

  it('skips several gears when speed changes abruptly and never leaves the valid range', () => {
    expect(selectGear(tops[tops.length - 1] * 2, 1, SPORTS_COUPE)).toBe(tops.length);
    expect(selectGear(-5, 4, SPORTS_COUPE)).toBe(1);
  });
});

describe('driveForce', () => {
  it('is zero without throttle and at top speed', () => {
    expect(driveForce(0, 10, 1, SPORTS_COUPE, false)).toBe(0);
    expect(driveForce(1, tops[tops.length - 1], tops.length, SPORTS_COUPE, false)).toBe(0);
  });

  it('delivers less force in higher gears and more with nitrous', () => {
    const first = driveForce(1, 5, 1, SPORTS_COUPE, false);
    const third = driveForce(1, 5, 3, SPORTS_COUPE, false);
    expect(third).toBeLessThan(first);
    expect(driveForce(1, 5, 3, SPORTS_COUPE, true)).toBeCloseTo(third + SPORTS_COUPE.nitrousForce);
  });
});
