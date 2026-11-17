// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Sala central · Herramientas (hub): training bench (+ mission T1), tool wall, spares locker,
// component status board and the "Fuentes científicas" board. Placement: src/data/stations/hub.json
import { COLORS, startButtonState } from '../../ui/StationKit.js';
import { buildToolWall } from './tools.js';
import { buildElectronicsBench } from './electronics.js';
import { buildSparesLocker } from './spares.js';
import { buildHullLeak } from './leak.js';
import { createT1, isT1Done } from './toolRules.js';
import { Panel } from '../../ui/Panel.js';
import { describeInputSource, createInputCounters, handLines } from './controllerDiag.js';

// Shared between the tool wall (events) and the training board (checklist). Presentation-only state.
/** @type {{ t1: ReturnType<typeof createT1> }} */
const hubState = { t1: createT1() };

/** @type {Record<string, (g: import('three').Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  training_board(g, _station, kit) {
    const { t, game, sim } = kit;
    kit.addBox(g, 1.6, 0.06, 0.6, 0, -0.62, 0.3, '#5a4a38'); // bench
    const panel = kit.addPanel(g, 1.0, 0.55, 0, 0.12);
    const start = kit.addButton(g, { width: 0.34, height: 0.1, label: '', onSelect: () => {
      const phase = sim().phase;
      if (phase === 'training') game.intent('game:start');
      else if (phase === 'over' || phase === 'won') game.restart();
    } }, 0, -0.3);
    kit.onRefresh(() => {
      start.setState(...startButtonState(sim(), t));
      const s = hubState.t1;
      const check = (/** @type {boolean} */ ok, /** @type {string} */ key) =>
        ({ text: `${ok ? '☑' : '☐'} ${t(key)}`, color: ok ? COLORS.nominal : COLORS.text, size: 0.85 });
      panel.renderLines(t('ui.training.title'), [
        { text: t(isT1Done(s) ? 'hub.t1.done' : 'hub.t1.title'), color: isT1Done(s) ? COLORS.nominal : COLORS.title, size: 0.9 },
        check(s.grabbed, 'hub.t1.grab'),
        check(s.holstered, 'hub.t1.holster'),
        check(s.dropped, 'hub.t1.drop'),
        check(s.recovered, 'hub.t1.recover'),
        { text: t('hub.t1.rest'), color: COLORS.dim, size: 0.75 },
        { text: t('ui.training.start_here'), size: 0.75 },
      ]);
    });
  },

  /** Tool wall with the 4 tools (wrench, screwdriver, soldering iron, sealant gun). */
  hub_toolwall(g, _station, kit) {
    buildToolWall(g, kit, hubState);
  },

  /** Electronics bench: guided scan → remove → replace minigame for the Telecom receiver power supply. */
  hub_electronics(g, station, kit) {
    buildElectronicsBench(g, station, kit);
  },

  /** Spares locker: tap the doors to open it and see the stock (resource `spares` + consumable inventory). */
  hub_spares(g, station, kit) {
    buildSparesLocker(g, station, kit);
  },

  /** Component status board: state of each repairable component and the tool it needs (spec §6.1). */
  hub_status(g, _station, kit) {
    const { t, sim, game } = kit;
    const panel = kit.addPanel(g, 0.95, 0.72);
    const tools = Object.fromEntries(game.data.balance.tools.map((/** @type {any} */ x) => [x.id, x]));
    kit.onRefresh(() => {
      const s = sim();
      const broken = brokenComponents(s);
      panel.renderLines(t('hub.status.title'), [
        ...game.data.balance.components.map((/** @type {any} */ c) => {
          const isBroken = broken.has(c.id);
          return {
            text: `${isBroken ? '■' : '●'} ${t(c.nameKey)} · ${t(isBroken ? 'hub.status.broken' : 'hub.status.ok')} · ${t(tools[c.toolId].nameKey)}`,
            color: isBroken ? COLORS.critical : COLORS.text,
            size: 0.8,
          };
        }),
        { text: t('hub.status.phase2'), color: COLORS.dim, size: 0.7 },
      ], { border: broken.size ? COLORS.critical : COLORS.border });
    });
  },

  /**
   * In-world attribution of real data. Lists every src/data/real/*.json that declares a `source`
   * (institution, product, retrievedAt), so new datasets appear here automatically.
   */
  /** Hull leak on the north wall (scripted D5): crack + vapour, sealed with the sealant gun. */
  hull_leak_hub(g, _station, kit) {
    buildHullLeak(g, 'hull_seal_hub', kit);
  },

  hub_sources(g, _station, kit) {
    const { t } = kit;
    const panel = kit.addPanel(g, 1.15, 0.78);
    const datasets = Object.entries(kit.game.data.real ?? {}).filter(([id, d]) => id !== 'donki_recent' && d?.source?.institution);
    /** @type {{ text: string, color?: string, size?: number }[]} */
    const lines = [];
    for (const [id, d] of datasets) {
      // Two rows per source (institution · site, then what it feeds): three rows pushed the list below the legible minimum.
      lines.push({ text: `${d.source.institution} · ${shortUrl(d.source.url)}`, color: COLORS.info, size: 0.85 });
      lines.push({ text: t(`hub.sources.use.${id}`), size: 0.78 });
    }
    if (kit.game.data.real?.escenarios_nasa) {
      lines.push({ text: 'NASA CCMC · DONKI', color: COLORS.info, size: 0.85 });
      lines.push({ text: t('hub.sources.use.escenarios_nasa'), size: 0.78 });
    }
    if (datasets.length === 0) lines.push({ text: t('hub.sources.none'), color: COLORS.warning });
    const latest = datasets.map(([, d]) => String(d.source.retrievedAt)).sort().pop();
    if (latest) lines.push({ text: t('hub.sources.meta', { date: formatDay(latest) }), color: COLORS.dim, size: 0.75 });
    lines.push({ text: t('hub.sources.disclaimer'), color: COLORS.title, size: 0.75 });
    panel.renderLines(t('hub.sources.title'), lines);
  },
};

/**
 * «Prueba de mandos»: live diagnostics of the Quest controllers (read-only, presentation only).
 * Shows what the browser receives per hand, the select/squeeze events that reach the session, and a
 * test button that checks the full ray + trigger → Interaction path.
 * @param {import('three').Group} g @param {any} _station @param {import('../../ui/StationKit.js').StationKit} kit
 */
builders.hub_controllers = (g, _station, kit) => {
  const { t } = kit;
  /** @type {import('three').WebGLRenderer | undefined} */
  const renderer = kit.services.renderer;
  const panel = new Panel(1.3, 0.95, { pxPerMeter: 760 });
  g.add(panel.mesh);
  const counters = createInputCounters();
  let rayPresses = 0;
  renderer?.xr.addEventListener('sessionstart', () => {
    counters.reset();
    const session = renderer.xr.getSession();
    if (session) counters.attach(session);
  });
  renderer?.xr.addEventListener('sessionend', () => counters.detach());
  kit.addButton(g, { width: 0.42, height: 0.1, label: t('hub.ctrl.test_button'), onSelect: () => { rayPresses++; } }, 0, -0.56);

  kit.onRefresh(() => {
    const session = renderer?.xr.getSession() ?? null;
    /** @type {{ text: string, color?: string, size?: number }[]} */
    const lines = [];
    if (!session) {
      lines.push({ text: t('hub.ctrl.no_session'), color: COLORS.warning, size: 0.85 });
    } else {
      const hz = /** @type {any} */ (session).frameRate;
      lines.push({ text: t('hub.ctrl.session', { hz: hz ? Math.round(hz) : '—', vis: session.visibilityState, n: session.inputSources.length, changes: counters.sourcesChanged }), color: COLORS.nominal, size: 0.8 });
      const sources = [...session.inputSources];
      for (const [hand, key] of /** @type {const} */ ([['left', 'hub.ctrl.left'], ['right', 'hub.ctrl.right']])) {
        const src = sources.find((s) => s.handedness === hand);
        lines.push(...handLines(src ? describeInputSource(src) : null, key, counters.get(hand), t, COLORS));
      }
      const others = sources.filter((s) => s.handedness !== 'left' && s.handedness !== 'right');
      if (others.length) lines.push({ text: t('hub.ctrl.others', { n: others.length, list: others.map((s) => s.profiles?.[0] ?? s.targetRayMode).join(', ') }), color: COLORS.warning, size: 0.75 });
    }
    lines.push({ text: t('hub.ctrl.ray_presses', { n: rayPresses }), color: rayPresses ? COLORS.nominal : COLORS.text, size: 0.85 });
    lines.push({ text: t('hub.ctrl.legend'), color: COLORS.dim, size: 0.72 });
    lines.push({ text: t('hub.ctrl.hint'), color: COLORS.dim, size: 0.68 });
    panel.renderLines(t('hub.ctrl.title'), lines, { border: session ? COLORS.info : COLORS.border });
  });
};

/**
 * Reads the component flags that already exist in the simulation (read-only).
 * @param {any} s Simulation @returns {Set<string>}
 */
export function brokenComponents(s) {
  const out = new Set();
  if (s.lifeSupport.pumpThermalBroken) out.add('pump_thermal');
  if (s.lifeSupport.scrubberFanBroken) out.add('scrubber_fan');
  if (s.lifeSupport.electrolyzerBroken) out.add('electrolyzer_cell');
  if (s.telecom?.motorBroken) out.add('antenna_motor');
  if (s.power.relayBurned) out.add('relay_main');
  if (s.lifeSupport.recyclerStuck) out.add('valve_recycler');
  if (s.lifeSupport.leaks.length > 0) out.add('hull_seal');
  if (s.electronics && s.electronics.output.quality !== 'ok') out.add('rx_psu');
  return out;
}

/** "2026-11-14" → "14/11/2026" */
function formatDay(/** @type {string} */ iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "https://www.asc-csa.gc.ca/eng/..." → "asc-csa.gc.ca" */
function shortUrl(/** @type {string} */ url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
