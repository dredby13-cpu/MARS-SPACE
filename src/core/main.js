import * as THREE from 'three';
import { gameData } from '../data/index.js';
import { createTranslator, pickLanguage, setNumberLanguage } from '../utils/strings.js';
import { Game } from './Game.js';
import { buildBasement } from '../world/Basement.js';
import { buildMarsExterior } from '../world/MarsExterior.js';
import { buildPorthole } from '../world/Porthole.js';
import { buildSolarField } from '../world/SolarField.js';
import { buildRoverWorld } from '../world/RoverWorld.js';
import { buildStations, renderBio } from '../ui/Stations.js';
import { Panel } from '../ui/Panel.js';
import { Interaction } from '../vr/Interaction.js';
import { Locomotion } from '../vr/Locomotion.js';
import { XRControls } from '../vr/XRControls.js';
import { DesktopControls } from '../vr/DesktopControls.js';
import { KeyboardLocomotion } from '../vr/KeyboardLocomotion.js';
import { buildCollider } from '../vr/Collision.js';
import { Grab } from '../vr/Grab.js';
import { Holsters } from '../vr/Holsters.js';
import { createStartMenu } from '../ui/StartMenu.js';
import { startMode, missionBriefing, VR_SESSION_INIT } from '../ui/startMenuRules.js';

// Dev-only: `?iwer` installs Meta's Immersive Web Emulation Runtime (Quest 3) without the browser
// extension. The start menu offers the same emulator on demand («Usar emulador integrado»). Lazy-loaded.
const devParams = new URLSearchParams(window.location.search);
if (devParams.has('iwer')) {
  const { installEmulatedQuest3 } = await import('../dev/iwer.js');
  /** @type {any} */ (window).__xrDevice = installEmulatedQuest3();
}

const PANEL_REFRESH_SECONDS = 0.25; // 4 Hz canvas updates
const MAX_FRAME_DT = 0.1;
const FACING_YAW = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 };

// Language (start menu): ?lang= or the last choice saved in this browser; Spanish by default.
/** @returns {string | null} */
const savedLanguage = () => {
  try {
    return window.localStorage.getItem('ares.lang');
  } catch {
    return null;
  }
};
const lang = pickLanguage(devParams, savedLanguage());
document.documentElement.lang = lang;
setNumberLanguage(lang);
const t = createTranslator(gameData.stringsByLang[lang]);
const game = new Game(gameData, t);
const { layout } = gameData;

// Renderer: conservative Quest settings (AGENTS.md §7): no shadows, no post-processing.
// ACES tone mapping runs inside the material shaders (no extra pass); UI panels opt out (toneMapped: false).
const container = /** @type {HTMLElement} */ (document.getElementById('app'));
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor(1.0);
renderer.xr.setFoveation(1.0);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#050607');

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 60);
camera.position.set(0, layout.eyeHeight, 0);
const dolly = new THREE.Group();
dolly.name = 'PlayerRig';
dolly.position.fromArray(layout.spawn.position);
dolly.rotation.y = FACING_YAW[/** @type {keyof typeof FACING_YAW} */ (layout.spawn.facing)] ?? 0;
dolly.add(camera);
scene.add(dolly);

// Dev-only URL params:
//   ?view=x,z,deg  places the rig (deg: 0 = north, -90 = east) for quick inspection/screenshots.
//   ?ff=ticks      fast-forwards the simulation that many ticks right after "Iniciar turno".
let fastForwardTicks = Math.max(0, Number(devParams.get('ff')) || 0);
const viewParam = devParams.get('view');
if (viewParam) {
  const [vx, vz, deg] = viewParam.split(',').map(Number);
  if ([vx, vz].every(Number.isFinite)) dolly.position.set(vx, 0, vz);
  if (Number.isFinite(deg)) dolly.rotation.y = THREE.MathUtils.degToRad(deg);
}

// World + stations
const basement = buildBasement(layout, t);
scene.add(basement.group);
// Unified Mars exterior environment (circular terrain, sky dome, dynamic sun/lighting, rocks, particles, antenna, solar field)
const marsExterior = buildMarsExterior(scene, () => game.sim);
// Telecom panoramic window: the wall tagged view "telecom" (exterior lies to its -z side).
const windowWall = layout.walls.find((/** @type {any} */ w) => w.view === 'telecom');
const [ws0, ws1, wy0, wy1] = windowWall.windows[0];
const porthole = buildPorthole(scene, () => game.sim, {
  center: [(ws0 + ws1) / 2, (wy0 + wy1) / 2, windowWall.from[1] + 0.02],
  width: ws1 - ws0,
  height: wy1 - wy0 - 0.04,
}, marsExterior);
// Energía window onto the solar field: the wall tagged view "solar" (exterior lies to its +x side).
const solarWall = layout.walls.find((/** @type {any} */ w) => w.view === 'solar');
const [ss0, ss1, sy0, sy1, sRadius = 0] = solarWall.windows[0];
const solarField = buildSolarField(scene, () => game.sim, {
  center: [solarWall.from[0], (sy0 + sy1) / 2, (ss0 + ss1) / 2],
  width: ss1 - ss0,
  height: sy1 - sy0 - 0.04,
  radius: sRadius,
  outward: [1, 0],
}, marsExterior);
// Hand-held objects (tools) and the two hip holsters (spec §9.3). Created before the stations so
// room builders can use them through kit.services.
const locomotion = new Locomotion(renderer, dolly, camera);
const grab = new Grab(scene);
const holsters = new Holsters(scene, locomotion, gameData.balance.holster);
const roverWorld = buildRoverWorld(scene, game, camera, dolly, layout);
/** @type {THREE.Object3D[]} */
const interactive = [];
const stations = buildStations({
  layout, rooms: basement.rooms, game, t, scene, interactive,
  services: { scene, grab, holsters, floors: basement.floors, renderer, roverWorld, solarField, locomotion },
});

// Interaction and locomotion
// Furniture blocks the teleport ray and the keyboard body (top-down AABBs).
scene.updateMatrixWorld(true);
const collider = buildCollider(layout);
const _bounds = new THREE.Box3();
for (const solid of stations.solids) {
  _bounds.setFromObject(solid);
  if (_bounds.max.y > 0.3) collider.addBox({ x0: _bounds.min.x, x1: _bounds.max.x, z0: _bounds.min.z, z1: _bounds.max.z });
}
const interaction = new Interaction(interactive, basement.floors, [...basement.walls, ...stations.solids]);
const xr = new XRControls(renderer, dolly, interaction, locomotion);
const desktop = new DesktopControls(renderer.domElement, renderer, dolly, camera, interaction, locomotion);
xr.grab = grab; // grip button
desktop.grab = grab; // G key (dev)
xr.holsters = holsters; // B/Y belt button
desktop.holsters = holsters; // H key (dev)
holsters.grab = grab; // rings light up while holding a tool
const keyboard = new KeyboardLocomotion(renderer, camera, dolly, locomotion, collider);
/** Dev handle (`?debug`, `?iwer` or the built-in emulator). Do not expose the THREE namespace: it defeats tree-shaking. */
function exposeDebug() {
  /** @type {any} */ (window).__marte = { renderer, camera, dolly, game, grab, holsters, Vector3: THREE.Vector3 };
}
if (devParams.has('iwer') || devParams.has('debug')) exposeDebug();

// Wrist biomonitor on the left controller (physical device, not a head-locked HUD).
const wristBio = new Panel(0.13, 0.08, { pxPerMeter: 2400 });
wristBio.mesh.position.set(0, 0.035, 0.05);
wristBio.mesh.rotation.x = -Math.PI / 2.6;
xr.onLeftGrip = (grip) => grip.add(wristBio.mesh);

// Onboarding overlay and aiming crosshair (desktop/browser mode)
const onboarding = document.getElementById('onboarding-panel');
const onboardingContent = document.getElementById('onboarding-content');
const onboardingToggle = document.getElementById('onboarding-toggle');
const crosshair = /** @type {HTMLElement} */ (document.getElementById('crosshair'));

if (onboardingContent) onboardingContent.textContent = t('dev.help');
if (onboardingToggle && onboardingContent) {
  let minimized = false;
  onboardingToggle.textContent = t('ui.help.minimize');
  onboardingToggle.addEventListener('click', () => {
    minimized = !minimized;
    onboardingContent.style.display = minimized ? 'none' : 'block';
    onboardingToggle.textContent = t(minimized ? 'ui.help.expand' : 'ui.help.minimize');
  });
}
// ---- Start menu: immersive VR (headset / Meta Immersive Web Emulator / built-in IWER) or browser mode ----
const startMenuRoot = /** @type {HTMLElement} */ (document.getElementById('start-menu'));
/** Shows or hides the desktop help and crosshair, and turns mouse/keyboard input on or off. @param {boolean} on */
const setBrowserUi = (on) => {
  if (onboarding) onboarding.style.display = on ? 'block' : 'none';
  if (crosshair) crosshair.style.display = on ? 'block' : 'none';
  desktop.enabled = on;
  keyboard.enabled = on;
};
/** Opens an immersive VR session (must run inside the click that chose it). */
const enterVr = async () => {
  const xrApi = /** @type {any} */ (navigator).xr;
  if (!xrApi) throw new Error('WebXR no disponible');
  const session = await xrApi.requestSession('immersive-vr', VR_SESSION_INIT);
  await renderer.xr.setSession(session);
};
const helpTitle = document.getElementById('onboarding-title');
if (helpTitle) helpTitle.textContent = t('ui.help.title');
const helpMenu = document.getElementById('onboarding-menu');
if (helpMenu) helpMenu.textContent = t('menu.back');
const startMenu = createStartMenu(startMenuRoot, t, {
  language: lang,
  // The language can change only before the shift starts: it reloads the page with the new tables.
  canChangeLanguage: () => game.sim.phase === 'training',
  onLanguage(next) {
    try {
      window.localStorage.setItem('ares.lang', next);
    } catch {
      // private mode: the URL keeps the choice for this visit
    }
    const url = new URL(window.location.href);
    url.searchParams.set('lang', next);
    window.location.replace(url.toString());
  },
  briefing: missionBriefing(gameData.balance, gameData.events),
  async onChoose(choice) {
    if (choice === 'browser') {
      startMenu.hide();
      setBrowserUi(true);
      return;
    }
    if (choice === 'emulator' && !(/** @type {any} */ (window).__xrDevice)) {
      // Built-in Meta IWER (emulated Quest 3), lazy-loaded only when chosen.
      const { installEmulatedQuest3 } = await import('../dev/iwer.js');
      /** @type {any} */ (window).__xrDevice = installEmulatedQuest3();
      exposeDebug();
    }
    await enterVr();
    startMenu.hide();
  },
});
document.getElementById('onboarding-menu')?.addEventListener('click', () => {
  setBrowserUi(false);
  startMenu.show();
});
const initialMode = startMode(devParams);
if (initialMode === 'browser') setBrowserUi(true);
else {
  setBrowserUi(false);
  startMenu.show();
}

// Auto-pause (SIMULATION_SPEC §1.1): page hidden or XR session not visible.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') game.intent('time:autoPause');
});
renderer.xr.addEventListener('sessionstart', () => {
  startMenu.hide();
  setBrowserUi(false);
  const session = renderer.xr.getSession();
  session?.addEventListener('visibilitychange', () => {
    if (session.visibilityState !== 'visible') game.intent('time:autoPause');
  });
});
renderer.xr.addEventListener('sessionend', () => {
  // Back to the start menu: choose VR again or continue in the browser.
  setBrowserUi(false);
  startMenu.show();
  camera.position.set(0, layout.eyeHeight, 0);
  camera.rotation.set(0, 0, 0);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Emergency lighting when the lighting circuit is not served.
let emergency = false;
function applyLighting() {
  const lit = game.sim.power.served.lighting;
  if (lit === !emergency) return;
  emergency = !lit;
  basement.setEmergency(emergency);
}

const timer = new THREE.Timer();
let refreshTimer = 0;
stations.refresh();
renderBio(wristBio, game.sim, t);

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), MAX_FRAME_DT);
  if (fastForwardTicks > 0 && game.sim.phase === 'playing') {
    for (let i = 0; i < fastForwardTicks && game.sim.phase === 'playing'; i++) game.sim.step();
    fastForwardTicks = 0;
  }
  game.sim.advance(dt);
  if (!roverWorld.isFPV) keyboard.update(dt);
  desktop.update();
  xr.update();
  holsters.update();
  stations.animate(dt);
  porthole.update(dt);
  solarField.update(dt);
  marsExterior.update(dt);
  roverWorld.update(dt);

  refreshTimer += dt;
  if (refreshTimer >= PANEL_REFRESH_SECONDS) {
    refreshTimer = 0;
    stations.refresh();
    renderBio(wristBio, game.sim, t);
    applyLighting();
  }
  renderer.render(scene, camera);
});
