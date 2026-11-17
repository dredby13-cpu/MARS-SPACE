// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedRectGeometry, roundedRingGeometry } from './roundedRect.js';
import { marsLook, skyFactor } from './marsLook.js';
import { createSolarPanelTexture } from './textures.js';

/**
 * Pure look of the field for a time of day and weather (tested in tests/solarField.test.js).
 * @param {number} hour 0–24 @param {boolean} storm @param {{ solarStartHour: number, solarEndHour: number }} cfg
 * @param {number} [dustFactor] PowerGrid.dustFactor (1 = clean panels)
 * @returns {{ daylight: boolean, sky: [number, number, number], ground: number, panel: number, dust: number, soil: number }}
 */
export function fieldLook(hour, storm, cfg, dustFactor = 1) {
  const base = marsLook(hour, storm, cfg);
  // Settled dust dulls the cells (soil 0 = clean, 1 = fully covered); the ochre tint is applied in update().
  const soil = Math.min(1, Math.max(0, 1 - dustFactor));
  return { ...base, panel: base.panel * (1 - 0.6 * soil), soil };
}

const DUST_TINT = new THREE.Color(0xc06a34);
/** Half the sweep length of the shield wave across a panel (local x, metres). */
const WAVE_HALF_SPAN = 1.15;
const SLEW_SPEED_DEG_PER_SEC = 38;

/**
 * Pure timing of the shield wave on one panel column (tested in tests/dust.test.js).
 * Column `i` starts `stepS` after column `i − 1`; each sweep lasts `durationS − stepS × 5` seconds
 * (6 columns; both rows sweep together), fading in and out.
 * @param {number} elapsedS real seconds since the clean @param {number} panelIndex column 0–5
 * @param {{ durationS: number, stepS: number }} cfg balance.cleanFx
 * @returns {{ active: boolean, x: number, opacity: number }} x in −1…1 across the panel
 */
export function shieldWave(elapsedS, panelIndex, cfg) {
  const sweep = Math.max(0.1, cfg.durationS - cfg.stepS * 5);
  const k = (elapsedS - panelIndex * cfg.stepS) / sweep;
  if (k < 0 || k > 1) return { active: false, x: 0, opacity: 0 };
  return { active: true, x: -1 + 2 * k, opacity: Math.sin(Math.PI * k) };
}

/**
 * Window in the Energía room looking out at the base solar field (2 rows × 6 panels = 12 panels).
 *
 * Visual improvements:
 * - Solves the black zone / texture mismatch bug with clean UV-mapped geometry and procedural
 *   photovoltaic silicon wafer textures with fine grid lines, busbars, and anti-reflective sheen.
 * - Frame and sill geometry fitted seamlessly to the east wall.
 * - Terrain, rocks, sky dome, dynamic sun, and atmospheric particles are unified in MarsExterior.js.
 *
 * @param {THREE.Scene} scene
 * @param {() => any} getSim current Simulation (replaced on restart)
 * @param {{ center: [number, number, number], width: number, height: number, radius?: number, outward: [number, number] }} win
 */
export function buildSolarField(scene, getSim, win) {
  const root = new THREE.Group();
  root.name = 'SolarField_System';
  root.position.set(...win.center);
  // Local −z looks outward (+X world)
  root.rotation.y = Math.atan2(-win.outward[0], -win.outward[1]);
  scene.add(root);
  const floorY = -win.center[1];

  // ---- 1. Rounded frame + sill + glass ----
  const hh = win.height / 2;
  const radius = win.radius ?? 0;
  const frame = new THREE.Mesh(
    mergeGeometries([
      roundedRingGeometry(
        { w: win.width + 0.1, h: win.height + 0.1, r: radius + 0.05 },
        { w: win.width - 0.06, h: win.height - 0.06, r: Math.max(0, radius - 0.03) },
        0.16,
      ),
      new THREE.BoxGeometry(Math.max(0.2, win.width - 2 * radius), 0.05, 0.12).translate(0, -hh - 0.02, 0.12),
    ]),
    new THREE.MeshLambertMaterial({ color: 0x42474e }),
  );
  root.add(frame);

  const glass = new THREE.Mesh(
    roundedRectGeometry(win.width - 0.06, win.height - 0.06, Math.max(0, radius - 0.03)),
    new THREE.MeshBasicMaterial({ color: 0x7eb8d0, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  glass.position.z = 0.01;
  root.add(glass);

  // Group holding the exterior solar field items
  const outside = new THREE.Group();
  outside.name = 'SolarField_Outside';
  outside.position.y = floorY;
  root.add(outside);

  // ---- 2. High-Quality Solar Panels (2 rows × 6 = 12 panels) ----
  const COLS = 6;
  const ROWS = 2;
  const PANELS = COLS * ROWS;
  const ROW_Z = [-10, -13.5];
  const ROW_X_OFFSET = [0, 1.5];

  const solarTexture = createSolarPanelTexture();

  // Clean geometry with full UVs and no overlapping or z-fighting boxes
  // Frame: aluminum casing
  const panelFrame = new THREE.BoxGeometry(2.4, 0.045, 1.3);
  // Cells: planar front face with clean UVs mapped with the photovoltaic wafer texture
  const panelCells = new THREE.PlaneGeometry(2.32, 1.22).rotateX(-Math.PI / 2).translate(0, 0.025, 0);

  // Merged geometry with materials: Frame + Photovoltaic cell face
  // We use separate instanced meshes or clean merged geometry.
  // Using InstancedMesh for panels:
  const panelMat = new THREE.MeshStandardMaterial({
    map: solarTexture,
    color: 0xffffff,
    roughness: 0.32,
    metalness: 0.35,
  });

  // Base panel mesh (name: 'SolarPanels', count: 12 - required by tests/dust.test.js)
  // Clean BoxGeometry with UVs for front face
  const panels = new THREE.InstancedMesh(
    mergeGeometries([
      panelFrame,
      panelCells,
    ]),
    panelMat,
    PANELS,
  );
  panels.name = 'SolarPanels';

  // Support legs
  const legGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.0, 8).translate(0, 0.5, 0);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3d434a, roughness: 0.7, metalness: 0.5 });
  const legs = new THREE.InstancedMesh(legGeo, legMat, PANELS);
  legs.name = 'SolarPanelSupports';

  // Electrodynamic shield wave: one glowing bar per panel (name: 'SolarPanelShieldWave')
  const wave = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.24, 0.015, 1.22).translate(0, 0.035, 0),
    new THREE.MeshBasicMaterial({
      color: 0x7cc4ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }),
    PANELS,
  );
  wave.name = 'SolarPanelShieldWave';
  wave.visible = false;

  const tmp = new THREE.Object3D();
  /** @type {[number, number][]} panel positions (x, z) */
  const slots = [];
  let idx = 0;
  for (let k = 0; k < PANELS; k++) {
    const row = Math.floor(k / COLS);
    const x = -7.5 + (k % COLS) * 3 + ROW_X_OFFSET[row];
    const z = ROW_Z[row];
    slots.push([x, z]);

    tmp.position.set(x, 1.05, z);
    tmp.rotation.set(0, 0, 0);
    tmp.scale.set(1, 1, 1);
    tmp.updateMatrix();
    panels.setMatrixAt(idx, tmp.matrix);

    tmp.position.set(x, 0, z);
    tmp.rotation.set(0, 0, 0);
    tmp.scale.set(1, 1, 1);
    tmp.updateMatrix();
    legs.setMatrixAt(idx, tmp.matrix);
    idx++;
  }
  panels.instanceMatrix.needsUpdate = true;
  legs.instanceMatrix.needsUpdate = true;
  outside.add(panels, legs, wave);

  // Inverter box + cable trench
  const props = new THREE.Mesh(
    mergeGeometries([
      new THREE.BoxGeometry(1.2, 1.0, 0.8).translate(-4.5, 0.5, -3.2),
      new THREE.BoxGeometry(0.15, 0.06, 2.8).translate(-4.5, 0.03, -1.6),
    ]),
    new THREE.MeshStandardMaterial({ color: 0x8a929a, roughness: 0.6, metalness: 0.4 }),
  );
  outside.add(props);

  // Nothing outside should be culled oddly
  outside.traverse((o) => {
    o.frustumCulled = false;
  });

  // ---- 3. Simulation Binding & Animation ----
  let cleanElapsed = Infinity;
  let shownSoil = NaN;
  let wiredBus = null;

  const onCleaned = (/** @type {any} */ e) => {
    if (e?.by === 'shield') cleanElapsed = 0;
  };

  const bindSimulationBus = () => {
    const bus = getSim()?.bus;
    if (!bus || bus === wiredBus) return;
    wiredBus?.off('solar:cleaned', onCleaned);
    wiredBus = bus;
    wiredBus.on('solar:cleaned', onCleaned);
    cleanElapsed = Infinity;
  };

  const panelMatrix = new THREE.Matrix4();
  const offset = new THREE.Matrix4();
  const tint = new THREE.Color();
  let shownAngle = NaN;

  const rotatePanels = (deg) => {
    const yawDeg = THREE.MathUtils.clamp(deg, -90, 90);
    const yawRad = THREE.MathUtils.degToRad(yawDeg);
    const tiltRad = THREE.MathUtils.degToRad(60);
    slots.forEach(([x, z], j) => {
      tmp.position.set(x, 1.05, z);
      tmp.rotation.set(tiltRad, yawRad, 0, 'YXZ');
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      panels.setMatrixAt(j, tmp.matrix);
    });
    panels.instanceMatrix.needsUpdate = true;
  };

  rotatePanels(0);

  return {
    root,
    /** True while the shield wave animation is playing. */
    get isCleaning() {
      const fx = getSim()?.balance?.cleanFx ?? { durationS: 2.4 };
      return cleanElapsed < fx.durationS;
    },
    /** @param {number} dt real seconds */
    update(dt) {
      bindSimulationBus();
      const sim = getSim();
      if (!sim) return;

      const clock = sim.time?.clock ? sim.time.clock() : { hourFloat: 12 };
      const storm = Boolean(sim.power?.stormActive);
      const dustFactor = sim.power?.dustFactor ?? 1;
      const powerCfg = sim.power?.cfg ?? { solarStartHour: 6, solarEndHour: 18 };
      const fx = sim.balance?.cleanFx ?? { durationS: 2.4, stepS: 0.25, fadeSoilPerS: 0.6 };

      const look = fieldLook(clock.hourFloat, storm, powerCfg, dustFactor);

      // Settled dust on solar panels
      if (Number.isNaN(shownSoil) || look.soil > shownSoil) shownSoil = look.soil;
      else shownSoil = Math.max(look.soil, shownSoil - fx.fadeSoilPerS * dt);

      tint.setRGB(1, 1, 1);
      if (shownSoil > 0) {
        tint.lerp(DUST_TINT, Math.min(0.75, shownSoil * 1.5));
      }
      // Modulate with look.panel so it naturally darkens when unlit / night
      tint.multiplyScalar(Math.max(0.2, look.panel));
      panelMat.color.copy(tint);

      // Mechanical tracking slew
      const tracker = sim.solarTracker;
      const isStopped = sim.phase === 'training' || sim.time?.speed === 0;
      const targetDeg = tracker ? tracker.targetDeg : 0;
      if (Number.isNaN(shownAngle)) {
        shownAngle = targetDeg;
        rotatePanels(shownAngle);
      } else {
        const diff = targetDeg - shownAngle;
        if (Math.abs(diff) > 0.05) {
          const step = Math.sign(diff) * Math.min(Math.abs(diff), SLEW_SPEED_DEG_PER_SEC * dt);
          shownAngle += step;
          rotatePanels(shownAngle);
          if (isStopped && tracker) tracker.angleDeg = shownAngle;
        } else if (shownAngle !== targetDeg) {
          shownAngle = targetDeg;
          rotatePanels(shownAngle);
          if (isStopped && tracker) tracker.angleDeg = shownAngle;
        }
      }

      // Shield wave sweep animation
      if (cleanElapsed < fx.durationS) {
        cleanElapsed += dt;
        let peak = 0;
        slots.forEach((_, j) => {
          const w = shieldWave(cleanElapsed, j % COLS, fx);
          panels.getMatrixAt(j, panelMatrix);
          offset.makeTranslation(w.x * WAVE_HALF_SPAN, 0, 0);
          if (!w.active) offset.makeScale(0, 0, 0);
          wave.setMatrixAt(j, panelMatrix.multiply(offset));
          peak = Math.max(peak, w.opacity);
        });
        wave.instanceMatrix.needsUpdate = true;
        /** @type {THREE.MeshBasicMaterial} */ (wave.material).opacity = 0.9 * peak;
        wave.visible = cleanElapsed < fx.durationS;
      } else {
        wave.visible = false;
      }
    },
  };
}
