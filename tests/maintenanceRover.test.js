// @ts-check
import { describe, it, expect } from 'vitest';
import { MaintenanceRover } from '../src/systems/MaintenanceRover.js';
import { MissionDirector } from '../src/systems/MissionDirector.js';
import { Simulation } from '../src/systems/Simulation.js';
import { gameData } from '../src/data/index.js';

describe('Maintenance Rover (MARS-CLEANER) & Mission Director', () => {
  it('maintains absolute independence from the exploration rover (Rover.js)', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });

    expect(sim.rover).toBeDefined();
    expect(sim.cleaner).toBeDefined();

    const initialRoverBattery = sim.rover?.batteryWh;
    const initialCleanerBattery = sim.cleaner.batteryWh;

    // Dispatch MARS-CLEANER to clean panels 0 and 1
    sim.bus.emit('cleaner:dispatch', { panels: [0, 1] });
    expect(sim.cleaner.status).toBe('traveling');
    expect(sim.cleaner.targets).toEqual([1]);
    expect(sim.cleaner.currentTargetIdx).toBe(0);

    // Advance simulation
    sim.step();
    sim.step();

    // Exploration rover remains 100% untouched
    expect(sim.rover?.batteryWh).toBe(initialRoverBattery);
    expect(sim.rover?.mode).toBe('docked');
    expect(sim.rover?.odometerM).toBe(0);

    // Cleaner rover consumed its own battery
    expect(sim.cleaner.batteryWh).toBeLessThan(initialCleanerBattery);
  });

  it('waits for the game clock during training and moves after the shift starts', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });
    expect(sim.cleaner.dispatch([0])).toBe(true);
    const startX = sim.cleaner.x;
    const startZ = sim.cleaner.z;

    expect(sim.advance(0.3)).toBe(0);
    expect(sim.cleaner.x).toBe(startX);
    expect(sim.cleaner.z).toBe(startZ);

    sim.bus.emit('game:start', {});
    expect(sim.advance(0.3)).toBeGreaterThan(0);
    expect(Math.hypot(sim.cleaner.x - startX, sim.cleaner.z - startZ)).toBeGreaterThan(0);
  });

  it('chooses the shorter crossover route between the solar service lanes', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });
    expect(sim.cleaner.dispatch([6])).toBe(true);

    expect(sim.cleaner.route).toContainEqual({
      x: sim.cleaner.laneX[0],
      z: sim.cleaner.routeCrossovers[0],
    });
    expect(sim.cleaner.route).not.toContainEqual({
      x: sim.cleaner.laneX[0],
      z: sim.cleaner.routeCrossovers[1],
    });
  });

  it('returns to the dock on a recharge command and can dispatch again when full', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });
    expect(sim.cleaner.dispatch([6])).toBe(true);

    sim.bus.emit('cleaner:recharge', {});
    expect(sim.cleaner.status).toBe('returning');
    expect(sim.cleaner.targets).toEqual([]);
    for (let i = 0; i < 80 && !sim.cleaner.isDocked; i++) sim.step();
    expect(sim.cleaner.isDocked).toBe(true);

    for (let i = 0; i < 80 && sim.cleaner.status !== 'ready'; i++) sim.step();
    expect(sim.cleaner.status).toBe('ready');
    expect(sim.cleaner.dispatch([6])).toBe(true);
    expect(sim.cleaner.status).toBe('traveling');
  });

  it('MARS-CLEANER cleans panels and recovers PowerGrid dustFactor', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });

    // Make panels dirty
    sim.power.dustFactor = 0.6;
    expect(sim.power.dustFactor).toBe(0.6);

    // Dispatch to clean panels 0, 1, 2
    sim.cleaner.dispatch([0, 1, 2]);
    expect(sim.cleaner.status).toBe('traveling');

    // Simulate ticks until cleaning is performed
    for (let i = 0; i < 40; i++) {
      sim.step();
    }

    // Panel cleaning must have improved dustFactor
    expect(sim.power.dustFactor).toBeGreaterThan(0.6);
  });

  it('limits each sortie to three panels, approaches safely, returns and recharges', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });
    const rejected = [];
    const cleaned = [];
    sim.bus.on('cleaner:rejected', (event) => rejected.push(event));
    sim.bus.on('cleaner:panelCleaned', (event) => cleaned.push(event.panelIndex));

    expect(sim.cleaner.dispatch([0, 1, 2, 3])).toBe(false);
    expect(rejected).toContainEqual({ reason: 'capacity', maxPanels: 3 });
    expect(sim.cleaner.status).toBe('docked');

    expect(sim.cleaner.dispatch([0, 1, 2])).toBe(true);
    expect(sim.cleaner.panelApproachCoords[0].x).toBeCloseTo(
      sim.cleaner.panelCoords[0].x - gameData.balance.cleaner.approachOffsetM,
    );

    for (let i = 0; i < 80 && cleaned.length < 3; i++) sim.step();
    expect(cleaned).toEqual([0, 1, 2]);
    expect(sim.cleaner.status).toBe('returning');

    for (let i = 0; i < 20 && !sim.cleaner.isDocked; i++) sim.step();
    expect(sim.cleaner.isDocked).toBe(true);
    const batteryAtDock = sim.cleaner.batteryWh;
    sim.step();
    expect(sim.cleaner.status).toBe('charging');
    expect(sim.cleaner.batteryWh).toBeGreaterThan(batteryAtDock);
    expect(sim.cleaner.dispatch([0])).toBe(false);
    expect(rejected).toContainEqual({ reason: 'busy' });
  });

  it('MARS-CLEANER charges from the base grid when docked without affecting exploration rover', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });

    // Drain cleaner battery slightly
    sim.cleaner.batteryWh = 1800;
    expect(sim.cleaner.chargeKw()).toBe(0.3);

    const roverBatteryBefore = sim.rover?.batteryWh;

    // Simulate charging tick
    sim.step();

    expect(sim.cleaner.batteryWh).toBeGreaterThan(1800);
    // Exploration rover battery remains untouched
    expect(sim.rover?.batteryWh).toBe(roverBatteryBefore);
  });

  it('MissionDirector creates dynamic objectives based on real telemetry without duplicates', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });

    expect(sim.missionDirector).toBeDefined();

    // Drain base battery to critical level (< 15 kWh)
    const currentPower = sim.resources.value('power');
    sim.resources.add('power', 10.0 - currentPower);
    sim.step();

    const activeMissions = sim.missionDirector.getActiveMissions();
    expect(activeMissions.some((m) => m.id === 'mission_power_saving')).toBe(true);

    // Antirebound: running more steps does not duplicate active mission
    sim.step();
    sim.step();
    const powerMissions = sim.missionDirector.getActiveMissions().filter((m) => m.id === 'mission_power_saving');
    expect(powerMissions.length).toBe(1);

    // Recover power (> 15 kWh)
    const nowPower = sim.resources.value('power');
    sim.resources.add('power', 40.0 - nowPower);
    sim.step();
    expect(sim.missionDirector.getActiveMissions().some((m) => m.id === 'mission_power_saving')).toBe(false);
  });
});
