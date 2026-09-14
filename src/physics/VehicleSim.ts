import type RAPIER from '@dimforge/rapier3d-compat';
import { COLLISION_GROUP, groups, type PhysicsWorld } from './PhysicsWorld';
import {
  SPORTS_COUPE,
  downforce,
  driveForce,
  engineRpm,
  maxSteerAngle,
  resistanceForce,
  reverseForce,
  selectGear,
  type DrivetrainConfig,
  type SteerLock,
} from './drivetrain';
import { clamp, damp } from '../util/math';

export interface VehicleControls {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  nitrous: boolean;
}

export interface WheelSpec {
  /** Attachment point in chassis space (metres). */
  x: number;
  y: number;
  z: number;
  radius: number;
  steered: boolean;
  driven: boolean;
}

export interface VehicleSpec {
  drivetrain: DrivetrainConfig;
  /** Chassis collider half extents. */
  halfExtents: { x: number; y: number; z: number };
  /** Vertical offset of the collider centre from the body origin. */
  colliderOffsetY: number;
  wheels: WheelSpec[];
  suspensionRestLength: number;
  suspensionStiffness: number;
  suspensionCompression: number;
  suspensionRelaxation: number;
  maxSuspensionTravel: number;
  frontFrictionSlip: number;
  rearFrictionSlip: number;
  handbrakeFrictionSlip: number;
  sideFrictionStiffness: number;
  brakeForce: number;
  handbrakeForce: number;
  /** Per-wheel brake impulse applied while coasting (no throttle or brake); defaults to the car tuning. */
  rollingBrake?: number;
  /** Speed-dependent steering lock; defaults to the car tuning. */
  steerLock?: SteerLock;
  /** Rigid-body angular damping; defaults to the car tuning. */
  angularDamping?: number;
}

const CAR_ROLLING_BRAKE = 120;

export const FERRARI_SPEC: VehicleSpec = {
  drivetrain: SPORTS_COUPE,
  halfExtents: { x: 0.95, y: 0.5, z: 2.26 },
  colliderOffsetY: 0.6,
  wheels: [
    { x: 0.84, y: 0.59, z: 1.155, radius: 0.36, steered: true, driven: false },
    { x: -0.83, y: 0.59, z: 1.155, radius: 0.36, steered: true, driven: false },
    { x: 0.82, y: 0.59, z: -1.495, radius: 0.36, steered: false, driven: true },
    { x: -0.82, y: 0.59, z: -1.495, radius: 0.36, steered: false, driven: true },
  ],
  suspensionRestLength: 0.3,
  suspensionStiffness: 38,
  suspensionCompression: 3.4,
  suspensionRelaxation: 4.2,
  maxSuspensionTravel: 0.2,
  frontFrictionSlip: 2.6,
  rearFrictionSlip: 2.6,
  handbrakeFrictionSlip: 1.1,
  sideFrictionStiffness: 1,
  brakeForce: 6500,
  handbrakeForce: 9000,
};

export interface WheelState {
  steering: number;
  /** Cumulative rotation about the axle (radians). */
  spin: number;
  suspensionLength: number;
  inContact: boolean;
  /** Approximate lateral slip magnitude, 0..1, for tyre effects. */
  slip: number;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

const NITROUS_DRAIN_PER_S = 0.3;
const NITROUS_RECHARGE_PER_S = 0.045;

/**
 * Raycast vehicle on top of a Rapier rigid body. Only the physics step touches
 * Rapier; rendering reads `pose`/`prevPose` and interpolates.
 */
export class VehicleSim {
  readonly body: RAPIER.RigidBody;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  readonly wheels: WheelState[];
  readonly pose: Pose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  readonly prevPose: Pose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  speed = 0;
  gear = 1;
  rpm = SPORTS_COUPE.idleRpm;
  nitrous = 1;
  nitrousActive = false;
  steerAngle = 0;
  reversing = false;
  private readonly R: typeof RAPIER;

  constructor(
    private readonly physics: PhysicsWorld,
    readonly spec: VehicleSpec,
    spawn: Pose,
  ) {
    this.R = physics.R;
    this.rpm = spec.drivetrain.idleRpm;
    const bodyDesc = this.R.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .setRotation({ x: spawn.qx, y: spawn.qy, z: spawn.qz, w: spawn.qw })
      .setLinearDamping(0.02)
      .setAngularDamping(spec.angularDamping ?? 1.2)
      .setCcdEnabled(true);
    this.body = physics.world.createRigidBody(bodyDesc);
    const he = spec.halfExtents;
    const colliderDesc = this.R.ColliderDesc.cuboid(he.x, he.y, he.z)
      .setTranslation(0, spec.colliderOffsetY, 0)
      .setMass(spec.drivetrain.mass)
      .setFriction(0.4)
      .setRestitution(0.05)
      .setCollisionGroups(groups(COLLISION_GROUP.VEHICLE, COLLISION_GROUP.STATIC | COLLISION_GROUP.VEHICLE | COLLISION_GROUP.GROUND));
    physics.world.createCollider(colliderDesc, this.body);

    this.controller = physics.world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;
    spec.wheels.forEach((w) => {
      this.controller.addWheel({ x: w.x, y: w.y, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, spec.suspensionRestLength, w.radius);
    });
    this.wheels = spec.wheels.map(() => ({ steering: 0, spin: 0, suspensionLength: spec.suspensionRestLength, inContact: false, slip: 0 }));
    for (let i = 0; i < spec.wheels.length; i++) {
      this.controller.setWheelSuspensionStiffness(i, spec.suspensionStiffness);
      this.controller.setWheelSuspensionCompression(i, spec.suspensionCompression);
      this.controller.setWheelSuspensionRelaxation(i, spec.suspensionRelaxation);
      this.controller.setWheelMaxSuspensionTravel(i, spec.maxSuspensionTravel);
      this.controller.setWheelFrictionSlip(i, spec.wheels[i].steered ? spec.frontFrictionSlip : spec.rearFrictionSlip);
      this.controller.setWheelSideFrictionStiffness(i, spec.sideFrictionStiffness);
      this.controller.setWheelMaxSuspensionForce(i, 60000);
    }
    this.readPose(this.pose);
    this.readPose(this.prevPose);
  }

  step(dt: number, c: VehicleControls): void {
    Object.assign(this.prevPose, this.pose);
    const cfg = this.spec.drivetrain;
    this.speed = this.forwardSpeed();

    const nearlyStopped = Math.abs(this.speed) < 0.6;
    if (this.reversing) {
      if (c.throttle > 0 && c.brake === 0) this.reversing = false;
    } else if (c.brake > 0 && c.throttle === 0 && (nearlyStopped || this.speed < 0)) {
      this.reversing = true;
    }

    this.gear = this.reversing ? 1 : selectGear(this.speed, this.gear, cfg);

    const wantsNitrous = c.nitrous && c.throttle > 0 && this.nitrous > 0.01 && !this.reversing;
    this.nitrousActive = wantsNitrous;
    this.nitrous = clamp(this.nitrous + (wantsNitrous ? -NITROUS_DRAIN_PER_S : NITROUS_RECHARGE_PER_S) * dt, 0, 1);

    let engine: number;
    let brake: number;
    if (this.reversing) {
      engine = reverseForce(c.brake, this.speed, cfg);
      brake = c.throttle > 0 ? this.spec.brakeForce * c.throttle : 0;
      if (this.speed > 0.2 && c.brake > 0) {
        brake = this.spec.brakeForce * c.brake;
        engine = 0;
      }
    } else {
      engine = driveForce(c.throttle, this.speed, this.gear, cfg, wantsNitrous);
      brake = this.spec.brakeForce * c.brake;
      if (this.speed < -0.2 && c.throttle > 0) brake = this.spec.brakeForce * c.throttle;
    }
    const rollingBrake = c.throttle === 0 && c.brake === 0 ? (this.spec.rollingBrake ?? CAR_ROLLING_BRAKE) : 0;

    // Rapier's positive wheel steering yaws toward chassis +X, the left side of a +Z-forward car.
    const targetSteer = -c.steer * maxSteerAngle(this.speed, this.spec.steerLock);
    this.steerAngle = damp(this.steerAngle, targetSteer, 14, dt);

    const drivenCount = this.spec.wheels.filter((w) => w.driven).length;
    for (let i = 0; i < this.spec.wheels.length; i++) {
      const w = this.spec.wheels[i];
      this.controller.setWheelSteering(i, w.steered ? this.steerAngle : 0);
      this.controller.setWheelEngineForce(i, w.driven ? engine / drivenCount : 0);
      let wheelBrake = brake / 4 + rollingBrake;
      if (c.handbrake && !w.steered) wheelBrake += this.spec.handbrakeForce / 2;
      this.controller.setWheelBrake(i, wheelBrake);
      const grip = w.steered ? this.spec.frontFrictionSlip : c.handbrake ? this.spec.handbrakeFrictionSlip : this.spec.rearFrictionSlip;
      this.controller.setWheelFrictionSlip(i, grip);
    }

    const rot = this.body.rotation();
    const fwd = rotateVec({ x: 0, y: 0, z: 1 }, rot);
    const up = rotateVec({ x: 0, y: 1, z: 0 }, rot);
    const resist = resistanceForce(this.speed, cfg) * Math.sign(this.speed);
    const down = this.grounded() ? downforce(this.speed, cfg) : 0;
    this.body.resetForces(true);
    this.body.addForce({ x: -fwd.x * resist - up.x * down, y: -fwd.y * resist - up.y * down, z: -fwd.z * resist - up.z * down }, true);

    this.controller.updateVehicle(dt, undefined, groups(COLLISION_GROUP.VEHICLE, COLLISION_GROUP.GROUND));

    this.rpm = damp(this.rpm, engineRpm(this.speed, this.gear, cfg, c.throttle), 12, dt);
    for (let i = 0; i < this.wheels.length; i++) {
      const ws = this.wheels[i];
      ws.steering = this.controller.wheelSteering(i) ?? 0;
      ws.suspensionLength = this.controller.wheelSuspensionLength(i) ?? this.spec.suspensionRestLength;
      ws.inContact = this.controller.wheelIsInContact(i);
      const radius = this.spec.wheels[i].radius;
      ws.spin += (this.speed / radius) * dt;
      const side = Math.abs(this.controller.wheelSideImpulse(i) ?? 0);
      const forward = Math.abs(this.controller.wheelForwardImpulse(i) ?? 0);
      const lateral = clamp((side - 5) / 25, 0, 1);
      const spinning = c.handbrake && !this.spec.wheels[i].steered ? 0.6 : clamp((forward - 30) / 40, 0, 1) * (c.throttle > 0.5 ? 1 : 0);
      ws.slip = ws.inContact ? Math.max(lateral, spinning) : 0;
    }
    this.readPose(this.pose);
  }

  /** Signed speed along the chassis forward axis (m/s). */
  forwardSpeed(): number {
    const v = this.body.linvel();
    const fwd = rotateVec({ x: 0, y: 0, z: 1 }, this.body.rotation());
    return v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
  }

  /** Yaw of the chassis forward axis, matching `Math.atan2(forward.x, forward.z)` on track frames. */
  heading(): number {
    const fwd = rotateVec({ x: 0, y: 0, z: 1 }, this.body.rotation());
    return Math.atan2(fwd.x, fwd.z);
  }

  /** Nose-up angle of the chassis forward axis above the horizon (rad); negative when the nose dips. */
  pitch(): number {
    const fwd = rotateVec({ x: 0, y: 0, z: 1 }, this.body.rotation());
    return Math.asin(clamp(fwd.y, -1, 1));
  }

  /** Angular velocity about the chassis up axis (rad/s); positive turns towards +X (left). */
  yawRate(): number {
    const w = this.body.angvel();
    const up = rotateVec({ x: 0, y: 1, z: 0 }, this.body.rotation());
    return w.x * up.x + w.y * up.y + w.z * up.z;
  }

  grounded(): boolean {
    let n = 0;
    for (let i = 0; i < this.wheels.length; i++) if (this.controller.wheelIsInContact(i)) n++;
    return n >= 2;
  }

  upright(): boolean {
    const up = rotateVec({ x: 0, y: 1, z: 0 }, this.body.rotation());
    return up.y > 0.35;
  }

  teleport(pose: Pose): void {
    this.body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    this.body.setRotation({ x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.reversing = false;
    this.gear = 1;
    this.steerAngle = 0;
    this.readPose(this.pose);
    Object.assign(this.prevPose, this.pose);
  }

  position(): { x: number; y: number; z: number } {
    return this.body.translation();
  }

  velocity(): { x: number; y: number; z: number } {
    return this.body.linvel();
  }

  private readPose(out: Pose): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    out.x = t.x;
    out.y = t.y;
    out.z = t.z;
    out.qx = r.x;
    out.qy = r.y;
    out.qz = r.z;
    out.qw = r.w;
  }

  dispose(): void {
    this.physics.world.removeVehicleController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }
}

function rotateVec(v: { x: number; y: number; z: number }, q: { x: number; y: number; z: number; w: number }) {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}
