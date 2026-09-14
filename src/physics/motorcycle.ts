import type { DrivetrainConfig } from './drivetrain';
import type { VehicleSpec } from './VehicleSim';

/** Litre-class superbike with rider: light, quick off the line, higher top end than the coupe but far less downforce. */
export const SUPERBIKE: DrivetrainConfig = {
  gearTopSpeeds: [16, 26, 37, 49, 62, 76],
  maxForce: 1900,
  idleRpm: 1300,
  redlineRpm: 14000,
  nitrousForce: 1400,
  reverseForce: 600,
  reverseTopSpeed: 3,
  dragCoefficient: 0.3,
  rollingResistance: 0.015,
  downforceCoefficient: 0.15,
  mass: 240,
};

const WHEEL_RADIUS = 0.32;
const REST_LENGTH = 0.2;
const STIFFNESS = 34;
/** Static compression under the bike's weight: g / (wheel count * stiffness) in Rapier's normalised suspension units. */
const REST_COMPRESSION = 9.81 / (4 * STIFFNESS);
const AXLE_Y = WHEEL_RADIUS + REST_LENGTH - REST_COMPRESSION;
/** Half-width of the phantom ray pairs; with the low centre of mass this lets the body hold ~1.4 g before an inside ray unloads. */
const RAY_HALF_TRACK = 0.55;

/**
 * Player motorcycle. Rapier's raycast vehicle needs a stable footprint, so the
 * single-track bike rides on two pairs of phantom rays (1.1 m apart) under
 * the front and rear tyres, with a low, flat collider so the body never tips:
 * the physics body stays upright like a car while MotorcycleModel rolls the
 * visible bike from measured speed and yaw rate. That keeps low-speed
 * handling stable without a balance simulation and is the only arcade assist;
 * mass, power, braking and drag are tuned to a real superbike, and rear grip
 * is raised above the front so the light chassis understeers at the limit
 * instead of spinning. The shorter wheelbase turns quicker per degree of
 * steering, so the steering lock is scaled down and yaw damping raised to
 * match the car's yaw response.
 */
export const MOTORCYCLE_SPEC: VehicleSpec = {
  drivetrain: SUPERBIKE,
  halfExtents: { x: 0.3, y: 0.26, z: 1.05 },
  colliderOffsetY: 0.4,
  wheels: [
    { x: RAY_HALF_TRACK, y: AXLE_Y, z: 0.72, radius: WHEEL_RADIUS, steered: true, driven: false },
    { x: -RAY_HALF_TRACK, y: AXLE_Y, z: 0.72, radius: WHEEL_RADIUS, steered: true, driven: false },
    { x: RAY_HALF_TRACK, y: AXLE_Y, z: -0.7, radius: WHEEL_RADIUS, steered: false, driven: true },
    { x: -RAY_HALF_TRACK, y: AXLE_Y, z: -0.7, radius: WHEEL_RADIUS, steered: false, driven: true },
  ],
  suspensionRestLength: REST_LENGTH,
  suspensionStiffness: STIFFNESS,
  suspensionCompression: 3.0,
  suspensionRelaxation: 3.6,
  maxSuspensionTravel: 0.14,
  frontFrictionSlip: 2.6,
  rearFrictionSlip: 3.2,
  handbrakeFrictionSlip: 1.0,
  sideFrictionStiffness: 1,
  brakeForce: 40,
  handbrakeForce: 1500,
  rollingBrake: 3,
  steerLock: { low: 0.3, high: 0.035 },
  angularDamping: 2.4,
};

export const MOTORCYCLE_REST_COMPRESSION = REST_COMPRESSION;
