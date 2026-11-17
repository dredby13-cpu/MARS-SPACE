// @ts-check

/**
 * @typedef {{
 *   id: string,
 *   type: 'power' | 'solar' | 'lifeSupport' | 'telecom' | 'rover',
 *   priority: 'critical' | 'warning' | 'info',
 *   title: string,
 *   detail: string,
 *   active: boolean,
 *   createdTick: number
 * }} Mission
 */

/**
 * Dynamic Mission Director for Ares Uno.
 * Periodically evaluates real simulation telemetry and generates dynamic operational
 * objectives without mutating resources directly.
 */
export class MissionDirector {
  /**
   * @param {import('mitt').Emitter<any>} bus
   * @param {import('./ResourceManager.js').ResourceManager} resources
   */
  constructor(bus, resources) {
    this.bus = bus;
    this.resources = resources;
    /** @type {Map<string, Mission>} */
    this.missions = new Map();
  }

  /**
   * Evaluates simulation state and updates active missions.
   * @param {number} tick
   * @param {any} sim
   */
  update(tick, sim) {
    const power = this.resources.value('power');
    const signal = this.resources.value('signal');
    const o2 = this.resources.value('oxygen');
    const co2 = this.resources.value('co2');

    // 1. Mission: Power Saving
    const powerCritical = power < 15.0 || sim.power.overloadTicks > 0;
    this.#checkCondition(
      'mission_power_saving',
      powerCritical,
      {
        type: 'power',
        priority: power < 8.0 ? 'critical' : 'warning',
        title: 'Ahorro Energético Crítico',
        detail: 'Batería de base baja. Desconecta circuitos no esenciales (calefacción/taller).',
      },
      tick,
    );

    // 2. Mission: Solar Dust Cleaning
    const dustFactor = sim.power.dustFactor ?? 1.0;
    const dustCritical = dustFactor < 0.82 || sim.power.stormActive;
    this.#checkCondition(
      'mission_clean_panels',
      dustCritical,
      {
        type: 'solar',
        priority: dustFactor < 0.65 ? 'critical' : 'warning',
        title: 'Mantenimiento de Paneles Solares',
        detail: `Polvo marciano obstruyendo fotovoltaica (${Math.round((1 - dustFactor) * 100)}%). Despacha MARS-CLEANER.`,
      },
      tick,
    );

    // 3. Mission: Life Support Filter & Atmosphere
    const lsCritical = o2 < 19.5 || co2 > 1000 || (sim.lifeSupport && sim.lifeSupport.filterLifeHours < 8);
    this.#checkCondition(
      'mission_life_support',
      lsCritical,
      {
        type: 'lifeSupport',
        priority: (o2 < 18.5 || co2 > 1400) ? 'critical' : 'warning',
        title: 'Fallo en Atmósfera de Hábitat',
        detail: 'Calidad de aire degradándose. Revisa depurador CO2 o cambia filtros.',
      },
      tick,
    );

    // 4. Mission: Telecom Link Alignment
    const commsLost = signal < 20 || Boolean(sim.telecom?.motorBroken);
    this.#checkCondition(
      'mission_realign_antenna',
      commsLost,
      {
        type: 'telecom',
        priority: signal === 0 ? 'critical' : 'warning',
        title: 'Pérdida de Enlace con la Tierra',
        detail: 'Alineación de antena insuficiente (<20%). Reorienta el mástil hacia la Tierra.',
      },
      tick,
    );

    // 5. Mission: Exploration Rover Battery / Rescue
    const roverLowBatt = sim.rover && !sim.rover.docked && (sim.rover.batteryPct < 22 || sim.rover.stranded);
    this.#checkCondition(
      'mission_rescue_rover',
      Boolean(roverLowBatt),
      {
        type: 'rover',
        priority: sim.rover?.stranded ? 'critical' : 'warning',
        title: 'Rover de Exploración en Riesgo',
        detail: 'Batería de rover de exploración crítica. Retórnalo a la base inmediatamente.',
      },
      tick,
    );
  }

  /**
   * @param {string} id
   * @param {boolean} condition
   * @param {Omit<Mission, 'id' | 'active' | 'createdTick'>} meta
   * @param {number} tick
   */
  #checkCondition(id, condition, meta, tick) {
    const existing = this.missions.get(id);
    if (condition && !existing?.active) {
      const mission = { id, ...meta, active: true, createdTick: tick };
      this.missions.set(id, mission);
      this.bus.emit('mission:created', mission);
    } else if (!condition && existing?.active) {
      existing.active = false;
      this.bus.emit('mission:completed', existing);
    }
  }

  getActiveMissions() {
    return Array.from(this.missions.values()).filter((m) => m.active);
  }
}
