// SHARED guard for the per-owner data split (docs/COLLABORATION.md).
import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { mergeObjects, mergeStationLists } from '../src/data/merge.js';
import { stationBuilders } from '../src/ui/Stations.js';

describe('Per-owner data files', () => {
  it('merge rejects the same key in two files', () => {
    expect(() => mergeObjects([['a.json', { x: 1 }], ['b.json', { x: 2 }]], 'strings')).toThrow(/a\.json and b\.json/);
    expect(() => mergeStationLists([['a.json', [{ id: 's' }]], ['b.json', [{ id: 's' }]]])).toThrow(/a\.json and b\.json/);
  });

  it('strings, balance and stations load without clashes', () => {
    expect(Object.keys(gameData.strings).length).toBeGreaterThan(100);
    for (const section of ['time', 'power', 'circuits', 'lifeSupport', 'thermal', 'food', 'water', 'telecom', 'health', 'inventory', 'gameRules']) {
      expect(gameData.balance[section], section).toBeDefined();
    }
    expect(gameData.layout.stations.length).toBeGreaterThan(0);
  });

  it('every station points to an existing room and has a builder', () => {
    const rooms = new Set(gameData.layout.rooms.map((/** @type {any} */ r) => r.id));
    for (const s of gameData.layout.stations) {
      expect(rooms.has(s.room), `${s.id} → ${s.room}`).toBe(true);
      expect(typeof stationBuilders[s.id], `builder for ${s.id}`).toBe('function');
    }
  });

  it('every room sign uses an existing room and translated name', () => {
    const rooms = Object.fromEntries(gameData.layout.rooms.map((/** @type {any} */ r) => [r.id, r]));
    for (const sign of gameData.layout.signs) {
      expect(rooms[sign.room], sign.room).toBeDefined();
      expect(gameData.strings[rooms[sign.room].nameKey], rooms[sign.room].nameKey).toBeDefined();
    }
  });

  it('every real dataset is attributed (url + retrieval date) and listed on the hub sources board', () => {
    const real = Object.entries(gameData.real ?? {});
    expect(real.length).toBeGreaterThan(0);
    for (const [id, d] of real) {
      if (id === 'escenarios_nasa') {
        expect(gameData.strings[`hub.sources.use.${id}`], `hub.sources.use.${id}`).toBeDefined();
        for (const [scenarioId, scenario] of Object.entries(d)) {
          expect(scenario.fuenteOficial, `${scenarioId}.fuenteOficial`).toMatch(/NASA.*DONKI/);
          expect(scenario.urlFuente, `${scenarioId}.urlFuente`).toMatch(/^https:\/\/ccmc\.gsfc\.nasa\.gov\//);
          expect(scenario.fechaReal, `${scenarioId}.fechaReal`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(scenario.etapaJuego.diaInicio).toBeGreaterThan(0);
          expect(scenario.etapaJuego.diaFin).toBeGreaterThanOrEqual(scenario.etapaJuego.diaInicio);
          expect(scenario.summary).toMatchObject({
            cmeCount: scenario.eventosDetallados.nubesParticulas.length,
            gstCount: scenario.eventosDetallados.tormentasMagneticas.length,
            sepCount: scenario.eventosDetallados.lluviasParticulas.length,
            flrCount: scenario.eventosDetallados.llamaradasSolares.length,
          });
          for (const events of Object.values(scenario.eventosDetallados)) {
            for (const event of events) expect(event.link).toMatch(/^https:\/\/ccmc\.gsfc\.nasa\.gov\/DONKI\/view\//);
          }
        }
        expect(d.calmado.fechaReal).toBe('2020-01-01');
        expect(d.moderado.summary).toMatchObject({ cmeCount: 1, gstCount: 0, sepCount: 0, flrCount: 2 });
        expect(d.extremo.fechaReal).toBe('2024-05-10');
        expect(d.extremo.summary).toMatchObject({ cmeCount: 14, gstCount: 2, sepCount: 6, flrCount: 38, maxKp: 9 });
        continue;
      }
      expect(d.source?.url, `${id}.source.url`).toMatch(/^https:\/\//);
      expect(d.source?.retrievedAt, `${id}.source.retrievedAt`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(gameData.strings[`hub.sources.use.${id}`], `hub.sources.use.${id}`).toBeDefined();
    }
  });
});
