// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Explicit maintainer command only. The game reads the generated JSON and never calls this API.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://ccmc.gsfc.nasa.gov/DONKI/WS/get';
const CAPTURED_ON = new Date().toISOString().slice(0, 10);
const SCENARIOS = {
  calmado: {
    titulo: 'Actividad solar baja · referencia calmada',
    inicio: '2020-01-01',
    fin: '2020-01-01',
    diaInicio: 1,
    diaFin: 2,
  },
  moderado: {
    titulo: 'Actividad solar moderada · 1 CME y llamaradas M',
    inicio: '2024-01-01',
    fin: '2024-01-01',
    diaInicio: 3,
    diaFin: 4,
  },
  extremo: {
    titulo: 'Tormenta solar extrema G5 · evento histórico de mayo de 2024',
    inicio: '2024-05-10',
    fin: '2024-05-12',
    diaInicio: 5,
    diaFin: 7,
  },
};

async function fetchEvents(type, startDate, endDate) {
  const url = new URL(`${API}/${type}`);
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DONKI ${type} ${startDate}–${endDate}: HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`DONKI ${type} returned a non-array response`);
  return data;
}

function isInRange(value, startDate, endDate) {
  return typeof value === 'string'
    && value >= `${startDate}T00:00:00Z`
    && value <= `${endDate}T23:59:59Z`;
}

function normaliseCme(event) {
  const analyses = event.cmeAnalyses ?? [];
  const analysis = analyses.find((item) => item.isMostAccurate) ?? analyses[0] ?? {};
  return {
    id: event.activityID,
    startTime: event.startTime,
    sourceLocation: event.sourceLocation || null,
    speedKms: typeof analysis.speed === 'number' && Number.isFinite(analysis.speed) ? analysis.speed : null,
    link: event.link,
  };
}

function normaliseGst(event, startDate, endDate) {
  const observations = (event.allKpIndex ?? [])
    .filter((item) => isInRange(item.observedTime, startDate, endDate))
    .map((item) => ({ observedTime: item.observedTime, kpIndex: Number(item.kpIndex) }));
  return {
    id: event.gstID,
    startTime: event.startTime,
    observations,
    link: event.link,
  };
}

function normaliseSep(event) {
  return {
    id: event.sepID,
    eventTime: event.eventTime,
    instruments: (event.instruments ?? []).map((instrument) => instrument.displayName),
    link: event.link,
  };
}

function normaliseFlare(event) {
  return {
    id: event.flrID,
    beginTime: event.beginTime,
    peakTime: event.peakTime,
    endTime: event.endTime,
    classType: event.classType,
    sourceLocation: event.sourceLocation || null,
    activeRegionNum: event.activeRegionNum ?? null,
    link: event.link,
  };
}

async function buildScenario(config) {
  const [cmes, storms, particles, flares] = await Promise.all(
    ['CME', 'GST', 'SEP', 'FLR'].map((type) => fetchEvents(type, config.inicio, config.fin)),
  );
  const nubesParticulas = cmes.map(normaliseCme);
  const tormentasMagneticas = storms.map((event) => normaliseGst(event, config.inicio, config.fin));
  const lluviasParticulas = particles.map(normaliseSep);
  const llamaradasSolares = flares.map(normaliseFlare);
  const kpValues = tormentasMagneticas.flatMap((storm) => storm.observations.map((observation) => observation.kpIndex));
  const speeds = nubesParticulas.map((event) => event.speedKms).filter(Number.isFinite);

  return {
    titulo: config.titulo,
    fechaReal: config.inicio,
    fechaFin: config.fin,
    rangoUtc: {
      inicio: `${config.inicio}T00:00:00Z`,
      fin: `${config.fin}T23:59:59Z`,
    },
    etapaJuego: { diaInicio: config.diaInicio, diaFin: config.diaFin },
    fuenteOficial: 'NASA Community Coordinated Modeling Center (CCMC) · DONKI',
    urlFuente: API,
    capturadoEl: CAPTURED_ON,
    summary: {
      cmeCount: nubesParticulas.length,
      gstCount: tormentasMagneticas.length,
      sepCount: lluviasParticulas.length,
      flrCount: llamaradasSolares.length,
      maxCmeSpeedKms: speeds.length ? Math.max(...speeds) : null,
      maxKp: kpValues.length ? Math.max(...kpValues) : null,
    },
    eventosDetallados: {
      nubesParticulas,
      tormentasMagneticas,
      lluviasParticulas,
      llamaradasSolares,
    },
  };
}

const result = {};
for (const [id, config] of Object.entries(SCENARIOS)) result[id] = await buildScenario(config);

const directory = fileURLToPath(new URL('../src/data/real/', import.meta.url));
mkdirSync(directory, { recursive: true });
const target = fileURLToPath(new URL('../src/data/real/escenarios_nasa.json', import.meta.url));
writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Saved historical NASA DONKI scenarios: ${target}`);
for (const [id, scenario] of Object.entries(result)) {
  console.log(`${id} (${scenario.fechaReal}–${scenario.fechaFin}): ${JSON.stringify(scenario.summary)}`);
}
