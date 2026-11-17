const EPSILON = 1e-9;

/**
 * Power grid (SIMULATION_SPEC §2): battery + RTG + solar, binary breakers,
 * priority service at empty battery, overload relay trips.
 * Dust on the solar panels (dustFactor, 1 = clean): slow real settling rate, heavy deposit in storms,
 * cleaned by the electrodynamic dust shield ('solar:clean', LIMPIAR button) or a passing dust devil. See spec §2.5.
 */
export class PowerGrid {
  /**
   * @param {any} cfg balance.power
   * @param {Record<string, any>} circuits balance.circuits
   * @param {import('./ResourceManager.js').ResourceManager} resources
   * @param {import('mitt').Emitter<any>} bus
   * @param {any} [dust] balance.dust (omitted ⇒ panels never get dusty)
   */
  constructor(cfg, circuits, resources, bus, dust = null) {
    this.cfg = cfg;
    this.dustCfg = dust;
    /** Fraction of clean-panel output that still reaches the cells (1 = clean). */
    this.dustFactor = dust?.initialFactor ?? 1;
    this.lastDustPct = Math.round((1 - this.dustFactor) * 100);
    /** Sun tracker (src/systems/SolarTracker.js), set by Simulation; null ⇒ fixed panels at full output. @type {any} */
    this.tracker = null;
    /** Whether the tracker motor got power last tick. */
    this.trackerPowered = true;
    this.circuits = circuits;
    this.resources = resources;
    this.bus = bus;
    this.order = Object.keys(circuits).sort((a, b) => circuits[a].priority - circuits[b].priority);

    /** @type {Record<string, boolean>} */
    this.breakers = Object.fromEntries(this.order.map((id) => [id, true]));
    /** @type {Record<string, boolean>} */
    this.served = Object.fromEntries(this.order.map((id) => [id, true]));
    /** @type {Record<string, number>} */
    this.demand = Object.fromEntries(this.order.map((id) => [id, 0]));

    /** @type {import('./Toolbelt.js').Toolbelt | null} set by Simulation: what the player carries */
    this.tools = null;
    this.relayTripped = false;
    this.relayBurned = false;
    this.guidedTrip = false;
    /** @type {number[]} */
    this.tripTicks = [];
    this.overloadTicks = 0;
    this.stormActive = false;

    this.totalDemandKw = 0;
    this.servedLoadKw = 0;
    this.generationKw = 0;

    bus.on('breaker:toggle', (e) => {
      if (e && e.circuitId in this.breakers) this.breakers[e.circuitId] = Boolean(e.on);
    });
    bus.on('relay:resetRequest', () => this.resetRelay());
    bus.on('solar:clean', () => this.cleanPanels());
  }

  /** Dust settles every tick: real calm rate per sol, much faster during a dust storm. @param {number} dtHours */
  updateDust(dtHours) {
    const d = this.dustCfg;
    if (!d) return;
    const stowed = this.tracker?.mode === 'stow';
    const loss = this.stormActive
      ? d.stormLossPerHour * dtHours * (stowed ? this.tracker.cfg.stowDustFactor : 1)
      : (d.calmLossPerSol / 24) * dtHours;
    this.#setDust(this.dustFactor - loss);
  }

  /**
   * Cleaning pass: costs battery energy and recovers part of the lost solar output.
   * @returns {'ok' | 'noDust' | 'storm' | 'relay' | 'battery'}
   */
  cleanPanels() {
    const d = this.dustCfg;
    const reject = (/** @type {'noDust' | 'storm' | 'relay' | 'battery'} */ reason) => {
      this.bus.emit('solar:rejected', { reason });
      return reason;
    };
    if (!d || this.dustFactor >= d.cleanMinFactor) return reject('noDust');
    if (this.stormActive) return reject('storm');
    if (!this.relayClosed) return reject('relay');
    if (this.resources.value('power') < d.cleanKwh) return reject('battery');
    this.resources.add('power', -d.cleanKwh);
    const gained = (1 - this.dustFactor) * d.cleanRecovery;
    this.#setDust(this.dustFactor + gained);
    this.bus.emit('solar:cleaned', { by: 'shield', gained, kwh: d.cleanKwh });
    return 'ok';
  }

  /** A dust devil sweeps the panels (scripted event, observed for real by the Spirit rover). */
  dustDevil() {
    const d = this.dustCfg;
    if (!d) return;
    const gained = (1 - this.dustFactor) * d.devilRecovery;
    this.#setDust(this.dustFactor + gained);
    this.bus.emit('solar:cleaned', { by: 'devil', gained, kwh: 0 });
  }

  /**
   * Cleans a fractional portion of the solar field (e.g. 1 of 12 panels by MARS-CLEANER).
   * @param {number} fraction fraction of total panel surface cleaned (0..1)
   * @param {number} [cleanQuality] effectiveness multiplier (default 0.95)
   */
  cleanPanelPortion(fraction, cleanQuality = 0.95) {
    const d = this.dustCfg;
    if (!d || fraction <= 0) return 0;
    const dustToClear = (1 - this.dustFactor) * fraction * cleanQuality;
    if (dustToClear > 0) {
      this.#setDust(this.dustFactor + dustToClear);
      this.bus.emit('solar:cleaned', { by: 'cleaner_rover', gained: dustToClear, kwh: 0 });
    }
    return dustToClear;
  }

  /** @param {number} f */
  #setDust(f) {
    this.dustFactor = Math.min(1, Math.max(this.dustCfg?.minFactor ?? 0, f));
    const pct = Math.round((1 - this.dustFactor) * 100);
    if (pct !== this.lastDustPct) {
      this.lastDustPct = pct;
      this.bus.emit('solar:dustChanged', { dustFactor: this.dustFactor });
    }
  }

  get relayClosed() {
    return !this.relayTripped && !this.relayBurned;
  }

  /**
   * Opens the main relay. Guided (scripted tutorial) trips do not count toward burning it.
   * @param {number} tick @param {{ guided?: boolean }} [opts]
   */
  trip(tick, { guided = false } = {}) {
    if (this.relayBurned) return;
    this.relayTripped = true;
    this.overloadTicks = 0;
    if (guided) {
      this.guidedTrip = true;
    } else {
      this.tripTicks = this.tripTicks.filter((t) => t > tick - this.cfg.relayTripWindowTicks);
      this.tripTicks.push(tick);
      if (this.tripTicks.length >= this.cfg.relayBurnTrips) {
        this.relayBurned = true;
        this.bus.emit('component:damaged', { componentId: 'relay_main', reason: 'overload' });
        this.bus.emit('system:failed', { systemId: 'power', reason: 'relay_main' });
      }
    }
    this.bus.emit('relay:tripped', { guided, burned: this.relayBurned });
  }

  /**
   * Re-arms a tripped relay. A burned one is replaced first: it needs its tool in hand or on the belt
   * (`components[relay_main].toolId`, via `this.tools`) and costs spare parts (`relayRepairSpares`).
   */
  resetRelay() {
    if (!this.relayTripped && !this.relayBurned) return;
    if (this.relayBurned) {
      const cost = this.cfg.relayRepairSpares;
      if (cost === undefined) return; // not repairable without the rule
      if (this.tools && !this.tools.canRepair('relay_main')) {
        this.bus.emit('relay:rejected', { reason: 'noTool', toolId: this.tools.toolFor('relay_main') });
        return;
      }
      if (this.resources.value('spares') < cost) {
        this.bus.emit('relay:rejected', { reason: 'noSpare' });
        return;
      }
      this.resources.add('spares', -cost);
      this.relayBurned = false;
      this.tripTicks = [];
      this.bus.emit('system:repaired', { systemId: 'power', partId: 'relay_main' });
    }
    this.relayTripped = false;
    this.guidedTrip = false;
    this.bus.emit('relay:reset', {});
  }

  /** @param {{ hourFloat: number }} clock */
  generation(clock) {
    const daylight = clock.hourFloat >= this.cfg.solarStartHour && clock.hourFloat < this.cfg.solarEndHour;
    const aim = this.tracker ? this.tracker.factor(clock.hourFloat) : 1;
    const solar = daylight ? this.cfg.solarKw * aim * this.dustFactor * (this.stormActive ? this.cfg.stormSolarFactor : 1) : 0;
    return this.cfg.rtgKw + solar;
  }

  /**
   * Resolves one tick of supply/demand and adds the battery rate.
   * @param {Record<string, number>} requests kW wanted per circuit (before breakers)
   * @param {{ hourFloat: number }} clock
   * @param {number} tick
   * @param {number} [extraKw] load outside the breaker circuits (sun-tracker motor)
   */
  resolve(requests, clock, tick, extraKw = 0) {
    let total = extraKw;
    for (const id of this.order) {
      const kw = this.breakers[id] && this.relayClosed ? requests[id] ?? 0 : 0;
      this.demand[id] = kw;
      total += kw;
    }

    if (this.relayClosed && total > this.cfg.busLimitKw + EPSILON) {
      this.overloadTicks += 1;
      if (this.overloadTicks === 1) {
        this.bus.emit('power:overloadWarning', { demandKw: total, limitKw: this.cfg.busLimitKw });
      }
      if (this.overloadTicks >= this.cfg.overloadTicks) this.trip(tick);
    } else {
      this.overloadTicks = 0;
    }

    const gen = this.generation(clock);
    const battery = this.resources.value('power');
    /** @type {Record<string, boolean>} */
    const served = {};
    let servedLoad = 0;

    if (!this.relayClosed) {
      for (const id of this.order) served[id] = false;
    } else if (battery > EPSILON) {
      for (const id of this.order) {
        served[id] = this.breakers[id];
        if (served[id]) servedLoad += this.demand[id];
      }
    } else {
      let available = gen;
      for (const id of this.order) {
        if (!this.breakers[id]) {
          served[id] = false;
        } else if (this.demand[id] <= available + EPSILON) {
          served[id] = true;
          available -= this.demand[id];
          servedLoad += this.demand[id];
        } else {
          served[id] = false;
        }
      }
    }

    // Tracker motor: runs on the main bus (no breaker) whenever the relay is closed and there is energy.
    this.trackerPowered = this.relayClosed && (battery > EPSILON || gen - servedLoad >= extraKw - EPSILON);
    if (this.trackerPowered) servedLoad += extraKw;

    for (const id of this.order) {
      if (served[id] !== this.served[id]) {
        this.bus.emit(served[id] ? 'power:restored' : 'power:lost', { circuitId: id });
      }
    }
    this.served = served;
    this.totalDemandKw = this.relayClosed ? total : 0;
    this.servedLoadKw = servedLoad;
    this.generationKw = gen;
    this.resources.addRate('power', gen - servedLoad);
  }
}
