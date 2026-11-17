// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MARS } from './marsLook.js';
import { fieldLook } from './SolarField.js';

/**
 * World coordinates of the base center (hub midpoint).
 * Habitat footprint is roughly x ∈ [-10, 15], z ∈ [-8.5, 11].
 */
export const BASE_CENTER = new THREE.Vector3(2.5, 0, 1.25);
export const BASE_EXCLUSION_RADIUS = 16.5;

/**
 * Creates the single unified exterior Martian world for Mars-sector-XR.
 * Visible continuously from all habitat windows (Telecom north, Energía east, etc.).
 *
 * Components:
 * 1. Circular immersive terrain disk (r=170m) with dunes, crater ripples and perimeter mountain rim.
 * 2. Instanced Martian rocks (65 natural boulders, clusters visible through windows).
 * 3. Atmospheric Sky Dome with horizon gradient and smooth day/night transitions.
 * 4. Atmospheric Fog (blends ground into the sky horizon seamlessly).
 * 5. Dynamic Sun, Directional Light (solar) and Ambient Light (atmosphere).
 * 6. Night Sky with stars, Phobos, and base exterior beacon lighting.
 * 7. Global suspended dust particle system with wind drift and storm dynamics.
 * 8. Telecom parabolic antenna outside the Telecom window (turns with alignment, motor fault jitter).
 * 9. Photovoltaic solar array (2×6 panels) with crisp silicon wafer textures, tracker rotation,
 *    electrodynamic cleaning wave, and complete fix for black geometry bugs.
 * 10. MARS-CLEANER autonomous maintenance rover with visible compressed-air bursts.
 *
 * @param {THREE.Scene} scene
 * @param {() => any} getSim returns the current Simulation instance
 */
export function buildMarsExterior(scene, getSim) {
  const root = new THREE.Group();
  root.name = 'MarsExterior_Unified';
  scene.add(root);

  // ---------------------------------------------------------------------------
  // 1. DYNAMIC LIGHTING & ATMOSPHERIC FOG
  // ---------------------------------------------------------------------------
  // Sunlight (Directional)
  const sunLight = new THREE.DirectionalLight(0xffeed8, 1.35);
  sunLight.name = 'Mars_SunLight';
  sunLight.position.set(40, 70, 30);
  root.add(sunLight);

  // Ambient light (Martian atmospheric diffuse scatter)
  const ambientLight = new THREE.AmbientLight(0x9a5832, 0.52);
  ambientLight.name = 'Mars_AmbientLight';
  root.add(ambientLight);

  // Scene fog: blends the circular terrain rim into the sky dome horizon
  const fog = new THREE.FogExp2(0xd28652, 0.0038);
  scene.fog = fog;

  // ---------------------------------------------------------------------------
  // 2. ATMOSPHERIC SKY DOME, SUN MESH & CELESTIAL BODIES
  // ---------------------------------------------------------------------------
  const skyRadius = 240;
  // Hemispherical sky dome with BackSide
  const skyGeo = new THREE.SphereGeometry(skyRadius, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const skyPos = skyGeo.attributes.position;
  const skyCols = new Float32Array(skyPos.count * 3);

  for (let i = 0; i < skyPos.count; i++) {
    const y = skyPos.getY(i);
    const k = Math.min(1, Math.max(0, y / (skyRadius * 0.95))); // 0 at horizon, 1 at zenith
    // Butterscotch / dusty orange at horizon -> deeper warm terracotta at zenith
    const r = 0.82 - 0.45 * k;
    const g = 0.52 - 0.38 * k;
    const b = 0.32 - 0.25 * k;
    skyCols.set([r, g, b], i * 3);
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyCols, 3));

  const skyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.position.set(BASE_CENTER.x, 0, BASE_CENTER.z);
  root.add(skyDome);

  // Visual Sun mesh + Corona
  const sunGroup = new THREE.Group();
  sunGroup.name = 'Sun_Visual';
  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(4.2, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffeed8, toneMapped: false }),
  );
  const sunHalo = new THREE.Mesh(
    new THREE.SphereGeometry(8.5, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffaa66,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  // Blue scattering halo (Martian sunrise/sunset signature)
  const sunBlueHalo = new THREE.Mesh(
    new THREE.SphereGeometry(14.0, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0x66a2e0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  sunGroup.add(sunCore, sunHalo, sunBlueHalo);
  root.add(sunGroup);

  // Stars in the night sky (350 points)
  const starCount = 350;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = 0.08 + Math.random() * (Math.PI * 0.45); // above the horizon
    const r = skyRadius * 0.96;
    starPositions[i * 3] = BASE_CENTER.x + r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = BASE_CENTER.z + r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.18,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  root.add(stars);

  // Phobos: Mars' irregular moon
  const phobosGeo = new THREE.DodecahedronGeometry(2.4, 1);
  const phobosMat = new THREE.MeshBasicMaterial({ color: 0xbfb6ab });
  const phobos = new THREE.Mesh(phobosGeo, phobosMat);
  phobos.scale.set(1.4, 0.9, 1.15);
  phobos.position.set(BASE_CENTER.x + 85, 95, BASE_CENTER.z - 130);
  phobos.visible = false;
  root.add(phobos);

  // ---------------------------------------------------------------------------
  // 3. CIRCULAR IMMERSIVE TERRAIN
  // ---------------------------------------------------------------------------
  // Outer radius 175m with 72 radial segments and 48 concentric rings
  const terrainRadius = 175;
  const terrainGeo = new THREE.RingGeometry(0.1, terrainRadius, 72, 48);
  terrainGeo.rotateX(-Math.PI / 2);
  terrainGeo.translate(BASE_CENTER.x, 0, BASE_CENTER.z);

  const tPos = terrainGeo.attributes.position;
  const tColors = new Float32Array(tPos.count * 3);

  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i);
    const z = tPos.getZ(i);
    const dx = x - BASE_CENTER.x;
    const dz = z - BASE_CENTER.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const theta = Math.atan2(dz, dx);

    let y = -0.15;
    if (dist > BASE_EXCLUSION_RADIUS) {
      const blend = Math.min(1.0, (dist - BASE_EXCLUSION_RADIUS) / 8.0);
      // Gentle rolling dunes & crater swells
      const d1 = 0.58 * Math.sin(x * 0.065 + 0.5) * Math.cos(z * 0.075 + 0.3);
      const d2 = 0.36 * Math.sin(x * 0.16 + z * 0.14);
      const d3 = 0.18 * Math.cos(x * 0.35 - z * 0.28);
      const d4 = 0.08 * Math.sin(x * 0.85 + z * 0.75);
      y = -0.15 + blend * (d1 + d2 + d3 + d4);

      // Distant perimeter mountain rim (crater walls in the distance, 20m - 34m tall)
      if (dist > 95) {
        const u = (dist - 95) / 80.0;
        const rim = u * u * (25.0 + 8.5 * Math.sin(theta * 4 + 1.2) + 5.5 * Math.cos(theta * 9 - 0.5) + 3.0 * Math.sin(theta * 19));
        y += rim;
      }
    }
    tPos.setY(i, y);

    // Natural Martian coloration: base rust (#b85226), dunes/sand (#d98d4e), basalt troughs (#612b18)
    const sandFactor = 0.5 + 0.5 * Math.sin(x * 0.12 + z * 0.08);
    const rockFactor = 0.5 + 0.5 * Math.sin(x * 0.35 - z * 0.25);
    const r = THREE.MathUtils.lerp(0.35, 0.72, sandFactor * 0.7 + 0.3) * (0.85 + 0.15 * rockFactor);
    const g = THREE.MathUtils.lerp(0.14, 0.38, sandFactor * 0.7 + 0.3) * (0.85 + 0.15 * rockFactor);
    const b = THREE.MathUtils.lerp(0.05, 0.16, sandFactor * 0.7 + 0.3) * (0.85 + 0.15 * rockFactor);
    tColors.set([r, g, b], i * 3);
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(tColors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.08,
    flatShading: false,
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.name = 'Mars_Terrain';
  terrain.receiveShadow = true;
  root.add(terrain);

  // ---------------------------------------------------------------------------
  // 4. INSTANCED MARTIAN ROCKS
  // ---------------------------------------------------------------------------
  // Hand-tuned clusters visible from Telecom window (north) and Solar window (east)
  // plus randomized distribution around the 360-degree perimeter.
  const rockPlacements = [
    // Telecom window cluster (north: x ≈ -9 to -6, z ≈ -10 to -24)
    { x: -8.3, z: -11.5, s: 0.95, ry: 0.4 },
    { x: -6.4, z: -12.2, s: 0.75, ry: 1.2 },
    { x: -9.1, z: -14.6, s: 1.45, ry: 2.1 },
    { x: -5.8, z: -15.3, s: 1.2, ry: 0.8 },
    { x: -7.6, z: -18.2, s: 1.8, ry: 2.9 },
    { x: -10.2, z: -21.0, s: 1.1, ry: 1.7 },
    { x: -6.1, z: -23.5, s: 2.2, ry: 0.5 },

    // Solar field cluster (east: x ≈ 18 to 36, z ≈ -2 to 16)
    { x: 19.5, z: 2.5, s: 0.85, ry: 0.9 },
    { x: 21.2, z: 8.4, s: 1.3, ry: 1.8 },
    { x: 23.0, z: -1.2, s: 1.05, ry: 2.4 },
    { x: 24.5, z: 15.2, s: 1.6, ry: 0.6 },
    { x: 30.5, z: 3.8, s: 1.9, ry: 3.1 },
    { x: 32.0, z: 12.0, s: 1.4, ry: 1.4 },
    { x: 35.2, z: 7.2, s: 2.6, ry: 2.0 },
    { x: 22.8, z: 17.5, s: 1.15, ry: 0.3 },
  ];

  // Additional 45 rocks procedurally scattered across the terrain (r=22m to 120m)
  const rngSeed = 42;
  let sVal = rngSeed;
  const pseudoRng = () => {
    sVal = (sVal * 1664525 + 1013904223) >>> 0;
    return sVal / 4294967296;
  };

  for (let k = 0; k < 45; k++) {
    const angle = pseudoRng() * Math.PI * 2;
    const r = 24 + pseudoRng() * 95;
    const rx = BASE_CENTER.x + Math.cos(angle) * r;
    const rz = BASE_CENTER.z + Math.sin(angle) * r;
    const scale = 0.5 + pseudoRng() * 2.2;
    rockPlacements.push({ x: rx, z: rz, s: scale, ry: pseudoRng() * Math.PI * 2 });
  }

  const baseRockGeo = new THREE.DodecahedronGeometry(0.45, 1);
  const rockGeo = baseRockGeo.index ? baseRockGeo.toNonIndexed() : baseRockGeo;
  // Deform rock vertices slightly for natural organic boulder facets
  const rP = rockGeo.attributes.position;
  for (let i = 0; i < rP.count; i++) {
    const vx = rP.getX(i);
    const vy = rP.getY(i);
    const vz = rP.getZ(i);
    const factor = 1.0 + 0.18 * Math.sin(vx * 4.0 + vy * 3.0 + vz * 5.0);
    rP.setXYZ(i, vx * factor, vy * factor * 0.82, vz * factor);
  }
  rockGeo.computeVertexNormals();

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x7a3a22,
    roughness: 0.92,
    metalness: 0.12,
  });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockPlacements.length);
  rockMesh.name = 'Mars_Rocks_Instanced';
  const tmpObj = new THREE.Object3D();

  rockPlacements.forEach((rc, idx) => {
    // Height follows the terrain undulating formula at that location
    const dx = rc.x - BASE_CENTER.x;
    const dz = rc.z - BASE_CENTER.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    let ry = -0.15;
    if (dist > BASE_EXCLUSION_RADIUS) {
      const blend = Math.min(1.0, (dist - BASE_EXCLUSION_RADIUS) / 8.0);
      const d1 = 0.58 * Math.sin(rc.x * 0.065 + 0.5) * Math.cos(rc.z * 0.075 + 0.3);
      const d2 = 0.36 * Math.sin(rc.x * 0.16 + rc.z * 0.14);
      ry = -0.15 + blend * (d1 + d2);
    }
    tmpObj.position.set(rc.x, ry + rc.s * 0.28, rc.z);
    tmpObj.scale.set(rc.s, rc.s * 0.8, rc.s * 1.1);
    tmpObj.rotation.set(0.2 * Math.sin(rc.ry), rc.ry, 0.15 * Math.cos(rc.ry));
    tmpObj.updateMatrix();
    rockMesh.setMatrixAt(idx, tmpObj.matrix);
  });
  rockMesh.instanceMatrix.needsUpdate = true;
  root.add(rockMesh);

  // ---------------------------------------------------------------------------
  // 5. GLOBAL SUSPENDED DUST PARTICLE SYSTEM
  // ---------------------------------------------------------------------------
  const dustCount = 350;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustVelocities = new Float32Array(dustCount * 3);

  for (let i = 0; i < dustCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 4.0 + Math.random() * 52.0;
    dustPositions[i * 3] = BASE_CENTER.x + Math.cos(angle) * r;
    dustPositions[i * 3 + 1] = 0.35 + Math.random() * 9.0;
    dustPositions[i * 3 + 2] = BASE_CENTER.z + Math.sin(angle) * r;

    // Drifts eastward (+X) and slightly northward (-Z) with minor turbulence
    dustVelocities[i * 3] = 1.0 + Math.random() * 1.8;
    dustVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.25;
    dustVelocities[i * 3 + 2] = -0.3 + (Math.random() - 0.5) * 0.6;
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: MARS.dust,
    size: 0.055,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.name = 'Mars_Global_Dust';
  root.add(dustPoints);

  // ---------------------------------------------------------------------------
  // 6. TELECOM ANTENNA DISH (Located outside North telecom window at x=-7.5, z=-9.9)
  // ---------------------------------------------------------------------------
  const antennaRoot = new THREE.Group();
  antennaRoot.name = 'Telecom_Antenna_3D';
  antennaRoot.position.set(-7.5, 0, -9.88);
  root.add(antennaRoot);

  const metalMat = new THREE.MeshLambertMaterial({ color: 0x5a636c });
  const dishMat = new THREE.MeshLambertMaterial({ color: 0xd8dde4 });
  const mastHeight = 1.9;

  const strut = (/** @type {number} */ a) => {
    const g = new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35));
    return g.applyMatrix4(m).translate(Math.cos(a) * 0.35, 0.5, Math.sin(a) * 0.35);
  };
  const mast = new THREE.Mesh(
    mergeGeometries([
      new THREE.CylinderGeometry(0.06, 0.14, mastHeight, 8).translate(0, mastHeight / 2, 0),
      ...[0, 1, 2, 3].map((i) => strut((i * Math.PI) / 2)),
    ]),
    metalMat,
  );
  antennaRoot.add(mast);

  // Red blinking beacon at the antenna apex
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222, toneMapped: false });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), beaconMat);
  beacon.position.set(0, mastHeight + 0.45, 0);
  antennaRoot.add(beacon);

  const antYawPivot = new THREE.Group();
  antYawPivot.position.set(0, mastHeight, 0);
  antennaRoot.add(antYawPivot);

  const antPitchPivot = new THREE.Group();
  antPitchPivot.position.set(0, 0.12, 0);
  antYawPivot.add(antPitchPivot);

  const receiverParts = [
    new THREE.TorusGeometry(0.65, 0.03, 8, 28).rotateX(Math.PI / 2),
    new THREE.ConeGeometry(0.04, 0.22, 8).rotateX(Math.PI / 2).translate(0, 0, 0.32),
  ];
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const leg = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6);
    leg.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.55, 0, angle + Math.PI / 2)));
    receiverParts.push(leg.translate((Math.cos(angle) * 0.4) / 2, (Math.sin(angle) * 0.4) / 2, 0.16));
  }
  const receiver = new THREE.Mesh(mergeGeometries(receiverParts), metalMat);
  const dishBowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.42).rotateX(-Math.PI / 2),
    dishMat,
  );
  antPitchPivot.add(receiver, dishBowl);

  // ---------------------------------------------------------------------------
  // 7. MARS-CLEANER DOCK & SECONDARY MAINTENANCE ROVER 3D
  // ---------------------------------------------------------------------------
  const cleanerGroup = new THREE.Group();
  cleanerGroup.name = 'MARS_CLEANER_System';
  root.add(cleanerGroup);

  const cleanerRouteData = getSim()?.cleaner;
  const laneX = cleanerRouteData?.laneX ?? [23.6, 27.1];
  const routeCrossovers = cleanerRouteData?.routeCrossovers ?? [-2, 17.5];
  const dockRoutePos = cleanerRouteData?.dockPos ?? { x: 22.0, z: 1.5 };
  const railGeometries = [];
  const sleeperGeometries = [];
  const addTrackSegment = (x1, z1, x2, z2) => {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    if (length < 0.1) return;
    const alongX = Math.abs(dx) >= Math.abs(dz);
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    const gauge = 0.56;
    for (const offset of [-gauge / 2, gauge / 2]) {
      const rail = alongX
        ? new THREE.BoxGeometry(length, 0.045, 0.045).translate(midX, 0.035, midZ + offset)
        : new THREE.BoxGeometry(0.045, 0.045, length).translate(midX + offset, 0.035, midZ);
      railGeometries.push(rail);
    }
    for (let distance = 0.4; distance < length; distance += 1.2) {
      const ratio = distance / length;
      const x = x1 + dx * ratio;
      const z = z1 + dz * ratio;
      const sleeper = alongX
        ? new THREE.BoxGeometry(0.06, 0.025, gauge + 0.12).translate(x, 0.012, z)
        : new THREE.BoxGeometry(gauge + 0.12, 0.025, 0.06).translate(x, 0.012, z);
      sleeperGeometries.push(sleeper);
    }
  };
  const northRouteEnd = routeCrossovers[0];
  const southRouteEnd = routeCrossovers[1];
  for (const x of laneX) addTrackSegment(x, northRouteEnd, x, southRouteEnd);
  for (const z of routeCrossovers) addTrackSegment(laneX[0], z, laneX[1], z);
  addTrackSegment(dockRoutePos.x, dockRoutePos.z, laneX[0], dockRoutePos.z);
  const guideRails = new THREE.Group();
  guideRails.name = 'MARS_CLEANER_GuideRails';
  guideRails.add(
    new THREE.Mesh(
      mergeGeometries(railGeometries),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5, metalness: 0.72 }),
    ),
    new THREE.Mesh(
      mergeGeometries(sleeperGeometries),
      new THREE.MeshStandardMaterial({ color: 0x785a3a, roughness: 0.9 }),
    ),
  );
  cleanerGroup.add(guideRails);

  // Docking platform pad outside east window
  const dockPadMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.7, metalness: 0.4 });
  const dockPad = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.08, 8), dockPadMat);
  dockPad.position.set(22.0, 0.04, 1.5);
  // Dock power conduit connected to base
  const dockConduit = new THREE.Mesh(
    new THREE.BoxGeometry(7.0, 0.06, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 }),
  );
  dockConduit.position.set(18.5, 0.03, 1.5);
  // Charging pylon
  const pylon = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.8, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.6 }),
  );
  pylon.position.set(22.0, 0.4, 0.5);
  const pylonLightMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, toneMapped: false });
  const pylonLight = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), pylonLightMat);
  pylonLight.position.set(22.0, 0.85, 0.5);
  cleanerGroup.add(dockPad, dockConduit, pylon, pylonLight);

  // MARS-CLEANER vehicle mesh (compact yellow industrial maintenance crawler)
  const cleanerRover = new THREE.Group();
  cleanerRover.name = 'MARS_CLEANER_Rover_3D';
  cleanerRover.position.set(22.0, 0.16, 1.5);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4, metalness: 0.3 }); // industrial safety yellow
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8, metalness: 0.4 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.65 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5, metalness: 0.5 });
  const brushMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.9 }); // blue microfiber brush

  // Main chassis box
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.95), bodyMat);
  const wheelMeshes = [];
  const wheelGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12).rotateZ(Math.PI / 2);
  const hubGeometry = new THREE.CylinderGeometry(0.065, 0.065, 0.125, 10).rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    for (const axle of [-1, 1]) {
      const x = side * 0.46;
      const z = axle * 0.32;
      const wheel = new THREE.Mesh(wheelGeometry, wheelMat);
      wheel.name = 'MARS_CLEANER_Wheel';
      wheel.position.set(x, -0.02, z);
      const hub = new THREE.Mesh(hubGeometry, hubMat);
      hub.position.set(side * 0.525, -0.02, z);
      cleanerRover.add(wheel, hub);
      wheelMeshes.push(wheel);
    }
  }
  // Cleaning arm & brush roller
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6).rotateZ(Math.PI / 3), armMat);
  arm.position.set(0, 0.25, 0.45);
  const brushRoller = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 12).rotateZ(Math.PI / 2), brushMat);
  brushRoller.position.set(0, 0.42, 0.72);
  const airJetMaterial = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const airJet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.2, 0.9, 10, 1, true).rotateX(-Math.PI / 2),
    airJetMaterial,
  );
  airJet.position.set(0, 0.35, 1.35);
  const airParticlesGeometry = new THREE.BufferGeometry();
  airParticlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.06, 0.3, 1.0,
    0.04, 0.35, 1.13,
    -0.1, 0.38, 1.28,
    0.08, 0.32, 1.43,
    0, 0.36, 1.57,
    0.12, 0.29, 1.7,
  ], 3));
  const airParticlesMaterial = new THREE.PointsMaterial({
    color: 0xe0f2fe,
    size: 0.075,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    toneMapped: false,
  });
  const airParticles = new THREE.Points(airParticlesGeometry, airParticlesMaterial);
  const compressedAir = new THREE.Group();
  compressedAir.name = 'MARS_CLEANER_CompressedAir';
  compressedAir.visible = false;
  compressedAir.add(airJet, airParticles);
  // Rover status indicator beacon
  const cleanerLedMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, toneMapped: false });
  const cleanerLed = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), cleanerLedMat);
  cleanerLed.position.set(0, 0.24, -0.35);

  cleanerRover.add(chassis, arm, brushRoller, cleanerLed, compressedAir);
  cleanerGroup.add(cleanerRover);

  // ---------------------------------------------------------------------------
  // 7. ANIMATION LOOP (PER-FRAME UPDATE)
  // ---------------------------------------------------------------------------
  let totalTime = 0;
  const sunDir = new THREE.Vector3();
  const fogColor = new THREE.Color();
  const skyHorizonColor = new THREE.Color();
  let cleanerBus = null;
  let sprayTargetIdx = -1;
  let sprayRemainingS = 0;
  const onPanelCleaned = (/** @type {{ panelIndex?: number }} */ event) => {
    const panelIndex = event?.panelIndex;
    if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex >= 12) return;
    sprayTargetIdx = panelIndex;
    sprayRemainingS = getSim()?.balance?.cleaner?.sprayDurationS ?? 0.8;
  };

  return {
    root,

    /** @param {number} dt real seconds */
    update(dt) {
      totalTime += dt;
      const sim = getSim();
      if (sim?.bus && sim.bus !== cleanerBus) {
        cleanerBus?.off?.('cleaner:panelCleaned', onPanelCleaned);
        cleanerBus = sim.bus;
        cleanerBus.on('cleaner:panelCleaned', onPanelCleaned);
      }
      const hour = sim.time.clock().hourFloat;
      const storm = Boolean(sim.power.stormActive);
      const dustFactor = sim.power.dustFactor ?? 1.0;
      const powerCfg = sim.power.cfg;

      // --- A. DYNAMIC DAY/NIGHT LIGHTING & SUN MOTION ---
      // Daylight range: 06:00 to 18:00
      const isDay = hour >= 5.6 && hour < 18.4;
      // Day progress: 0 at 06:00, 0.5 at 12:00, 1.0 at 18:00
      const tDay = (hour - 6.0) / 12.0;
      const sunAngle = Math.PI - tDay * Math.PI; // Rises in East (+X), sets in West (-X)
      const sunElevation = Math.sin(tDay * Math.PI);

      // Smooth sunrise / sunset envelope
      const sunriseFade = THREE.MathUtils.smoothstep(hour, 5.5, 6.5);
      const sunsetFade = 1.0 - THREE.MathUtils.smoothstep(hour, 17.5, 18.5);
      const daylightFactor = sunriseFade * sunsetFade;

      // Sun position in world space
      const sunDistance = 210.0;
      const sunX = BASE_CENTER.x + Math.cos(sunAngle) * sunDistance;
      const sunY = Math.max(-25.0, sunElevation * 135.0);
      const sunZ = BASE_CENTER.z - Math.sin(sunAngle) * 65.0;
      sunGroup.position.set(sunX, Math.max(2.0, sunY), sunZ);
      sunGroup.visible = isDay && !storm;

      // Sun directional light tracks sun position
      sunDir.set(sunX - BASE_CENTER.x, sunY, sunZ - BASE_CENTER.z).normalize();
      sunLight.position.set(BASE_CENTER.x + sunDir.x * 70, Math.max(10, sunDir.y * 70), BASE_CENTER.z + sunDir.z * 70);

      // Light color & intensity by time of day & storm
      const look = fieldLook(hour, storm, powerCfg, dustFactor);
      if (storm) {
        sunLight.intensity = 0.25;
        sunLight.color.setRGB(0.75, 0.45, 0.28);
        ambientLight.intensity = 0.35;
        ambientLight.color.setRGB(0.55, 0.32, 0.22);
      } else if (!isDay) {
        // Night: minimal illumination, stars visible
        sunLight.intensity = 0.0;
        ambientLight.intensity = 0.08;
        ambientLight.color.setRGB(0.06, 0.08, 0.15); // Cool night ambient
      } else {
        // Day: warm golden/amber direct light, diffuse sky bounce
        const edgeWarmth = Math.max(0, 1.0 - Math.abs(tDay - 0.5) * 2.2);
        sunLight.intensity = 1.35 * daylightFactor;
        sunLight.color.setRGB(1.0, 0.92 - 0.2 * (1 - edgeWarmth), 0.82 - 0.35 * (1 - edgeWarmth));
        ambientLight.intensity = 0.52 * daylightFactor + 0.08;
        ambientLight.color.setRGB(0.68, 0.38, 0.22);
      }

      // Sky dome & Fog color transitions
      skyHorizonColor.setRGB(look.sky[0], look.sky[1], look.sky[2]);
      skyMat.color.copy(skyHorizonColor);
      fogColor.copy(skyHorizonColor).multiplyScalar(0.92);
      fog.color.copy(fogColor);
      fog.density = storm ? 0.0085 : 0.0036;

      // Stars & Phobos visibility
      const nightOpacity = Math.max(0, 1.0 - daylightFactor * 1.5);
      starMat.opacity = storm ? 0 : nightOpacity * 0.95;
      phobos.visible = !isDay && !storm;

      // --- B. TELECOM ANTENNA ANIMATION ---
      const alignment = sim.telecom.alignment ?? 0;
      const motorBroken = sim.telecom.motorBroken;
      let targetYaw = THREE.MathUtils.degToRad(sim.telecom.angle ?? 0);
      let targetPitch = 0.35 + alignment * 0.35;

      if (motorBroken) {
        targetYaw = 0.65 + Math.sin(totalTime * 8) * 0.02;
        targetPitch = -0.15;
      }
      const kAnt = Math.min(1, dt * 2.5);
      antYawPivot.rotation.y += (targetYaw - antYawPivot.rotation.y) * kAnt;
      antPitchPivot.rotation.x += (targetPitch - antPitchPivot.rotation.x) * kAnt;
      beaconMat.color.setHex(Math.sin(totalTime * 4.5) > 0 ? 0xff2222 : 0x220000);

      // --- C. MARS-CLEANER MOVEMENT & STATUS ---
      if (sim.cleaner) {
        const c = sim.cleaner;
        sprayRemainingS = Math.max(0, sprayRemainingS - dt);
        const spraying = sprayRemainingS > 0;
        const curX = cleanerRover.position.x;
        const curZ = cleanerRover.position.z;
        const dx = c.x - curX;
        const dz = c.z - curZ;
        const dist = Math.hypot(dx, dz);

        // Smoothly follow the simulation's route waypoint and roll the wheels with the chassis.
        if (dist > 0.01 && !spraying) {
          const moveFactor = Math.min(1, dt * 5.0);
          const moveX = dx * moveFactor;
          const moveZ = dz * moveFactor;
          cleanerRover.position.x += moveX;
          cleanerRover.position.z += moveZ;
          const roll = Math.hypot(moveX, moveZ) / 0.14;
          for (const wheel of wheelMeshes) wheel.rotation.x += roll;
          const targetRot = Math.atan2(dx, dz);
          cleanerRover.rotation.y = targetRot;
        }
        const targetPanel = c.panelCoords?.[sprayTargetIdx];
        if (spraying && targetPanel) {
          const targetRot = Math.atan2(targetPanel.x - cleanerRover.position.x, targetPanel.z - cleanerRover.position.z);
          cleanerRover.rotation.y += THREE.MathUtils.euclideanModulo(targetRot - cleanerRover.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        }
        compressedAir.visible = spraying;
        if (spraying) {
          airJetMaterial.opacity = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(totalTime * 34));
          airParticlesMaterial.opacity = 0.55 + 0.3 * (0.5 + 0.5 * Math.sin(totalTime * 27));
        }

        // Rotate brush roller while actively cleaning
        if (c.status === 'cleaning') {
          brushRoller.rotation.x += dt * 15.0;
        }

        // Status beacon LED
        if (c.status === 'broken') {
          cleanerLedMat.color.setHex(0xef4444); // red
        } else if (c.status === 'cleaning' || c.status === 'traveling') {
          cleanerLedMat.color.setHex(Math.sin(totalTime * 6.0) > 0 ? 0xf59e0b : 0x451a03); // amber blink
        } else if (c.status === 'charging') {
          cleanerLedMat.color.setHex(0x38bdf8); // cyan charging
        } else {
          cleanerLedMat.color.setHex(0x22c55e); // ready green
        }

        // Pylon LED matches charging status
        pylonLightMat.color.setHex(c.status === 'charging' ? 0x38bdf8 : 0x22c55e);
      }

      // --- D. GLOBAL SUSPENDED DUST DRIFT ---
      const windMult = storm ? 4.2 : 1.0;
      dustMat.opacity = storm ? 0.8 : (isDay ? 0.42 : 0.15);
      dustMat.size = storm ? 0.075 : 0.045;

      const dPos = dustGeo.attributes.position.array;
      for (let i = 0; i < dustCount; i++) {
        const idx = i * 3;
        dPos[idx] += dustVelocities[idx] * dt * windMult;
        dPos[idx + 1] += dustVelocities[idx + 1] * dt * windMult;
        dPos[idx + 2] += dustVelocities[idx + 2] * dt * windMult;

        // Wrap around outer boundaries
        const dx = dPos[idx] - BASE_CENTER.x;
        const dz = dPos[idx + 2] - BASE_CENTER.z;
        if (dx > 55.0 || Math.sqrt(dx * dx + dz * dz) > 60.0) {
          const newAngle = Math.PI * 0.75 + (Math.random() - 0.5) * 1.2;
          const newR = 40.0 + Math.random() * 18.0;
          dPos[idx] = BASE_CENTER.x + Math.cos(newAngle) * newR;
          dPos[idx + 1] = 0.4 + Math.random() * 8.5;
          dPos[idx + 2] = BASE_CENTER.z + Math.sin(newAngle) * newR;
        }
      }
      dustGeo.attributes.position.needsUpdate = true;
    },
  };
}
