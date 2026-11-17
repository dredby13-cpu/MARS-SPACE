// Legacy seven-day DONKI archive. The game does not read this file or make these requests at runtime.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://ccmc.gsfc.nasa.gov/DONKI/WS/get';
const end = new Date();
const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
const iso = (date) => date.toISOString().slice(0, 10);
const range = { start: iso(start), end: iso(end) };

async function get(type) {
  const url = new URL(`${API}/${type}`);
  url.searchParams.set('startDate', range.start);
  url.searchParams.set('endDate', range.end);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DONKI ${type}: HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`DONKI ${type} returned a non-array response`);
  return data;
}

const [cme, gst, sep] = await Promise.all(['CME', 'GST', 'SEP'].map(get));
const speeds = cme.flatMap((event) => event.cmeAnalyses ?? [])
  .map((analysis) => Number(analysis.speed))
  .filter((speed) => Number.isFinite(speed) && speed > 0);
const kpValues = gst.flatMap((event) => event.allKpIndex ?? [])
  .map((item) => Number(item.kpIndex))
  .filter(Number.isFinite);
const output = {
  _about: 'Legacy seven-day DONKI archive. Personal now uses escenarios_nasa.json instead; regenerate with `npm run data:donki`.',
  source: {
    institution: 'NASA Community Coordinated Modeling Center (CCMC)',
    product: 'DONKI — Space Weather Database Of Notifications, Knowledge, Information',
    url: 'https://ccmc.gsfc.nasa.gov/DONKI/',
    endpoints: ['CME', 'GST', 'SEP'].map((type) => `${API}/${type}`),
    retrievedAt: iso(new Date()),
  },
  range,
  summary: {
    cmeCount: cme.length,
    fastestCmeKms: speeds.length ? Math.round(Math.max(...speeds)) : null,
    gstCount: gst.length,
    maxKp: kpValues.length ? Math.max(...kpValues) : null,
    sepCount: sep.length,
  },
};

const directory = fileURLToPath(new URL('../src/data/real/', import.meta.url));
mkdirSync(directory, { recursive: true });
const target = fileURLToPath(new URL('../src/data/real/donki_recent.json', import.meta.url));
writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Saved legacy DONKI archive to ${target}`);
console.log(`${range.start} → ${range.end}: ${JSON.stringify(output.summary)}`);
