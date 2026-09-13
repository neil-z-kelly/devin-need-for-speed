import RAPIER from '@dimforge/rapier3d-compat';

let initPromise: Promise<typeof RAPIER> | null = null;

/** Rapier ships as WASM; initialise once and share the module. */
export function loadRapier(): Promise<typeof RAPIER> {
  if (!initPromise) initPromise = RAPIER.init().then(() => RAPIER);
  return initPromise;
}

export const COLLISION_GROUP = {
  /** Road surface, kerbs and ground: everything the wheel rays may hit. */
  GROUND: 0x0001,
  /** Barriers, buildings and props. */
  STATIC: 0x0002,
  VEHICLE: 0x0004,
} as const;

/** Rapier interaction groups encode (memberships << 16) | filter. */
export const groups = (memberships: number, filter: number): number => ((memberships & 0xffff) << 16) | (filter & 0xffff);

export class PhysicsWorld {
  readonly world: RAPIER.World;

  constructor(
    readonly R: typeof RAPIER,
    readonly stepDt: number,
  ) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = stepDt;
  }

  addTrimesh(vertices: Float32Array, indices: Uint32Array, memberships = COLLISION_GROUP.GROUND, friction = 1): RAPIER.Collider {
    const desc = this.R.ColliderDesc.trimesh(vertices, indices)
      .setFriction(friction)
      .setCollisionGroups(groups(memberships, 0xffff));
    return this.world.createCollider(desc);
  }

  addBox(
    center: { x: number; y: number; z: number },
    halfExtents: { x: number; y: number; z: number },
    rotationY = 0,
    memberships = COLLISION_GROUP.STATIC,
  ): RAPIER.Collider {
    const desc = this.R.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) })
      .setCollisionGroups(groups(memberships, 0xffff));
    return this.world.createCollider(desc);
  }

  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
