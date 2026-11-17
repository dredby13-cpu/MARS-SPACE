import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { builders, batteryCharge } from '../src/rooms/energy/stations.js';

describe('Energía solar desk', () => {
  it('has no Rover 2 console any more', () => {
    expect(gameData.layout.stations.find((item) => item.id === 'energy_rover2')).toBeUndefined();
    expect(builders.energy_rover2).toBeUndefined();
  });

  it('explains whether the battery is charging or discharging, and how long it lasts', () => {
    const t = (/** @type {string} */ key, /** @type {any} */ p) => `${key}${p ? JSON.stringify(p) : ''}`;
    expect(batteryCharge({ value: 20, max: 40, ratePerHour: 2 }, t)).toMatchObject({ key: 'charging', text: expect.stringContaining('"h":"10"') });
    expect(batteryCharge({ value: 10, max: 40, ratePerHour: -4 }, t)).toMatchObject({ key: 'discharging', text: expect.stringContaining('"h":"2,5"') });
    expect(batteryCharge({ value: 40, max: 40, ratePerHour: 0.5 }, t).key).toBe('full');
    expect(batteryCharge({ value: 20, max: 40, ratePerHour: 0 }, t).key).toBe('idle');
  });

});

describe('AUTO sun tracking from the solar desk', () => {
  it('follows the sun and costs motor power only in daylight', async () => {
    const { newSim, runTicks } = await import('./helpers/sim.js');
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    sim.time.tick = 2 * 60; // day 1, 08:00
    sim.bus.emit('solar:auto', { on: true });
    expect(sim.solarTracker.mode).toBe('auto');
    expect(sim.solarTracker.demandKw(sim.time.clock())).toBeCloseTo(sim.solarTracker.cfg.autoKw);
    runTicks(sim, 120);
    expect(sim.solarTracker.factor(sim.time.clock().hourFloat)).toBeGreaterThan(0.95);
    sim.time.tick = 16 * 60; // 22:00
    expect(sim.solarTracker.demandKw(sim.time.clock())).toBe(0);
    sim.bus.emit('solar:turn', { dir: 1 }); // a manual turn takes over again
    expect(sim.solarTracker.mode).toBe('manual');
  });
});
