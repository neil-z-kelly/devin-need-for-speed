// UVs are dropped: the car materials are untextured.
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';

const SRC = 'public/assets/car/ferrari.glb';
const [, , DST, ratioArg, mode = 'quality', errorArg = '0.01'] = process.argv;
if (!DST || !ratioArg) throw new Error('usage: make-car-lod.mjs <dst> <ratio> [quality|sloppy] [max error]');
const ratio = Number(ratioArg);
const maxError = Number(errorArg);

function weldPositions(pos, nrm) {
  const map = new Map();
  const remap = new Uint32Array(pos.length / 3);
  const positions = [];
  const normals = [];
  for (let i = 0; i < remap.length; i++) {
    const key = `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = positions.length / 3;
      map.set(key, idx);
      positions.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      normals.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
    }
    remap[i] = idx;
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), remap };
}

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(SRC);
let before = 0;
let after = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const posAcc = prim.getAttribute('POSITION');
    const srcIdx = prim.getIndices().getArray();
    before += srcIdx.length / 3;
    const { positions, normals, remap } = weldPositions(posAcc.getArray(), prim.getAttribute('NORMAL').getArray());
    const welded = Uint32Array.from(srcIdx, (i) => remap[i]);
    const target = Math.min(welded.length, Math.max(12, Math.floor((welded.length * ratio) / 3) * 3));
    const [idx] =
      mode === 'sloppy'
        ? MeshoptSimplifier.simplifySloppy(welded, positions, 3, null, target, maxError)
        : MeshoptSimplifier.simplify(welded, positions, 3, target, maxError, ['LockBorder']);
    after += idx.length / 3;
    const buffer = posAcc.getBuffer();
    for (const sem of prim.listSemantics()) prim.setAttribute(sem, null);
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer));
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer));
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
  }
}
await doc.transform(prune(), draco());
await io.write(DST, doc);
console.log(`${SRC} ${before} triangles -> ${DST} ${after} triangles`);
