// @ts-check
import * as THREE from 'three';
import { MARS, marsLook, paintSky, bakeShade, groundVariation } from './marsLook.js';

/**
 * World origin offset for the isolated Martian open-world exploration zone.
 * Placed 500 meters away from the base so it is completely invisible from base windows.
 */
export const ROVER_WORLD_ORIGIN = new THREE.Vector3(500, 0, 500);

/** @param {number} heading @returns {number} Three.js yaw for a rover model whose front is +Z. */
export function roverModelYaw(heading) {
  return Math.PI - heading;
}

/** @param {number} heading @returns {number} Three.js yaw for a camera whose view direction is -Z. */
export function roverCameraYaw(heading) {
  return -heading;
}

/**
 * Geological scientific data for samples found in the open world. Texts are string keys
 * (`rover.fpv.sample.<id>.*` in src/data/strings/<lang>/control.json).
 */
export const SAMPLES_DATA = {
  seitah: {
    id: 'seitah',
    nameKey: 'rover.fpv.sample.seitah.name',
    siteKey: 'rover.fpv.sample.seitah.site',
    type: 'core',
    color: '#34d399',
    compositionKey: 'rover.fpv.sample.seitah.composition',
    analysisKey: 'rover.fpv.sample.seitah.analysis',
    coords: { x: -90, y: 170 },
  },
  delta: {
    id: 'delta',
    nameKey: 'rover.fpv.sample.delta.name',
    siteKey: 'rover.fpv.sample.delta.site',
    type: 'core',
    color: '#60a5fa',
    compositionKey: 'rover.fpv.sample.delta.composition',
    analysisKey: 'rover.fpv.sample.delta.analysis',
    coords: { x: 120, y: 235 },
  },
  backshell: {
    id: 'backshell',
    nameKey: 'rover.fpv.sample.backshell.name',
    siteKey: 'rover.fpv.sample.backshell.site',
    type: 'salvage',
    color: '#fbbf24',
    compositionKey: 'rover.fpv.sample.backshell.composition',
    analysisKey: 'rover.fpv.sample.backshell.analysis',
    coords: { x: 150, y: 90 },
  },
  parachute: {
    id: 'parachute',
    nameKey: 'rover.fpv.sample.parachute.name',
    siteKey: 'rover.fpv.sample.parachute.site',
    type: 'salvage',
    color: '#f97316',
    compositionKey: 'rover.fpv.sample.parachute.composition',
    analysisKey: 'rover.fpv.sample.parachute.analysis',
    coords: { x: -140, y: 60 },
  },
  hematite: {
    id: 'hematite',
    nameKey: 'rover.fpv.sample.hematite.name',
    siteKey: 'rover.fpv.sample.hematite.site',
    type: 'core',
    color: '#a78bfa',
    compositionKey: 'rover.fpv.sample.hematite.composition',
    analysisKey: 'rover.fpv.sample.hematite.analysis',
    coords: { x: 25, y: 110 },
  },
};

/**
 * Builds the isolated Open-World Martian exploration zone with 3D terrain,
 * detailed 3D Perseverance-class rover, articulated robotic arm, and collectibles.
 *
 * @param {THREE.Scene} scene
 * @param {import('../core/Game.js').Game} game
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Group} dolly
 * @param {any} layout
 */
export function buildRoverWorld(scene, game, camera, dolly, layout) {
  const t = game.t; // player-facing texts (src/data/strings/<lang>/control.json → rover.fpv.*)
  const root = new THREE.Group();
  root.name = 'Rover_OpenWorld';
  root.position.copy(ROVER_WORLD_ORIGIN);
  scene.add(root);

  const cfg = game.data.balance.rover;

  // =========================================================================
  // 1. MARTIAN TERRAIN & ATMOSPHERE
  // =========================================================================
  const terrainSize = 480;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, 56, 56);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    // Multi-frequency Martian dunes and crater topography
    const duna1 = Math.sin(x * 0.02) * 2.2 + Math.cos(z * 0.025) * 2.5;
    const duna2 = Math.sin(x * 0.055 + z * 0.04) * 1.1;
    const craterDist = Math.hypot(x - 50, z + 80);
    const crater = craterDist < 70 ? -Math.sin((craterDist / 70) * Math.PI) * 4.5 : 0;
    const y = Math.max(-0.5, duna1 + duna2 + crater);
    posAttr.setY(i, y);
  }
  terrainGeo.computeVertexNormals();

  // Same regolith, sky and day/night light as the Telecom window and the solar field (src/world/marsLook.js).
  // Unlit with baked shading: cheaper than lighting a 480 m terrain.
  const SUN_DIR = new THREE.Vector3(120, 250, 100).normalize();
  bakeShade(terrainGeo, MARS.ground, SUN_DIR, 0.55, groundVariation);
  const terrainMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.position.set(0, 0, 0);
  root.add(terrain);

  // Height sampling helper for placing rover and rocks on top of terrain
  const getTerrainHeight = (x, z) => {
    const duna1 = Math.sin(x * 0.02) * 2.2 + Math.cos(z * 0.025) * 2.5;
    const duna2 = Math.sin(x * 0.055 + z * 0.04) * 1.1;
    const craterDist = Math.hypot(x - 50, z + 80);
    const crater = craterDist < 70 ? -Math.sin((craterDist / 70) * Math.PI) * 4.5 : 0;
    return Math.max(-0.5, duna1 + duna2 + crater);
  };

  // Martian Sun & Lighting for Open World
  const sunLight = new THREE.DirectionalLight(0xffecd0, 1.35);
  sunLight.position.set(120, 250, 100);
  root.add(sunLight);

  const ambLight = new THREE.AmbientLight(0x73361f, 0.7);
  root.add(ambLight);

  // Martian sky dome (hazy butterscotch at the horizon, deeper overhead). The main camera only sees 60 m,
  // so the dome is small, drawn first without writing depth, and follows the camera while it is out here.
  const SKY_RADIUS = 50;
  const horizonGeo = paintSky(new THREE.SphereGeometry(SKY_RADIUS, 32, 12), -0.15 * SKY_RADIUS, SKY_RADIUS);
  const horizonMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false, depthWrite: false });
  const horizon = new THREE.Mesh(horizonGeo, horizonMat);
  horizon.renderOrder = -1;
  horizon.frustumCulled = false;
  horizon.visible = false;
  root.add(horizon);
  const camWorld = new THREE.Vector3();

  // Rocks & Boulders scattered per balance config
  const rockGeo = bakeShade(new THREE.DodecahedronGeometry(1.0, 1), MARS.rock, SUN_DIR, 0.35);
  const rockMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  if (cfg.rocks) {
    for (const r of cfg.rocks) {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const rx = r.x;
      const rz = -r.y;
      const ry = getTerrainHeight(rx, rz);
      rock.position.set(rx, ry + r.r * 0.4, rz);
      rock.scale.set(r.r, r.r * 0.75, r.r * 1.1);
      rock.rotation.set(r.x * 0.3, r.y * 0.5, 0.4);
      root.add(rock);
    }
  }

  // =========================================================================
  // 2. COLLECTIBLE SAMPLES & BEACONS
  // =========================================================================
  /** @type {Map<string, { group: THREE.Group, site: any, beaconRing: THREE.Mesh, collected: boolean }>} */
  const sampleNodes = new Map();

  const beaconGeo = new THREE.RingGeometry(1.4, 1.6, 24);
  beaconGeo.rotateX(-Math.PI / 2);

  Object.values(SAMPLES_DATA).forEach((site) => {
    const sGroup = new THREE.Group();
    const sx = site.coords.x;
    const sz = -site.coords.y;
    const sy = getTerrainHeight(sx, sz);
    sGroup.position.set(sx, sy, sz);

    // Glowing ground beacon
    const ringMat = new THREE.MeshBasicMaterial({
      color: site.color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const beaconRing = new THREE.Mesh(beaconGeo, ringMat);
    beaconRing.position.y = 0.05;
    sGroup.add(beaconRing);

    // 3D Physical Sample Model
    let sampleMesh;
    if (site.type === 'core') {
      const geo = new THREE.CylinderGeometry(0.2, 0.3, 0.6, 6);
      sampleMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: site.color }));
      sampleMesh.position.y = 0.35;
      sampleMesh.rotation.z = 0.2;
    } else {
      const geo = new THREE.BoxGeometry(0.7, 0.2, 0.6);
      sampleMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: site.color }));
      sampleMesh.position.y = 0.25;
      sampleMesh.rotation.y = 0.4;
    }
    sampleMesh.name = `sample_${site.id}`;
    sGroup.add(sampleMesh);

    root.add(sGroup);
    sampleNodes.set(site.id, { group: sGroup, site, beaconRing, collected: false });
  });

  // =========================================================================
  // 3. DETAILED 3D ROVER MODEL & ARTICULATED ROBOTIC ARM
  // =========================================================================
  const roverGroup = new THREE.Group();
  roverGroup.name = 'Rover_3D_Vehicle';
  root.add(roverGroup);

  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xd6d0c4 });
  const deckMat = new THREE.MeshLambertMaterial({ color: 0xa8a296 });
  const darkMetal = new THREE.MeshLambertMaterial({ color: 0x30343a });
  const goldFoil = new THREE.MeshLambertMaterial({ color: 0xcca033 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222428 });
  const cyanLaserMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });

  // Rover Chassis Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 2.0), whiteMat);
  body.position.set(0, 0.85, 0);
  roverGroup.add(body);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 2.1), deckMat);
  deck.position.set(0, 1.1, 0);
  roverGroup.add(deck);

  // MMRTG Nuclear Generator (rear cylinder with cooling fins)
  const mmrtg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.65, 12), darkMetal);
  mmrtg.rotation.x = Math.PI / 2;
  mmrtg.position.set(0, 1.15, -1.05);
  roverGroup.add(mmrtg);

  // High Gain Dish Antenna
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.02, 0.1, 16), whiteMat);
  dish.rotation.x = 0.6;
  dish.position.set(0.48, 1.35, -0.6);
  roverGroup.add(dish);

  // Camera Mast & Stereo NavCam Head (First-Person Eyes)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.15, 8), darkMetal);
  mast.position.set(0.45, 1.65, 0.65);
  roverGroup.add(mast);

  const mastHead = new THREE.Group();
  mastHead.position.set(0.45, 2.25, 0.65);
  roverGroup.add(mastHead);

  const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.2), whiteMat);
  mastHead.add(camBox);

  // Twin Stereo Lenses (Mastcam-Z)
  const lensGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12);
  lensGeo.rotateX(Math.PI / 2);
  const lensLeft = new THREE.Mesh(lensGeo, darkMetal);
  lensLeft.position.set(-0.1, 0, 0.11);
  const lensRight = new THREE.Mesh(lensGeo, darkMetal);
  lensRight.position.set(0.1, 0, 0.11);
  mastHead.add(lensLeft, lensRight);

  // FPV Camera mount point (where player's eyes sit in First-Person)
  const fpvCamAnchor = new THREE.Group();
  fpvCamAnchor.position.set(0, 0.06, 0.14);
  mastHead.add(fpvCamAnchor);

  // 6 Rocker-Bogie Wheels
  /** @type {THREE.Mesh[]} */
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.2, 16);
  wheelGeo.rotateZ(Math.PI / 2);

  const wheelPositions = [
    [-0.92, 0.26, 0.8],
    [0.92, 0.26, 0.8],
    [-0.96, 0.26, 0.0],
    [0.96, 0.26, 0.0],
    [-0.92, 0.26, -0.8],
    [0.92, 0.26, -0.8],
  ];
  for (const wp of wheelPositions) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wp[0], wp[1], wp[2]);
    roverGroup.add(w);
    wheels.push(w);
  }

  // =========================================================================
  // 4. ARTICULATED ROBOTIC ARM (Brazo Mecánico de Recolección y Examen)
  // =========================================================================
  const armBase = new THREE.Group();
  armBase.position.set(-0.52, 1.15, 0.85); // Front-left deck
  roverGroup.add(armBase);

  // Shoulder Turret (Yaw & Pitch)
  const shoulder = new THREE.Group();
  armBase.add(shoulder);
  const shoulderMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), darkMetal);
  shoulder.add(shoulderMesh);

  // Upper Arm Link (Length 0.7m)
  const upperArm = new THREE.Group();
  upperArm.position.set(0, 0.08, 0);
  shoulder.add(upperArm);
  const upperArmBone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 8), whiteMat);
  upperArmBone.position.set(0, 0.35, 0);
  upperArm.add(upperArmBone);

  // Elbow Joint (Pitch)
  const elbow = new THREE.Group();
  elbow.position.set(0, 0.7, 0);
  upperArm.add(elbow);
  const elbowMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), darkMetal);
  elbow.add(elbowMesh);

  // Forearm Link (Length 0.65m)
  const forearm = new THREE.Group();
  elbow.add(forearm);
  const forearmBone = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.65, 8), whiteMat);
  forearmBone.position.set(0, 0.32, 0);
  forearm.add(forearmBone);

  // Wrist Turret & Tool Instrument Head
  const wrist = new THREE.Group();
  wrist.position.set(0, 0.65, 0);
  forearm.add(wrist);

  const turretHead = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), goldFoil);
  wrist.add(turretHead);

  // 3-Finger Mechanical Claw Gripper
  const clawRoot = new THREE.Group();
  clawRoot.position.set(0, 0.12, 0);
  wrist.add(clawRoot);

  /** @type {THREE.Mesh[]} */
  const clawFingers = [];
  const fingerGeo = new THREE.BoxGeometry(0.02, 0.16, 0.03);
  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI * 2) / 3;
    const f = new THREE.Mesh(fingerGeo, darkMetal);
    f.position.set(Math.cos(ang) * 0.06, 0.08, Math.sin(ang) * 0.06);
    f.rotation.z = 0.25;
    f.rotation.y = -ang;
    clawRoot.add(f);
    clawFingers.push(f);
  }

  // Laser Scanner Beam Plane
  const laserScanner = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.04), cyanLaserMat);
  laserScanner.position.set(0, 0.05, 0.22);
  laserScanner.visible = false;
  wrist.add(laserScanner);

  // Held Sample proxy attached to the claw
  const heldSample = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.12, 0),
    new THREE.MeshLambertMaterial({ color: 0x34d399 }),
  );
  heldSample.position.set(0, 0.16, 0);
  heldSample.visible = false;
  wrist.add(heldSample);

  // Fold arm into stowed pose initially
  const setArmStowed = () => {
    shoulder.rotation.set(0, -Math.PI / 2.2, 0);
    upperArm.rotation.set(-1.45, 0, 0);
    elbow.rotation.set(2.6, 0, 0);
    wrist.rotation.set(-1.1, 0, 0);
    clawRoot.scale.set(0.6, 1, 0.6); // closed claw
    laserScanner.visible = false;
    heldSample.visible = false;
  };
  setArmStowed();

  // =========================================================================
  // 5. FIRST-PERSON MODE HUD & INTERFACE (Diegetic / Canvas Overlay)
  // =========================================================================
  const hudContainer = document.createElement('div');
  hudContainer.id = 'rover-fpv-hud';
  hudContainer.style.cssText = `
    display: none;
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    pointer-events: none;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #fff;
    user-select: none;
    z-index: 9999;
  `;

  // Top Status Bar
  const topBar = document.createElement('div');
  topBar.style.cssText = `
    position: absolute; top: 18px; left: 24px; right: 24px;
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(18, 22, 28, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    padding: 10px 18px;
    backdrop-filter: blur(4px);
  `;
  topBar.innerHTML = `
    <div>
      <span style="color: #ffaa44; font-weight: bold; font-size: 16px;">${t('rover.fpv.title')}</span>
      <span style="color: #8899a6; margin-left: 12px; font-size: 13px;">${t('rover.fpv.subtitle')}</span>
    </div>
    <div id="rover-hud-stats" style="font-size: 14px; font-weight: 500;">
      🔋 ${t('rover.fpv.battery')}: <span id="rover-hud-bat" style="color: #34d399;">100%</span> &nbsp;|&nbsp;
      🧭 ${t('rover.fpv.heading')}: <span id="rover-hud-hdg">0°</span> &nbsp;|&nbsp;
      📦 ${t('rover.fpv.samples')}: <span id="rover-hud-cargo" style="color: #60a5fa;">0</span>
    </div>
  `;
  hudContainer.appendChild(topBar);

  // Return to base button
  const exitBtn = document.createElement('button');
  exitBtn.id = 'rover-fpv-exit';
  exitBtn.style.cssText = `
    position: absolute; top: 82px; left: 24px;
    pointer-events: auto;
    background: #b83a2e; color: #fff; border: none;
    padding: 9px 16px; border-radius: 6px; font-weight: bold; font-size: 13px;
    cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5);
  `;
  exitBtn.textContent = t('rover.fpv.exit');
  hudContainer.appendChild(exitBtn);

  // Prompt alert for nearby collectible
  const promptBox = document.createElement('div');
  promptBox.id = 'rover-hud-prompt';
  promptBox.style.cssText = `
    position: absolute; bottom: 120px; left: 50%; transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.9);
    border: 2px solid #38bdf8; border-radius: 10px;
    padding: 14px 28px; font-size: 16px; font-weight: 600;
    text-align: center; color: #f8fafc;
    box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
    display: none;
  `;
  hudContainer.appendChild(promptBox);

  // Scientific Inspection Card (during arm examination)
  const inspectCard = document.createElement('div');
  inspectCard.id = 'rover-hud-inspect';
  inspectCard.style.cssText = `
    position: absolute; top: 120px; right: 40px; width: 340px;
    background: rgba(15, 23, 42, 0.92);
    border: 2px solid #34d399; border-radius: 10px;
    padding: 18px; color: #f8fafc;
    box-shadow: 0 0 25px rgba(52, 211, 153, 0.4);
    display: none;
  `;
  hudContainer.appendChild(inspectCard);

  // Bottom Control hints
  const bottomHint = document.createElement('div');
  bottomHint.style.cssText = `
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.65); border-radius: 6px; padding: 6px 16px;
    font-size: 13px; color: #cbd5e1;
  `;
  bottomHint.innerHTML = t('rover.fpv.controls');
  hudContainer.appendChild(bottomHint);

  document.body.appendChild(hudContainer);

  // =========================================================================
  // 6. ANIMATION & CONTROL STATE
  // =========================================================================
  let isFPV = false;
  let savedDollyPos = new THREE.Vector3();
  let savedDollyRot = 0;

  // Arm Sequence Timers
  let isSampling = false;
  let sampleTimer = 0;
  let activeSample = null;

  // Key tracking for direct First-Person driving
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (isFPV) {
      if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyQ'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'KeyQ' || e.code === 'Escape') exitFPV();
      if ((e.code === 'KeyE' || e.code === 'Space') && !isSampling) {
        startSampleSequence();
      }
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  // Exit FPV button
  exitBtn.addEventListener('click', () => exitFPV());

  // Click canvas in FPV to interact
  window.addEventListener('click', () => {
    if (isFPV && !isSampling) startSampleSequence();
  });

  function enterFPV() {
    if (isFPV) return;
    isFPV = true;
    savedDollyPos.copy(dolly.position);
    savedDollyRot = dolly.rotation.y;
    hudContainer.style.display = 'block';
  }

  function exitFPV() {
    if (!isFPV) return;
    isFPV = false;
    hudContainer.style.display = 'none';
    dolly.position.copy(savedDollyPos);
    dolly.rotation.y = savedDollyRot;
  }

  // Triggering the robotic arm collection sequence
  function startSampleSequence(siteId = null) {
    const s = game.sim;
    const r = s.rover;
    if (!r || isSampling) return;

    // Find nearest sample within reach (<= 4.5m)
    let candidate = null;
    let minDist = 4.5;
    for (const [id, node] of sampleNodes) {
      if (node.collected) continue;
      const d = Math.hypot(node.site.coords.x - r.x, node.site.coords.y - r.y);
      if (d < minDist) {
        minDist = d;
        candidate = node.site;
      }
    }

    if (!candidate && siteId) {
      candidate = SAMPLES_DATA[siteId];
    }

    if (!candidate) return;

    activeSample = candidate;
    isSampling = true;
    sampleTimer = 0;
    game.intent('rover:command', { cmd: 'sample' });
  }

  // Listen to simulation intents
  game.sim.bus.on('rover:fpv', () => {
    if (isFPV) exitFPV();
    else enterFPV();
  });

  game.sim.bus.on('rover:command', (e) => {
    if (e?.cmd === 'sample') {
      startSampleSequence();
    }
  });

  // Render Target for live monitor in Control Room
  const renderTarget = new THREE.WebGLRenderTarget(512, 384);
  const roverCamera = new THREE.PerspectiveCamera(65, 512 / 384, 0.1, 500);

  return {
    root,
    roverGroup,
    roverCamera,
    renderTarget,
    get isFPV() {
      return isFPV;
    },
    enterFPV,
    exitFPV,

    /**
     * @param {number} dt in real seconds
     */
    update(dt) {
      const s = game.sim;
      // Same day/night/storm look as the other exterior views.
      const look = marsLook(s.time.clock().hourFloat, Boolean(s.power.stormActive), s.power.cfg);
      horizonMat.color.setRGB(...look.sky);
      terrainMat.color.setScalar(look.ground);
      rockMat.color.setScalar(look.ground);
      sunLight.intensity = 1.35 * look.ground;
      // Sky dome only around a camera that is inside the rover world (never around the base).
      camera.getWorldPosition(camWorld);
      root.worldToLocal(camWorld);
      horizon.visible = Math.hypot(camWorld.x, camWorld.z) < terrainSize * 0.6;
      if (horizon.visible) horizon.position.copy(camWorld);
      const r = s.rover;
      if (!r) return;

      // ---- 1. DRIVE LOGIC IN FPV MODE ----
      if (isFPV && !isSampling) {
        let driveDir = 0;
        let turnDir = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) driveDir += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) driveDir -= 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) turnDir -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) turnDir += 1;

        if (turnDir !== 0) {
          r.heading = (r.heading + turnDir * dt * 0.8 + Math.PI * 2) % (Math.PI * 2);
        }

        if (driveDir !== 0) {
          const speed = 3.5; // m/s responsive real-time speed in open world
          const step = driveDir * speed * dt;
          const nx = r.x + Math.sin(r.heading) * step;
          const ny = r.y + Math.cos(r.heading) * step;

          // Check rock collisions
          let hit = false;
          if (cfg.rocks) {
            for (const rock of cfg.rocks) {
              if (Math.hypot(rock.x - nx, rock.y - ny) < rock.r + 1.2) {
                hit = true;
                break;
              }
            }
          }

          if (!hit) {
            r.x = nx;
            r.y = ny;
            r.odometerM += Math.abs(step);
            r.batteryWh = Math.max(0, r.batteryWh - Math.abs(step) * 0.08);
            // Spin wheels
            const wheelSpin = (step / 0.26) * 1.5;
            for (const w of wheels) w.rotation.x += wheelSpin;
          }
        }
      }

      // ---- 2. SYNCHRONIZE 3D ROVER POSE ON TERRAIN ----
      const worldX = r.x;
      const worldZ = -r.y;
      const terrainY = getTerrainHeight(worldX, worldZ);
      roverGroup.position.set(worldX, terrainY, worldZ);
      roverGroup.rotation.y = roverModelYaw(r.heading);

      // Keep the rover camera a short distance above and behind the vehicle.
      roverCamera.position.set(0, 1.4, -5.5);
      roverGroup.localToWorld(roverCamera.position);
      roverCamera.rotation.set(0, roverCameraYaw(r.heading), 0);

      // In FPV mode, move dolly to rover camera
      if (isFPV) {
        dolly.position.copy(roverCamera.position);
        dolly.rotation.y = roverCameraYaw(r.heading);

        // Update HUD
        const batElem = document.getElementById('rover-hud-bat');
        const hdgElem = document.getElementById('rover-hud-hdg');
        const cargoElem = document.getElementById('rover-hud-cargo');
        if (batElem) batElem.textContent = `${Math.round(r.batteryPct)}%`;
        if (hdgElem) hdgElem.textContent = `${Math.round((r.heading * 180) / Math.PI)}°`;
        if (cargoElem) cargoElem.textContent = `${r.cargo?.length ?? 0}`;

        // Find nearest sample to show prompt
        let nearest = null;
        let dist = 999;
        for (const [id, node] of sampleNodes) {
          if (node.collected) continue;
          const d = Math.hypot(node.site.coords.x - r.x, node.site.coords.y - r.y);
          if (d < dist) {
            dist = d;
            nearest = node.site;
          }
        }

        if (nearest && dist < 18) {
          promptBox.style.display = 'block';
          if (dist <= 3.8 && !isSampling) {
            promptBox.innerHTML = `🎯 <b>${t('rover.fpv.detected', { name: t(nearest.nameKey).toUpperCase() })}</b><br><span style="color: #34d399; font-size: 14px;">${t('rover.fpv.collect')}</span>`;
          } else if (isSampling) {
            promptBox.innerHTML = `🦾 <b style="color: #38bdf8;">${t('rover.fpv.arm_busy')}</b>`;
          } else {
            promptBox.innerHTML = `📍 <b>${t('rover.fpv.nearby', { name: t(nearest.nameKey) })}</b> · ${t('rover.fpv.distance', { m: Math.round(dist) })}`;
          }
        } else {
          promptBox.style.display = 'none';
        }
      }

      // ---- 3. ROBOTIC ARM ANIMATION SEQUENCE ----
      if (isSampling && activeSample) {
        sampleTimer += dt;

        if (sampleTimer < 2.5) {
          // Phase 1: Unfold arm down towards the ground
          const p = sampleTimer / 2.5;
          shoulder.rotation.set(0, THREE.MathUtils.lerp(-Math.PI / 2.2, 0.2, p), 0);
          upperArm.rotation.set(THREE.MathUtils.lerp(-1.45, 0.45, p), 0, 0);
          elbow.rotation.set(THREE.MathUtils.lerp(2.6, 1.25, p), 0, 0);
          wrist.rotation.set(THREE.MathUtils.lerp(-1.1, 0.4, p), 0, 0);
          clawRoot.scale.set(1.4, 1, 1.4); // claw opens
        } else if (sampleTimer < 4.0) {
          // Phase 2: Claw grips the rock
          const p = (sampleTimer - 2.5) / 1.5;
          clawRoot.scale.set(THREE.MathUtils.lerp(1.4, 0.5, p), 1, THREE.MathUtils.lerp(1.4, 0.5, p));
          heldSample.visible = true;
          /** @type {THREE.MeshLambertMaterial} */ (heldSample.material).color.set(activeSample.color);
        } else if (sampleTimer < 7.0) {
          // Phase 3: Lift rock up in front of the camera lens!
          const p = (sampleTimer - 4.0) / 3.0;
          shoulder.rotation.set(0, THREE.MathUtils.lerp(0.2, 0.05, p), 0);
          upperArm.rotation.set(THREE.MathUtils.lerp(0.45, -0.65, p), 0, 0);
          elbow.rotation.set(THREE.MathUtils.lerp(1.25, 1.55, p), 0, 0);
          wrist.rotation.set(THREE.MathUtils.lerp(0.4, 0.15, p), 0, 0);
        } else if (sampleTimer < 13.0) {
          // Phase 4: Full 3D Inspection & Laser Scanning at eye level!
          const scanTime = sampleTimer - 7.0;
          laserScanner.visible = true;
          laserScanner.position.y = 0.08 + Math.sin(scanTime * 3) * 0.12;

          // Rotate the sample in the claw so player sees it from all sides
          wrist.rotation.y = scanTime * 0.75;
          wrist.rotation.z = Math.sin(scanTime * 1.5) * 0.2;

          // Show high-tech holographic inspection card
          if (isFPV) {
            inspectCard.style.display = 'block';
            inspectCard.innerHTML = `
              <div style="font-size: 11px; letter-spacing: 1px; color: #34d399; font-weight: bold;">${t('rover.fpv.analysis')}</div>
              <div style="font-size: 16px; font-weight: bold; margin: 6px 0; color: #fff;">${t(activeSample.nameKey)}</div>
              <div style="font-size: 12px; color: #94a3b8; margin-bottom: 8px;">${t('rover.fpv.location', { site: t(activeSample.siteKey) })}</div>
              <div style="font-size: 13px; margin-bottom: 6px;"><b>${t('rover.fpv.composition')}</b> ${t(activeSample.compositionKey)}</div>
              <div style="font-size: 12px; color: #cbd5e1; line-height: 1.4;">${t(activeSample.analysisKey)}</div>
              <div style="margin-top: 10px; font-size: 11px; color: #38bdf8;">${t('rover.fpv.storing')}</div>
            `;
          }
        } else if (sampleTimer < 15.5) {
          // Phase 5: Deposit into sample canister
          laserScanner.visible = false;
          if (isFPV) inspectCard.style.display = 'none';

          const p = (sampleTimer - 13.0) / 2.5;
          shoulder.rotation.set(0, THREE.MathUtils.lerp(0.05, -Math.PI / 2.2, p), 0);
          upperArm.rotation.set(THREE.MathUtils.lerp(-0.65, -1.2, p), 0, 0);
          elbow.rotation.set(THREE.MathUtils.lerp(1.55, 2.2, p), 0, 0);
          if (p > 0.7) {
            heldSample.visible = false;
            clawRoot.scale.set(1.2, 1, 1.2); // open to drop
          }
        } else if (sampleTimer < 17.0) {
          // Phase 6: Stow arm
          setArmStowed();
        } else {
          // Completed
          isSampling = false;
          const node = sampleNodes.get(activeSample.id);
          if (node) {
            node.collected = true;
            node.group.visible = false;
          }
          activeSample = null;
          setArmStowed();
        }
      }

      // Animate sample beacon pulses
      const time = performance.now() * 0.003;
      for (const [id, node] of sampleNodes) {
        if (!node.collected) {
          node.beaconRing.scale.setScalar(1.0 + Math.sin(time + id.length) * 0.12);
        }
      }
    },
  };
}
