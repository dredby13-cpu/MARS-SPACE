// @ts-check

/**
 * Headless simulation for the secondary rover: MARS-CLEANER (Autonomous Solar Maintenance Vehicle).
 * Completely independent of the Perseverance exploration rover (Rover.js).
 *
 * Responsibilities:
 * - Independent battery (2400 Wh).
 * - External charging dock outside the habitat.
 * - Dispatched by player from Energy room console.
 * - Navigates to individual solar panels (0..11) and cleans settled dust.
 * - Cleans at most the configured number of panels per sortie, then returns to dock.
 * - Progressively recovers PowerGrid.dustFactor.
 * - Recharges from the base power grid via the repairBay circuit when docked.
 */
export class MaintenanceRover {
  /**
   * @param {any} cfg
   * @param {import('mitt').Emitter<any>} bus
   * @param {import('./PowerGrid.js').PowerGrid} powerGrid
   */
  constructor(cfg, bus, powerGrid) {
    this.bus = bus;
    this.powerGrid = powerGrid;

    this.maxBatteryWh = cfg?.batteryWh ?? 2400;
    this.batteryWh = this.maxBatteryWh;
    this.dockKw = cfg?.dockKw ?? 0.3; // 300 W charging draw
    this.driveW = cfg?.driveW ?? 150;
    this.driveMPerGameMinute = cfg?.driveMPerGameMinute ?? 0.8;
    this.cleanW = cfg?.cleanW ?? 280;
    this.approachOffsetM = cfg?.approachOffsetM ?? 1.4;
    this.maxPanelsPerTrip = cfg?.maxPanelsPerTrip ?? 3;
    this.routeEndPaddingM = cfg?.routeEndPaddingM ?? 1.5;

    /** Dock coordinates (world space, outside east window near solar array) */
    this.dockPos = { x: 22.0, z: 1.5 };
    this.x = this.dockPos.x;
    this.z = this.dockPos.z;

    /** World coordinates of each of the 12 panels (row 0: 0..5, row 1: 6..11) */
    this.panelCoords = [];
    const ROW_X = [25.0, 28.5];
    const ROW_Z_OFFSET = [0, 1.5];
    for (let k = 0; k < 12; k++) {
      const row = Math.floor(k / 6);
      const col = k % 6;
      const pz = 7.0 - 7.5 + col * 3.0 + ROW_Z_OFFSET[row];
      const px = ROW_X[row];
      this.panelCoords.push({ x: px, z: pz });
    }
    /** Safe approach points west of each panel, leaving room for the rover chassis. */
    this.panelApproachCoords = this.panelCoords.map(({ x, z }) => ({
      x: x - this.approachOffsetM,
      z,
    }));
    this.laneX = [
      this.panelApproachCoords[0].x,
      this.panelApproachCoords[6].x,
    ];
    const panelZs = this.panelCoords.map(({ z }) => z);
    this.routeCrossovers = [
      Math.min(...panelZs) - this.routeEndPaddingM,
      Math.max(...panelZs) + this.routeEndPaddingM,
    ];
    this.currentLane = 0;
    /** @type {{ x: number, z: number }[]} */
    this.route = [];

    /** @type {'docked' | 'ready' | 'traveling' | 'cleaning' | 'returning' | 'charging' | 'broken'} */
    this.status = 'docked';

    /** Panels queued for cleaning */
    /** @type {number[]} */
    this.targets = [];
    this.currentTargetIdx = -1;
    this.cleaningTimer = 0;
    this.cleaningDurationPerPanel = cfg?.cleanTimeS ?? 8.0; // game seconds per panel

    /** Individual dust level per panel (0 = clean, 1 = filthy) */
    this.panelDust = new Float32Array(12).fill(0.3);

    // Intent listeners
    bus.on('cleaner:dispatch', (/** @type {any} */ e) => {
      this.dispatch(e?.panels);
    });
    bus.on('cleaner:return', () => {
      this.recall();
    });
    bus.on('cleaner:recharge', () => {
      this.recharge();
    });
  }

  get batteryPct() {
    return (100 * this.batteryWh) / this.maxBatteryWh;
  }

  get isDocked() {
    return this.status === 'docked' || this.status === 'charging' || this.status === 'ready';
  }

  /** Power demanded from base grid when docked and battery needs charging. */
  chargeKw() {
    return this.isDocked && this.batteryWh < this.maxBatteryWh - 1e-4 ? this.dockKw : 0;
  }

  /**
   * Dispatches rover to clean selected panels.
   * @param {number[]} [panelIndices]
   */
  dispatch(panelIndices) {
    if (this.status === 'broken' || this.batteryPct < 15) {
      this.bus.emit('cleaner:rejected', { reason: 'batteryLow' });
      return false;
    }
    if (this.status !== 'ready'
      && !(this.status === 'docked' && this.batteryWh >= this.maxBatteryWh - 1e-3)) {
      this.bus.emit('cleaner:rejected', { reason: 'busy' });
      return false;
    }
    const selection = Array.isArray(panelIndices) && panelIndices.length > 0
      ? [...new Set(panelIndices.filter((idx) => idx >= 0 && idx < 12))]
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    if (selection.length === 0) return false;
    if (selection.length > this.maxPanelsPerTrip) {
      this.bus.emit('cleaner:rejected', {
        reason: 'capacity',
        maxPanels: this.maxPanelsPerTrip,
      });
      return false;
    }

    this.targets = [...selection];
    this.currentTargetIdx = this.targets.shift() ?? -1;
    this.route = this.#routeToPanel(this.currentTargetIdx);
    this.status = 'traveling';
    this.cleaningTimer = 0;
    this.bus.emit('cleaner:dispatched', { targetsCount: selection.length });
    return true;
  }

  /** Recalls rover immediately back to dock. */
  recall() {
    if (this.isDocked) return;
    this.targets = [];
    this.currentTargetIdx = -1;
    this.route = this.#routeToDock();
    this.status = 'returning';
    this.bus.emit('cleaner:returning', {});
  }

  /** Sends an active rover back to its dock so it can recharge. */
  recharge() {
    if (this.isDocked || this.status === 'returning' || this.status === 'broken') return false;
    this.recall();
    return true;
  }

  /**
   * Selects the shortest rail route through the north or south crossover.
   * @param {{ x: number, z: number }} from
   * @param {{ x: number, z: number }[][]} candidates
   */
  #shortestRoute(from, candidates) {
    let bestRoute = [];
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      let previous = from;
      let distance = 0;
      for (const point of candidate) {
        distance += Math.hypot(point.x - previous.x, point.z - previous.z);
        previous = point;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRoute = candidate;
      }
    }
    return bestRoute.filter((point, index, points) => {
      const previous = index === 0 ? from : points[index - 1];
      return Math.hypot(point.x - previous.x, point.z - previous.z) > 1e-3;
    });
  }

  /** @param {number} panelIndex */
  #routeToPanel(panelIndex) {
    const targetLane = Math.floor(panelIndex / 6);
    const target = this.panelApproachCoords[panelIndex];
    const laneStart = { x: this.laneX[this.currentLane], z: this.z };
    if (targetLane === this.currentLane) {
      return this.#shortestRoute({ x: this.x, z: this.z }, [ [laneStart, target] ]);
    }

    return this.#shortestRoute({ x: this.x, z: this.z }, this.routeCrossovers.map((z) => [
      laneStart,
      { x: this.laneX[this.currentLane], z },
      { x: this.laneX[targetLane], z },
      target,
    ]));
  }

  /** Returns via the closest end crossover when currently on the far service lane. */
  #routeToDock() {
    const from = { x: this.x, z: this.z };
    const dockLane = { x: this.laneX[0], z: this.dockPos.z };
    if (this.currentLane === 0) {
      return this.#shortestRoute(from, [ [dockLane, this.dockPos] ]);
    }

    return this.#shortestRoute(from, this.routeCrossovers.map((z) => [
      { x: this.laneX[this.currentLane], z },
      { x: this.laneX[0], z },
      dockLane,
      this.dockPos,
    ]));
  }

  /**
   * Advances simulation by dt (hours).
   * @param {number} dtHours
   * @param {boolean} chargingPowerAvailable
   */
  update(dtHours, chargingPowerAvailable) {
    const dtSeconds = dtHours * 3600;

    // A. Recharging at dock
    if (this.isDocked) {
      if (this.batteryWh < this.maxBatteryWh - 1e-3) {
        if (chargingPowerAvailable) {
          this.status = 'charging';
          this.batteryWh = Math.min(this.maxBatteryWh, this.batteryWh + this.dockKw * 1000 * dtHours);
        } else {
          this.status = 'docked';
        }
      } else {
        this.status = 'ready';
      }
      return;
    }

    // Battery check while working
    if (this.batteryWh <= 0) {
      this.batteryWh = 0;
      this.status = 'broken';
      this.bus.emit('cleaner:stranded', { x: this.x, z: this.z });
      return;
    }

    // B. Traveling towards current target or returning to dock
    if (this.status === 'traveling' || this.status === 'returning') {
      // Consume drive energy
      this.batteryWh -= (this.driveW * dtSeconds) / 3600;
      let moveDist = this.driveMPerGameMinute * (dtHours * 60);
      while (this.route.length > 0) {
        const dest = this.route[0];
        const dx = dest.x - this.x;
        const dz = dest.z - this.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= 1e-3) {
          this.route.shift();
          continue;
        }
        if (moveDist <= 0) break;
        if (dist <= moveDist) {
          this.x = dest.x;
          this.z = dest.z;
          moveDist -= dist;
          this.route.shift();
        } else {
          this.x += (dx / dist) * moveDist;
          this.z += (dz / dist) * moveDist;
          moveDist = 0;
        }
      }

      if (this.route.length === 0) {
        if (this.status === 'returning') {
          this.x = this.dockPos.x;
          this.z = this.dockPos.z;
          this.currentLane = 0;
          this.status = 'docked';
          this.bus.emit('cleaner:docked', {});
        } else if (this.currentTargetIdx >= 0) {
          this.currentLane = Math.floor(this.currentTargetIdx / 6);
          this.status = 'cleaning';
          this.cleaningTimer = 0;
        }
      }
    } else if (this.status === 'cleaning') {
      // Consume cleaning energy
      this.batteryWh -= (this.cleanW * dtSeconds) / 3600;
      this.cleaningTimer += dtSeconds;

      if (this.cleaningTimer >= this.cleaningDurationPerPanel) {
        // Clean current panel: restore 1/12th of total potential dust recovery.
        const panelIdx = this.currentTargetIdx;
        this.panelDust[panelIdx] = 0.05;
        const recovered = this.powerGrid.cleanPanelPortion(1 / 12, 0.95);
        this.bus.emit('cleaner:panelCleaned', { panelIndex: panelIdx, recovered });

        // Return to recharge after the selected panels, never exceed one sortie's capacity.
        if (this.targets.length > 0) {
          this.currentTargetIdx = this.targets.shift() ?? -1;
          this.route = this.#routeToPanel(this.currentTargetIdx);
          this.status = 'traveling';
          this.cleaningTimer = 0;
        } else {
          this.currentTargetIdx = -1;
          this.route = this.#routeToDock();
          this.status = 'returning';
        }
      }
    }
  }
}
