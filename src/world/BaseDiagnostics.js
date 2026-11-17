// @ts-check
import * as THREE from 'three';

/**
 * @typedef {{
 *   id: string,
 *   room: string,
 *   roomName: string,
 *   stationPos: [number, number, number],
 *   title: string,
 *   solution: string,
 *   severity: 'critical' | 'warning'
 * }} Malfunction
 */

/** Room ceiling center coordinates for alarm beacon lights */
const ROOM_BEACON_POSITIONS = {
  room_hub: [0.75, 2.48, 0.0],
  room_control: [8.0, 2.48, -5.5],
  room_telecom: [-7.5, 2.48, -5.5],
  room_personal: [-5.5, 2.48, 0.0],
  room_hydro: [-7.5, 2.48, 8.0],
  room_energy: [11.0, 2.48, 7.0],
};

/**
 * Evaluates simulation state and returns all active errors/malfunctions,
 * their physical room, the exact 3D station position, and step-by-step solution.
 * @param {any} sim
 * @returns {Malfunction[]}
 */
export function getActiveMalfunctions(sim) {
  const list = [];
  if (!sim) return list;

  // 1. Relé de energía quemado o disparado por sobrecarga
  if (sim.power?.relayBurned) {
    list.push({
      id: 'relay_burned',
      room: 'room_energy',
      roomName: 'SALA DE ENERGÍA',
      stationPos: [10.4, 1.6, 3.7],
      title: 'Relé Principal Quemado',
      solution: 'Coge 1 repuesto en Sala Central y pulsa "Rearme Relé".',
      severity: 'critical',
    });
  } else if (sim.power?.relayTripped) {
    list.push({
      id: 'relay_tripped',
      room: 'room_energy',
      roomName: 'SALA DE ENERGÍA',
      stationPos: [10.4, 1.6, 3.7],
      title: 'Disparo de Relé por Sobrecarga',
      solution: 'Desconecta circuitos en el cuadro y pulsa "Rearme Relé".',
      severity: 'warning',
    });
  }

  // 2. Corte en circuito crítico de soporte vital
  if (sim.power?.breakers && !sim.power.breakers.lifeSupport) {
    list.push({
      id: 'breaker_ls_off',
      room: 'room_energy',
      roomName: 'SALA DE ENERGÍA',
      stationPos: [10.4, 1.6, 3.7],
      title: 'Soporte Vital Desconectado',
      solution: 'Sube el interruptor de "Soporte Vital" en el cuadro norte.',
      severity: 'critical',
    });
  }

  // 3. Fuente de alimentación de Telecom rota (requiere banco en Sala Central)
  if (sim.electronics && sim.electronics.output?.quality !== 'ok') {
    list.push({
      id: 'rx_psu_damaged',
      room: 'room_hub',
      roomName: 'SALA CENTRAL (TALLER)',
      stationPos: [0.0, 0.95, 2.2],
      title: 'Fallo Receptor Telecom (RX PSU)',
      solution: 'Ve al banco de electrónica en Sala Central: desuelda y cambia el diodo roto.',
      severity: 'warning',
    });
  }

  // 4. Motor de antena o pérdida total de señal
  if (sim.telecom?.motorBroken) {
    list.push({
      id: 'telecom_motor_broken',
      room: 'room_telecom',
      roomName: 'TELECOMUNICACIONES',
      stationPos: [-7.5, 1.3, -7.2],
      title: 'Motor de Antena Bloqueado',
      solution: 'Revisa la consola de Telecom y desbloquea el eje de orientación.',
      severity: 'warning',
    });
  } else if ((sim.resources?.value('signal') ?? 100) < 20) {
    list.push({
      id: 'telecom_link_lost',
      room: 'room_telecom',
      roomName: 'TELECOMUNICACIONES',
      stationPos: [-7.5, 1.3, -7.2],
      title: 'Pérdida de Señal con Tierra (<20%)',
      solution: 'Gira la antena con los botones IZQ / DER en la consola de Telecom.',
      severity: 'warning',
    });
  }

  // 5. Filtro CO2 saturado o aire degradándose
  if (sim.lifeSupport && sim.lifeSupport.filterLifeHours < 6) {
    list.push({
      id: 'filter_expired',
      room: 'room_energy',
      roomName: 'SALA DE ENERGÍA',
      stationPos: [13.6, 1.45, 3.7],
      title: 'Filtro CO2 Sólido Agotado',
      solution: 'Pulsa "CAMBIAR FILTRO" en el depurador sur de la Sala de Energía.',
      severity: 'critical',
    });
  }

  // 6. Polvo fotovoltaico alto
  if ((sim.power?.dustFactor ?? 1.0) < 0.8) {
    list.push({
      id: 'solar_dust_critical',
      room: 'room_energy',
      roomName: 'SALA DE ENERGÍA',
      stationPos: [15.0, 1.1, 7.0],
      title: 'Polvo Fotovoltaico Excesivo',
      solution: 'Selecciona paneles y pulsa "DESPACHAR" en la consola MARS-CLEANER.',
      severity: 'warning',
    });
  }

  // 7. MARS-CLEANER varado o averiado
  if (sim.cleaner?.status === 'broken') {
    list.push({
      id: 'cleaner_stranded',
      room: 'room_energy',
      roomName: 'SALA DE ENERGÍA',
      stationPos: [15.0, 1.1, 7.0],
      title: 'MARS-CLEANER Varado / Sin Batería',
      solution: 'Asegura circuito Taller con energía y pulsa "RETORNAR".',
      severity: 'critical',
    });
  }

  // 8. Rover de exploración varado o en peligro
  if (sim.rover && !sim.rover.docked && (sim.rover.stranded || sim.rover.batteryPct < 20)) {
    list.push({
      id: 'rover_in_danger',
      room: 'room_control',
      roomName: 'SALA DE CONTROL',
      stationPos: [10.8, 1.1, -5.5],
      title: 'Rover Explorador en Emergencia',
      solution: 'Ve a la Sala de Control para maniobrar y retornar el rover a base.',
      severity: 'critical',
    });
  }

  return list;
}

/**
 * Creates the Base Diagnostics System:
 * - Ceiling alarm beacons for all rooms that pulse red/amber when errors occur.
 * - 3D holographic waypoint rings that float directly over the broken machine.
 *
 * @param {THREE.Scene} scene
 * @param {() => any} getSim
 */
export function buildBaseDiagnostics(scene, getSim) {
  const root = new THREE.Group();
  root.name = 'BaseDiagnostics_System';
  scene.add(root);

  // ---------------------------------------------------------------------------
  // 1. CEILING ALARM BEACONS FOR EACH ROOM
  // ---------------------------------------------------------------------------
  const beaconGroup = new THREE.Group();
  beaconGroup.name = 'RoomAlarmBeacons';
  root.add(beaconGroup);

  const fixtureMat = new THREE.MeshLambertMaterial({ color: 0x272c33 });
  const lensBaseGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.08, 16);
  const lensDomeGeo = new THREE.SphereGeometry(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  lensDomeGeo.rotateX(Math.PI); // facing downward into the room

  /** @type {Record<string, { lensMat: THREE.MeshBasicMaterial, light: THREE.PointLight }>} */
  const roomBeacons = {};

  for (const [roomId, pos] of Object.entries(ROOM_BEACON_POSITIONS)) {
    const holder = new THREE.Group();
    holder.position.set(pos[0], pos[1], pos[2]);

    const fixture = new THREE.Mesh(lensBaseGeo, fixtureMat);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x1f2937, toneMapped: false });
    const lens = new THREE.Mesh(lensDomeGeo, lensMat);
    lens.position.y = -0.04;

    const light = new THREE.PointLight(0xff2222, 0, 7.5, 2.0);
    light.position.y = -0.15;

    holder.add(fixture, lens, light);
    beaconGroup.add(holder);

    roomBeacons[roomId] = { lensMat, light };
  }

  // ---------------------------------------------------------------------------
  // 2. ANIMATED HOLOGRAPHIC WAYPOINT MARKERS OVER BROKEN STATIONS
  // ---------------------------------------------------------------------------
  const markerGroup = new THREE.Group();
  markerGroup.name = 'MalfunctionHoloMarkers';
  root.add(markerGroup);

  // Pre-instantiate a pool of 6 holographic waypoint markers
  const MAX_MARKERS = 6;
  const ringGeo = new THREE.TorusGeometry(0.24, 0.022, 8, 24).rotateX(Math.PI / 2);
  const diamondGeo = new THREE.OctahedronGeometry(0.12);

  const markerPool = [];
  for (let i = 0; i < MAX_MARKERS; i++) {
    const mHolder = new THREE.Group();
    mHolder.visible = false;

    const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85, toneMapped: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);

    const diamondMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const diamond = new THREE.Mesh(diamondGeo, diamondMat);
    diamond.position.y = 0.16;

    mHolder.add(ring, diamond);
    markerGroup.add(mHolder);
    markerPool.push({ holder: mHolder, ringMat, diamondMat, ring, diamond });
  }

  // ---------------------------------------------------------------------------
  // 3. ANIMATION & SYNCHRONIZATION
  // ---------------------------------------------------------------------------
  let totalTime = 0;

  return {
    root,
    /** Returns list of currently active malfunctions */
    getActive() {
      return getActiveMalfunctions(getSim());
    },

    /** @param {number} dt */
    update(dt) {
      totalTime += dt;
      const sim = getSim();
      if (!sim) return;

      const malfunctions = getActiveMalfunctions(sim);
      const roomSeverities = {};

      for (const m of malfunctions) {
        if (!roomSeverities[m.room] || m.severity === 'critical') {
          roomSeverities[m.room] = m.severity;
        }
      }

      // Update room ceiling beacons
      for (const [roomId, beacon] of Object.entries(roomBeacons)) {
        const severity = roomSeverities[roomId];
        if (!severity) {
          beacon.light.intensity = 0;
          beacon.lensMat.color.setHex(0x111827); // dim dark off
        } else if (severity === 'critical') {
          // Rapid strobe flash red (6 Hz)
          const strobe = Math.sin(totalTime * 14.0) > 0 ? 1 : 0;
          beacon.light.color.setHex(0xef4444);
          beacon.light.intensity = strobe * 2.2;
          beacon.lensMat.color.setHex(strobe ? 0xff2222 : 0x450a0a);
        } else {
          // Warning amber pulsing (3 Hz)
          const pulse = 0.4 + 0.6 * Math.abs(Math.sin(totalTime * 4.5));
          beacon.light.color.setHex(0xf59e0b);
          beacon.light.intensity = pulse * 1.5;
          beacon.lensMat.color.setHex(pulse > 0.6 ? 0xfbbf24 : 0x78350f);
        }
      }

      // Update holographic station waypoints
      markerPool.forEach((m, idx) => {
        if (idx < malfunctions.length) {
          const mal = malfunctions[idx];
          m.holder.visible = true;
          const [sx, sy, sz] = mal.stationPos;

          // Bobbing float animation
          const bob = Math.sin(totalTime * 4.5 + idx) * 0.06;
          m.holder.position.set(sx, sy + 0.45 + bob, sz);

          // Continuous rotation
          m.holder.rotation.y = totalTime * 2.0;

          // Pulsating scale
          const pulseScale = 1.0 + 0.15 * Math.sin(totalTime * 6.0);
          m.ring.scale.set(pulseScale, pulseScale, pulseScale);

          // Color by severity
          const colorHex = mal.severity === 'critical' ? 0xef4444 : 0xf59e0b;
          m.ringMat.color.setHex(colorHex);
          m.diamondMat.color.setHex(colorHex);
        } else {
          m.holder.visible = false;
        }
      });
    },
  };
}
