import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Panoramic window in the Telecom room with industrial reinforced frame and tinted glass.
 * The 3D telecom antenna, circular Martian terrain, red dunes, rocks, sky, and dust
 * are rendered in the unified MarsExterior module (src/world/MarsExterior.js).
 *
 * @param {THREE.Scene} scene
 * @param {() => any} getSim returns the current Simulation
 * @param {{ center: [number, number, number], width: number, height: number }} [win] window opening (world)
 * @param {any} [marsExterior] optional reference to MarsExterior
 */
export function buildPorthole(scene, getSim, win = { center: [0, 1.6, 0], width: 1.8, height: 0.96 }, marsExterior = null) {
  const root = new THREE.Group();
  root.name = 'Porthole_System';
  scene.add(root);
  const [wx, wy, wz] = win.center;

  // ---------------------------------------------------------------------------
  // 1. Frame + glass
  // ---------------------------------------------------------------------------
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x42474e });
  const hw = win.width / 2 + 0.02;
  const hh = win.height / 2;
  const frame = new THREE.Mesh(
    mergeGeometries([
      new THREE.BoxGeometry(win.width + 0.04, 0.06, 0.16).translate(0, hh, 0), // top
      new THREE.BoxGeometry(win.width + 0.04, 0.08, 0.2).translate(0, -hh, 0.02), // sill
      new THREE.BoxGeometry(0.06, win.height, 0.16).translate(-hw + 0.03, 0, 0),
      new THREE.BoxGeometry(0.06, win.height, 0.16).translate(hw - 0.03, 0, 0),
      new THREE.BoxGeometry(0.08, win.height, 0.14), // centre beam
    ]),
    frameMat,
  );
  frame.position.set(wx, wy, wz);
  root.add(frame);

  // Rivets along top and sill: one instanced draw call
  const rivetPositions = [];
  for (let x = -hw + 0.12; x <= hw - 0.12 + 1e-6; x += 0.2) {
    rivetPositions.push([x, hh, 0.08], [x, -hh, 0.1]);
  }
  const rivets = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8).rotateX(Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x22262a }),
    rivetPositions.length,
  );
  const tmp = new THREE.Object3D();
  rivetPositions.forEach(([x, y, z], i) => {
    tmp.position.set(wx + x, wy + y, wz + z);
    tmp.updateMatrix();
    rivets.setMatrixAt(i, tmp.matrix);
  });
  root.add(rivets);

  // Unlit tinted glass
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(win.width - 0.06, win.height - 0.04),
    new THREE.MeshBasicMaterial({ color: 0x7eb8d0, transparent: true, opacity: 0.14, depthWrite: false }),
  );
  glass.position.set(wx, wy, wz + 0.01);
  root.add(glass);

  return {
    root,
    update(dt) {
      // Unified exterior animation is driven by MarsExterior.update(dt)
    },
  };
}
