import { createBus } from '../utils/EventBus.js';
import { TimeManager } from './TimeManager.js';
import { ResourceManager } from './ResourceManager.js';
import { PowerGrid } from './PowerGrid.js';
import { LifeSupport } from './LifeSupport.js';
import { Food } from './Food.js';
import { Kitchen } from './Kitchen.js';
import { Crew } from './Crew.js';
import { IncidentRunner } from './IncidentRunner.js';
import { GameState } from './GameState.js';
import { Telecom } from './Telecom.js';
import { Radiation } from './Radiation.js';
import { Electronics } from './Electronics.js';
import { Rover } from './Rover.js';
import { MaintenanceRover } from './MaintenanceRover.js';
import { MissionDirector } from './MissionDirector.js';
import { Comms } from './Comms.js';
import { SolarTracker } from './SolarTracker.js';
import { Toolbelt } from './Toolbelt.js';
import { Repairs } from './Repairs.js';

const TICKS_PER_HOUR = 60;

/**
 * Headless composition of all simulation systems. No rendering imports (AGENTS.md §3).
 * Presentation talks to it only through bus intents and read-only access.
 */
export class Simulation {
  /**
   * @param {{ resources: any, balance: any, events: any[], real?: Record<string, any> }} data
   * @param {{ bus?: import('mitt').Emitter<any> }} [opts]
   */
  constructor(data, { bus = createBus() } = {}) {
    const b = data.balance;
    this.bus = bus;
    this.balance = b;
    this.inventory = { ...b.inventory };
    // Tools the player carries (hand or holster), from the tool-wall intents; repairs check it.
    this.tools = new Toolbelt(b.components ?? [], bus);

    this.time = new TimeManager(b.time, bus);
    this.resources = new ResourceManager(data.resources, bus);
    this.power = new PowerGrid(b.power, b.circuits, this.resources, bus, b.dust ?? null);
    // East–west sun tracker for the solar field (Energía console). Without config: fixed panels at full output.
    this.solarTracker = b.tracker ? new SolarTracker(b.tracker, b.power, bus) : null;
    this.power.tracker = this.solarTracker;
    this.power.tools = this.tools;
    this.lifeSupport = new LifeSupport(b, this.resources, bus, this.inventory);
    this.food = new Food(b, this.resources, bus);
    // Pantry + food processor in Hidroponía (spec §3.6.1). Without config, harvests are lost (tests only).
    this.kitchen = b.kitchen ? new Kitchen(b.kitchen, this.resources, bus) : null;
    this.crew = new Crew(b.health, TICKS_PER_HOUR, this.resources, bus);
    this.incidents = new IncidentRunner(data.events, b.time, { bus, power: this.power });
    this.telecom = new Telecom(b.telecom, bus, this.resources);
    // Earth link with the real light-time delay (JPL elements). Without the orbits snapshot: no delay.
    this.comms = new Comms(b.comms, data.real?.orbits ?? null, {
      bus, time: this.time, resources: this.resources, linkThreshold: this.telecom.cfg.linkThreshold,
    });
    // Telecom receiver power supply, repaired at the hub electronics bench (spec §6.6).
    this.electronics = b.electronics ? new Electronics(b.electronics, b.time, bus) : null;
    if (this.electronics) this.electronics.tools = this.tools;
    // Perseverance-class rover driven from the Sala de control; charges through the repairBay circuit.
    this.rover = b.rover ? new Rover(b.rover, bus, this.resources) : null;
    // Hand-tool repairs of scripted faults and hull leaks (repair:work intents).
    this.repairs = new Repairs(b.components ?? [], { bus, resources: this.resources, inventory: this.inventory, time: this.time, tools: this.tools });
    // Autonomous MARS-CLEANER rover for solar panel cleaning; independent battery and dock.
    this.cleaner = new MaintenanceRover(b.cleaner ?? null, bus, this.power);
    // Dynamic Mission Director for situational operational objectives.
    this.missionDirector = new MissionDirector(bus, this.resources);
    // Real Mars-surface radiation replay (informational, no health effect). Only if the snapshot exists.
    this.radiation = data.real?.radlab
      ? new Radiation(data.real.radlab, { sep: data.real.radlab_sep ?? null, cfg: b.radiation ?? null, bus })
      : null;
    this.game = new GameState(b.gameRules, TICKS_PER_HOUR, {
      bus,
      time: this.time,
      resources: this.resources,
      power: this.power,
      crew: this.crew,
    });
  }

  get phase() {
    return this.game.phase;
  }

  /**
   * Advances by real elapsed time (render loop). Only runs while playing.
   * @param {number} realDt seconds
   */
  advance(realDt) {
    if (this.game.phase !== 'playing') return 0;
    const ticks = this.time.consume(realDt);
    let ran = 0;
    for (; ran < ticks && this.game.phase === 'playing'; ran++) this.step();
    return ran;
  }

  /** Runs exactly one simulation tick (1 in-game minute). */
  step() {
    const dt = 1 / TICKS_PER_HOUR;
    const clock = this.time.clock();
    const circuits = this.balance.circuits;

    this.incidents.update(this.time.tick, clock);

    const ls = this.lifeSupport.wants();
    const hydro = this.food.wants(clock);
    const requests = {
      lifeSupport: ls.lifeSupport,
      heating: ls.heating * circuits.heating.drawKw,
      lighting: circuits.lighting.drawKw,
      telecom: circuits.telecom.drawKw,
      hydro: hydro.hydro + (this.kitchen?.wants().hydro ?? 0),
      repairBay: (this.rover?.chargeKw() ?? 0) + (this.cleaner?.chargeKw() ?? 0),
    };
    this.power.updateDust(dt);
    this.power.resolve(requests, clock, this.time.tick, this.solarTracker?.demandKw(clock) ?? 0);
    this.solarTracker?.update(clock, dt, this.power.trackerPowered);

    this.lifeSupport.update(this.power.served, dt);
    this.food.update(this.power.served, dt);
    this.kitchen?.update(this.power.served, dt);
    this.crew.update(dt, this.radiation?.crewDamage(), this.power.served.lighting);
    this.radiation?.update(clock, dt);
    this.electronics?.update(this.time.tick, dt);
    this.rover?.update(dt, this.power.served.repairBay);
    this.cleaner?.update(dt, this.power.served.repairBay);
    this.missionDirector?.update(this.time.tick, this);
    this.telecom.update(this.power.served.telecom, this.power.stormActive, dt);
    this.comms.update();
    this.resources.commit(dt);

    this.time.advanceTick();
    this.game.check();
  }
}
