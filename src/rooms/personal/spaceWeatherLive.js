// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Historical DONKI scenarios for presentation only. This module never makes network requests.

export const SCENARIO_KEYS = Object.freeze({
  '1': 'calmado',
  '2': 'moderado',
  '3': 'extremo',
});

const SCENARIO_IDS = Object.values(SCENARIO_KEYS);
const DAY_MS = 24 * 60 * 60 * 1000;
const replayByGame = new WeakMap();

/**
 * Presentation-only replay of embedded DONKI scenario data.
 * @param {Record<string, any>} scenarios
 */
export function createNasaScenarioReplay(scenarios) {
  for (const id of SCENARIO_IDS) {
    if (!scenarios?.[id]) throw new Error(`Missing NASA scenario: ${id}`);
  }

  /** @type {{ day: number, hour: number, minute: number }} */
  let clock = { day: 1, hour: 6, minute: 0 };
  /** @type {string | null} */
  let manualId = null;
  /** @type {number | null} */
  let manualStartDay = null;
  /** @type {Set<() => void>} */
  const listeners = new Set();

  const stageId = (day) => SCENARIO_IDS.find((id) => {
    const stage = scenarios[id].etapaJuego;
    return stage && day >= stage.diaInicio && day <= stage.diaFin;
  }) ?? (day > scenarios.extremo.etapaJuego.diaFin ? 'extremo' : 'calmado');

  const activeId = () => {
    const scheduled = stageId(clock.day);
    if (manualId && manualStartDay !== null && stageId(manualStartDay) === scheduled) return manualId;
    return scheduled;
  };

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    get activeId() {
      return activeId();
    },
    /** @param {{ day: number, hour: number, minute: number }} next */
    syncClock(next) {
      if (![next.day, next.hour, next.minute].every(Number.isFinite)) {
        throw new TypeError('Scenario replay clock must contain finite day, hour and minute values');
      }
      const before = activeId();
      clock = { day: next.day, hour: next.hour, minute: next.minute };
      if (manualId && manualStartDay !== null && stageId(manualStartDay) !== stageId(clock.day)) {
        manualId = null;
        manualStartDay = null;
      }
      if (before !== activeId()) notify();
    },
    /** @param {string} id */
    select(id) {
      if (!SCENARIO_IDS.includes(id) || !scenarios[id]) return false;
      manualId = id;
      manualStartDay = clock.day;
      notify();
      return true;
    },
    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      const id = activeId();
      const scenario = scenarios[id];
      const startDay = manualId && manualStartDay !== null && stageId(manualStartDay) === stageId(clock.day)
        ? manualStartDay
        : scenario.etapaJuego?.diaInicio ?? clock.day;
      return snapshotAt(id, scenario, clock, startDay);
    },
  };
}

/**
 * One selector and one set of keyboard handlers per Game instance.
 * @param {object} game @param {Record<string, any>} scenarios @param {() => void} onChange
 */
export function getNasaScenarioReplay(game, scenarios, onChange) {
  let replay = replayByGame.get(game);
  if (!replay) {
    replay = createNasaScenarioReplay(scenarios);
    replay.subscribe(onChange);
    installScenarioHotkeys(replay);
    replayByGame.set(game, replay);
  }
  return replay;
}

/**
 * Register the 1/2/3 presentation shortcuts. @param {ReturnType<typeof createNasaScenarioReplay>} replay
 * @param {{ addEventListener: Function, removeEventListener: Function }} [target]
 */
export function installScenarioHotkeys(replay, target = globalThis.window) {
  if (!target?.addEventListener) return () => {};
  const onKeyDown = (/** @type {KeyboardEvent} */ event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const element = /** @type {HTMLElement | null} */ (
      typeof HTMLElement !== 'undefined' && event.target instanceof HTMLElement ? event.target : null
    );
    if (element?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName ?? '')) return;
    const scenarioId = SCENARIO_KEYS[event.key];
    if (scenarioId && replay.select(scenarioId)) event.preventDefault();
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}

/** @param {string} id @param {Record<string, any>} scenario @param {{ day: number, hour: number, minute: number }} clock @param {number} playbackStartDay */
function snapshotAt(id, scenario, clock, playbackStartDay) {
  const firstDate = scenario.fechaReal;
  const lastDate = scenario.fechaFin ?? firstDate;
  const elapsedDays = Math.max(0, Math.floor(clock.day - playbackStartDay));
  const wantedDate = addDays(firstDate, elapsedDays);
  const cappedDate = wantedDate > lastDate ? lastDate : wantedDate;
  const afterScenario = wantedDate > lastDate;
  const hour = String(Math.max(0, Math.min(23, Math.floor(clock.hour)))).padStart(2, '0');
  const minute = String(Math.max(0, Math.min(59, Math.floor(clock.minute)))).padStart(2, '0');
  const timestamp = afterScenario
    ? `${lastDate}T23:59:59Z`
    : `${cappedDate}T${hour}:${minute}:00Z`;
  const timestampMs = Date.parse(timestamp);
  const detailed = scenario.eventosDetallados;
  const collections = [
    ['cme', detailed.nubesParticulas, (event) => event.startTime],
    ['gst', detailed.tormentasMagneticas, (event) => event.startTime],
    ['sep', detailed.lluviasParticulas, (event) => event.eventTime],
    ['flr', detailed.llamaradasSolares, (event) => event.beginTime],
  ];
  /** @type {{ type: string, time: string, data: any }[]} */
  const timeline = [];
  const summary = { cmeCount: 0, gstCount: 0, sepCount: 0, flrCount: 0, maxKp: null };
  const countKeys = { cme: 'cmeCount', gst: 'gstCount', sep: 'sepCount', flr: 'flrCount' };

  for (const [type, events, getTime] of collections) {
    const reached = (events ?? []).filter((event) => {
      const time = eventTime(getTime(event));
      return Number.isFinite(time) && time <= timestampMs;
    });
    summary[countKeys[type]] = reached.length;
    for (const event of reached) timeline.push({ type, time: getTime(event), data: event });
  }
  for (const storm of detailed.tormentasMagneticas ?? []) {
    for (const observation of storm.observations ?? []) {
      if (eventTime(observation.observedTime) <= timestampMs && Number.isFinite(observation.kpIndex)) {
        summary.maxKp = summary.maxKp === null ? observation.kpIndex : Math.max(summary.maxKp, observation.kpIndex);
      }
    }
  }

  timeline.sort((a, b) => a.time.localeCompare(b.time));
  return {
    id,
    scenario,
    timestamp,
    sourceDate: cappedDate,
    counts: summary,
    latestEvent: timeline.at(-1) ?? null,
    nextEvent: collections
      .flatMap(([type, events, getTime]) => (events ?? [])
        .filter((event) => {
          const time = eventTime(getTime(event));
          return Number.isFinite(time) && time > timestampMs;
        })
        .map((event) => ({ type, time: getTime(event), data: event })))
      .sort((a, b) => a.time.localeCompare(b.time))[0] ?? null,
  };
}

function eventTime(value) {
  return typeof value === 'string' ? Date.parse(value) : Number.NaN;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setTime(date.getTime() + days * DAY_MS);
  return date.toISOString().slice(0, 10);
}
