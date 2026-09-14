import { beforeAll, describe, expect, it } from 'vitest';
import { COLLISION_GROUP, groups, loadRapier, PhysicsWorld } from './PhysicsWorld';
import { FERRARI_SPEC, VehicleSim } from './VehicleSim';

const DT = 1 / 60;
const HOLD = { throttle: 0, brake: 1, steer: 0, handbrake: false, nitrous: false };
const SPAWN = { x: 0, y: 0.6, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
const WHEELBASE = Math.max(...FERRARI_SPEC.wheels.map((w) => w.z))
  - Math.min(...FERRARI_SPEC.wheels.map((w) => w.z));

beforeAll(async () => {
  await loadRapier();
});

async function corner(speed: number, steer: number) {
  const physics = new PhysicsWorld(await loadRapier(), DT);
  physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 500, y: 0.5, z: 500 })
    .setCollisionGroups(groups(COLLISION_GROUP.GROUND, 0xffff));
  const vehicle = new VehicleSim(physics, FERRARI_SPEC, SPAWN);
  try {
    for (let i = 0; i < 120; i++) {
      vehicle.step(DT, HOLD);
      physics.step();
    }
    vehicle.body.setLinvel({ x: 0, y: 0, z: speed }, true);
    const startHeading = vehicle.heading();
    let requestedHeading = 0;
    let upright = true;
    for (let i = 0; i < 120; i++) {
      vehicle.step(DT, { ...HOLD, brake: 0, throttle: 0.3, steer });
      requestedHeading += vehicle.forwardSpeed() * Math.tan(vehicle.steerAngle) / WHEELBASE * DT;
      physics.step();
      upright &&= vehicle.upright();
    }
    return {
      heading: vehicle.heading() - startHeading,
      requestedHeading,
      speed: vehicle.forwardSpeed(),
      grounded: vehicle.grounded(),
      upright,
    };
  } finally {
    vehicle.dispose();
    physics.dispose();
  }
}

describe('VehicleSim cornering', () => {
  it.each([
    { speed: 12, steer: -0.16 },
    { speed: 12, steer: 0.16 },
    { speed: 32, steer: -0.06 },
    { speed: 32, steer: 0.06 },
    { speed: 32, steer: -0.12 },
    { speed: 32, steer: 0.12 },
  ])('follows a moderate turn at $speed m/s with steer $steer', async ({ speed, steer }) => {
    const result = await corner(speed, steer);
    expect(Math.sign(result.heading)).toBe(-Math.sign(steer));
    expect(result.heading / result.requestedHeading).toBeGreaterThan(0.65);
    expect(result.heading / result.requestedHeading).toBeLessThan(1.25);
    expect(result.speed).toBeGreaterThan(speed * 0.8);
    expect(result.grounded).toBe(true);
    expect(result.upright).toBe(true);
  });

  it.each([-1, 1])('responds to full steering input %s at highway speed without spinning or rolling', async (steer) => {
    const result = await corner(32, steer);
    expect(Math.sign(result.heading)).toBe(-Math.sign(steer));
    expect(Math.abs(result.heading)).toBeGreaterThan(0.8);
    expect(Math.abs(result.heading)).toBeLessThan(2.1);
    expect(result.speed).toBeGreaterThan(16);
    expect(result.grounded).toBe(true);
    expect(result.upright).toBe(true);
  });
});
