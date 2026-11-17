// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Personal: crew quarters right next to the Sala central (no corridor), radiation storm shelter,
// real-data dosimeter (NASA OSDR RadLab, MSL RAD), historical DONKI replay, and astronaut health (NASA OSDR).
// Panels are pictograms (personalIcons.js) for young players; each has an «Info» button that opens the
// rigorous text with numbers and sources (src/ui/InfoSheet.js).
// Placement: src/data/stations/personal.json · Texts: src/data/strings/es/personal.json
import {
  Vector3, Object3D, Mesh, InstancedMesh, BoxGeometry, CylinderGeometry, PlaneGeometry,
  MeshLambertMaterial, MeshBasicMaterial,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../../ui/StationKit.js';
import { Panel } from '../../ui/Panel.js';
import { fmt } from '../../utils/strings.js';
import { addInfo } from '../../ui/InfoSheet.js';
import { getNasaScenarioReplay } from './spaceWeatherLive.js';
import * as icon from './personalIcons.js';
import { insideAlcove, TANK_RADIUS } from './shelterRules.js';

/** @typedef {import('../../ui/InfoSheet.js').Line} Line */

/** @type {Record<string, (g: import('three').Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  /** Dosimeter: big current rate, Mars vs ISS bars and the real 24 h record. Turns into the storm alarm during the SEP event. */
  personal_dosimeter(g, _station, kit) {
    const { t, sim } = kit;
    const radlab = kit.game.data.real?.radlab;
    const panel = new Panel(1.2, 0.8, { pxPerMeter: 520 });
    g.add(panel.mesh);

    addInfo(g, kit, {
      bx: 0, by: -0.47, px: 0, py: 0, w: 1.3, h: 0.86,
      title: () => t(sim().radiation?.stormActive ? 'personal.sep.info_title' : 'personal.dosimeter.info_title'),
      lines: () => {
        const r = sim().radiation;
        if (!r || !radlab) return [{ text: t('personal.dosimeter.no_data'), color: COLORS.warning }];
        if (r.stormActive) {
          return [
            { text: t('personal.sep.rate', { rate: r.rate.toFixed(0), normal: r.marsMean.toFixed(1) }), size: 0.85 },
            { text: t('personal.sep.storm_dose', { dose: formatDose(r.stormDoseMicroGy) }), size: 0.85 },
            { text: t('personal.sep.exposed', { min: Math.round(r.exposedMinutes) }), size: 0.85 },
            { text: t('personal.sep.nasa'), color: COLORS.info, size: 0.8 },
            { text: t('personal.sep.real'), color: COLORS.dim, size: 0.72 },
          ];
        }
        return [
          { text: t('personal.dosimeter.info_unit', { rate: r.rate.toFixed(2) }), size: 0.82 },
          { text: t('personal.dosimeter.shift_dose', { dose: formatDose(r.doseMicroGy) }), size: 0.82 },
          ...(r.issTypical !== null ? [{ text: t('personal.dosimeter.iss', { value: r.issTypical.toFixed(1) }), size: 0.82 }] : []),
          { text: t('personal.dosimeter.context'), size: 0.82 },
          { text: t('personal.sep.nasa'), color: COLORS.info, size: 0.78 },
          { text: t('personal.dosimeter.source', { day: formatDay(radlab.day), retrieved: formatDay(radlab.source.retrievedAt) }), color: COLORS.dim, size: 0.7 },
          { text: t('personal.dosimeter.replay'), color: COLORS.dim, size: 0.7 },
        ];
      },
    });

    kit.onRefresh(() => {
      const r = sim().radiation;
      if (!r || !radlab) {
        panel.renderLines(t('personal.dosimeter.title'), [{ text: t('personal.dosimeter.no_data'), color: COLORS.warning }]);
        return;
      }
      const inside = r.sheltered; // reported by the shelter alcove (personal_bunk)
      if (r.stormActive) {
        const danger = r.shelterNeeded;
        const level = Math.min(1, r.rate / Math.max(1, r.stormPeak, r.rate));
        const [msgKey, msgColor] = !danger ? ['personal.sep.ending', COLORS.nominal]
          : inside ? ['personal.sep.safe', COLORS.nominal] : ['personal.sep.go', COLORS.critical];
        panel.renderCustom(`storm|${msgKey}|${Math.round(level * 30)}`, (ctx, W, H) => {
          icon.frame(ctx, W, H, danger ? COLORS.critical : COLORS.warning);
          icon.text(ctx, t('personal.sep.short'), W / 2, H * 0.11, { size: H * 0.1, color: danger ? COLORS.critical : COLORS.warning, bold: true, align: 'center' });
          icon.sun(ctx, W * 0.2, H * 0.43, H * 0.15, true);
          icon.particles(ctx, W * 0.45, H * 0.43, H * 0.13);
          icon.shield(ctx, W * 0.75, H * 0.43, H * 0.17, !danger || inside);
          icon.text(ctx, t('personal.sep.level'), W * 0.06, H * 0.7, { size: H * 0.055, color: COLORS.dim });
          icon.bar(ctx, W * 0.32, H * 0.67, W * 0.62, H * 0.06, level, danger ? COLORS.critical : COLORS.warning);
          icon.text(ctx, t(msgKey), W / 2, H * 0.87, { size: H * 0.085, color: msgColor, bold: true, align: 'center', maxWidth: W * 0.92 });
        });
        return;
      }
      const c = sim().time.clock();
      const minute = c.hour * 60 + c.minute;
      const key = `${r.rate.toFixed(2)}|${Math.floor(minute / 10)}`;
      panel.renderCustom(key, (ctx, W, H) => drawDosimeter(ctx, W, H, { t, r, minute, date: radlab.day }));
    });
  },

  /**
   * Storm shelter: an alcove in the corner of Personal walled with water tanks (back, both sides and roof),
   * with the crew bunk inside, like the water-wall sleeping quarters proposed for Orion and used on the ISS.
   * Only the alcove protects (balance/personal.json → shelter): the player's head must be inside it.
   * It reports `crew:shelter { inside }`; the simulation decides the dose (Radiation).
   */
  personal_bunk(g, station, kit) {
    const { t, sim } = kit;
    const cfg = kit.game.data.balance.shelter;
    const W = cfg.widthM;
    const D = cfg.depthM;
    const H = cfg.heightM;
    const R = TANK_RADIUS;
    const base = -station.y; // station-local floor
    // Station-local: x across the wall, +z into the room, the back wall at z = 0.

    // ---- Bunk (plain materials: it must read as a bed, not as a machine) ----
    const mat = (/** @type {string} */ color) => new MeshLambertMaterial({ color });
    const bedX = W / 2 - 2 * R - cfg.bed.lengthM / 2 - 0.02; // against the far side tanks
    const bedZ = 2 * R + cfg.bed.widthM / 2;
    const frame = new Mesh(new BoxGeometry(cfg.bed.lengthM, 0.34, cfg.bed.widthM), mat('#4a5058'));
    frame.position.set(bedX, base + 0.17, bedZ);
    const bedTop = new Mesh(mergeGeometries([
      new BoxGeometry(cfg.bed.lengthM - 0.06, 0.14, cfg.bed.widthM - 0.06).translate(0, 0.41, 0), // mattress
      new BoxGeometry(cfg.bed.lengthM * 0.62, 0.05, cfg.bed.widthM - 0.02).translate(-cfg.bed.lengthM * 0.17, 0.5, 0), // blanket
    ]), mat('#5b7fa6'));
    bedTop.position.set(bedX, base, bedZ);
    const pillow = new Mesh(new BoxGeometry(0.42, 0.11, cfg.bed.widthM * 0.7), mat('#ece7dd'));
    pillow.position.set(bedX + cfg.bed.lengthM / 2 - 0.3, base + 0.54, bedZ);
    g.add(frame, bedTop, pillow);
    kit.solids.push(frame); // walk around the bed; you can still lean over it

    // ---- Water tanks (one instanced draw call): back wall, both sides and roof ----
    /** @type {{ x: number, y: number, z: number, axis: 'x' | 'y' | 'z', len: number }[]} */
    const tanks = [];
    for (let row = 0; row < 5; row++) tanks.push({ x: 0, y: base + 0.75 + row * 0.27, z: R, axis: 'x', len: W - 4 * R }); // back, above the bed
    for (let i = 0; i < 5; i++) tanks.push({ x: W / 2 - R, y: base + H / 2, z: R + i * ((D - 2 * R) / 4), axis: 'y', len: H }); // far side
    for (let i = 0; i < 5; i++) tanks.push({ x: -W / 2 + R, y: base + H / 2, z: R + i * ((D - 2 * R) / 4), axis: 'y', len: H }); // near side
    for (let i = 0; i < 10; i++) tanks.push({ x: -W / 2 + R + i * ((W - 2 * R) / 9), y: base + H + R, z: D / 2, axis: 'z', len: D }); // roof
    const tankMesh = new InstancedMesh(new CylinderGeometry(R, R, 1, 14), mat('#2f78b0'), tanks.length);
    const tmp = new Object3D();
    tanks.forEach((k, i) => {
      tmp.position.set(k.x, k.y, k.z);
      tmp.rotation.set(k.axis === 'z' ? Math.PI / 2 : 0, 0, k.axis === 'x' ? Math.PI / 2 : 0);
      tmp.scale.set(1, k.len, 1);
      tmp.updateMatrix();
      tankMesh.setMatrixAt(i, tmp.matrix);
    });
    g.add(tankMesh);
    // Metal frame: front posts and lintel holding the roof tanks.
    g.add(new Mesh(mergeGeometries([
      new BoxGeometry(0.08, H + 0.3, 0.08).translate(-W / 2, base + (H + 0.3) / 2, D),
      new BoxGeometry(0.08, H + 0.3, 0.08).translate(W / 2, base + (H + 0.3) / 2, D),
      new BoxGeometry(W + 0.08, 0.1, 0.1).translate(0, base + H + 0.05, D),
    ]), mat('#3a4048')));
    // Collision for the near tank wall only (an AABB of the whole alcove would block its inside).
    const nearWall = new Mesh(new BoxGeometry(2 * R + 0.04, H, D), new MeshBasicMaterial({ visible: false }));
    nearWall.position.set(-W / 2 + R, base + H / 2, D / 2);
    g.add(nearWall);
    kit.solids.push(nearWall);

    // ---- Floor pad: where you are protected (blue; green inside; pulsing red in a storm while you are out) ----
    const padMat = new MeshBasicMaterial({ color: COLORS.info, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
    const pad = new Mesh(new PlaneGeometry(W - 4 * R, D - 0.1).rotateX(-Math.PI / 2), padMat);
    pad.position.set(0, base + 0.012, D / 2 + 0.05);
    g.add(pad);

    // ---- Sign on the lintel, facing the room, with the «why water?» sheet ----
    const sign = new Panel(1.3, 0.3, { pxPerMeter: 640 });
    sign.mesh.position.set(0, base + H + 0.32, D + 0.07);
    g.add(sign.mesh);
    const info = new Object3D();
    info.position.z = D + 0.06;
    g.add(info);
    addInfo(info, kit, {
      bx: 0.8, by: base + H + 0.32, px: 0, py: base + 1.35, w: 1.3, h: 0.8,
      title: () => t('personal.shelter.info_title'),
      lines: () => [
        { text: t('personal.shelter.info_1'), size: 0.85 },
        { text: t('personal.shelter.info_2'), size: 0.85 },
        { text: t('personal.shelter.info_3'), size: 0.85 },
        { text: t('personal.shelter.info_note'), color: COLORS.dim, size: 0.7 },
      ],
    });

    // ---- Am I inside? Head position in station-local space ----
    const loco = kit.services.locomotion;
    const head = new Vector3();
    const inside = () => {
      if (!loco) return false;
      loco.headWorld(head);
      g.worldToLocal(head);
      return insideAlcove(head.x, head.z, cfg);
    };

    let pulse = 0;
    kit.onFrame((dt) => {
      pulse += dt;
      const r = sim().radiation;
      const storm = Boolean(r?.stormActive && r.shelterNeeded);
      padMat.opacity = storm && !r.sheltered ? 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(pulse * 5)) : storm ? 0.45 : 0.22;
    });
    kit.onRefresh(() => {
      const r = sim().radiation;
      const isIn = inside();
      if (r && r.sheltered !== isIn) kit.game.intent('crew:shelter', { inside: isIn });
      const storm = Boolean(r?.stormActive && r.shelterNeeded);
      const state = storm ? (isIn ? 'safe' : 'enter') : isIn ? 'inside' : 'idle';
      const color = state === 'safe' || state === 'inside' ? COLORS.nominal : state === 'enter' ? COLORS.critical : COLORS.info;
      padMat.color.set(color);
      sign.renderCustom(`shelter|${state}`, (ctx, w, h) => {
        icon.frame(ctx, w, h, color);
        icon.shield(ctx, h * 0.5, h / 2, h * 0.32, state !== 'enter');
        icon.drop(ctx, h * 1.05, h * 0.55, h * 0.42, '#6fc3ff');
        icon.text(ctx, t('personal.shelter.title'), h * 1.45, h * 0.32, { size: h * 0.26, color: COLORS.title, bold: true, maxWidth: w - h * 1.55 });
        icon.text(ctx, t(`personal.shelter.state.${state}`), h * 1.45, h * 0.7, { size: h * 0.2, color, bold: true, maxWidth: w - h * 1.55 });
      });
    });
  },

  personal_locker(g, station, kit) {
    kit.addBox(g, 0.8, 1.9, 0.5, 0, 0.95 - station.y, 0.25, '#56606b');
  },

  /** Historical NASA DONKI activity, replayed locally in sync with the game clock. */
  personal_spaceweather(g, _station, kit) {
    const { t, sim } = kit;
    const scenarios = kit.game.data.real?.escenarios_nasa;
    const panel = new Panel(0.95, 0.72, { pxPerMeter: 520 });
    g.add(panel.mesh);
    if (!scenarios) {
      panel.renderLines(t('personal.sun.info_title'), [{ text: t('personal.sun.unavailable'), color: COLORS.warning }]);
      return;
    }
    const replay = getNasaScenarioReplay(kit.game, scenarios, () => kit._refreshAll());

    addInfo(g, kit, {
      bx: 0, by: -0.43, px: 0, py: 0.05, w: 1.3, h: 0.95,
      title: () => t('personal.sun.info_title'),
      lines: () => {
        replay.syncClock(sim().time.clock());
        return nasaScenarioInfoLines(replay.getSnapshot(), t);
      },
    });

    kit.onRefresh(() => {
      replay.syncClock(sim().time.clock());
      const state = replay.getSnapshot();
      const { counts } = state;
      const dateTime = state.timestamp.slice(11, 16);
      const key = [state.id, state.timestamp, ...Object.values(counts)].join('|');
      const stageColor = state.id === 'extremo' ? COLORS.critical
        : state.id === 'moderado' ? COLORS.warning : COLORS.nominal;
      panel.renderCustom(key, (ctx, W, H) => {
        icon.frame(ctx, W, H, stageColor);
        icon.text(ctx, t('personal.sun.short_title'), W * 0.05, H * 0.1, { size: H * 0.085, color: COLORS.title, bold: true });
        icon.tile(ctx, W * 0.64, H * 0.04, W * 0.32, H * 0.11, '#11161c', stageColor, 4);
        icon.text(ctx, t(`personal.sun.scenario.${state.id}`), W * 0.8, H * 0.1, { size: H * 0.055, color: stageColor, bold: true, align: 'center', maxWidth: W * 0.28 });
        icon.sun(ctx, W * 0.17, H * 0.48, H * 0.14, counts.sepCount > 0 || counts.maxKp >= 8);
        /** @type {[(c: CanvasRenderingContext2D, x: number, y: number, r: number) => void, string, number][]} */
        const rows = [
          [(c, x, y, r) => icon.cloud(c, x, y, r), 'personal.sun.cme_short', counts.cmeCount],
          [(c, x, y, r) => icon.magnet(c, x, y, r), 'personal.sun.gst_short', counts.gstCount],
          [(c, x, y, r) => icon.particles(c, x, y, r), 'personal.sun.sep_short', counts.sepCount],
          [(c, x, y, r) => icon.sun(c, x, y, r), 'personal.sun.flr_short', counts.flrCount],
        ];
        rows.forEach(([draw, key2, count], i) => {
          const y = H * (0.27 + i * 0.15);
          draw(ctx, W * 0.39, y, H * 0.055);
          icon.text(ctx, String(count), W * 0.49, y, { size: H * 0.085, bold: true, color: count ? COLORS.info : COLORS.dim });
          icon.text(ctx, t(key2), W * 0.59, y, { size: H * 0.06, maxWidth: W * 0.38 });
        });
        icon.text(ctx, `${state.sourceDate} · ${dateTime} UTC`, W / 2, H * 0.92, { size: H * 0.055, color: COLORS.dim, align: 'center' });
      });
    });
  },

  /** "Tu cuerpo en el espacio": 3 picture cards from real NASA OSDR studies; details in the Info sheet. */
  personal_health(g, _station, kit) {
    const { t } = kit;
    const osdr = kit.game.data.real?.osdr_health;
    const panel = new Panel(1.05, 0.8, { pxPerMeter: 520 });
    g.add(panel.mesh);
    if (!osdr) {
      panel.renderLines(t('personal.health.title'), [{ text: t('personal.health.no_data'), color: COLORS.warning }]);
      return;
    }
    /** @type {Record<string, (c: CanvasRenderingContext2D, x: number, y: number, r: number) => void>} */
    const icons = {
      muscle_bone: (c, x, y, r) => icon.bone(c, x, y, r),
      astronauts: (c, x, y, r) => icon.bodyClock(c, x, y, r),
      radiation_immunity: (c, x, y, r) => icon.defender(c, x, y, r),
    };
    panel.renderCustom('health', (ctx, W, H) => {
      icon.frame(ctx, W, H);
      icon.text(ctx, t('personal.health.short_title'), W / 2, H * 0.09, { size: H * 0.08, color: COLORS.title, bold: true, align: 'center', maxWidth: W * 0.9 });
      osdr.studies.slice(0, 3).forEach((/** @type {any} */ s, /** @type {number} */ i) => {
        const y = H * 0.18 + i * H * 0.27;
        icon.tile(ctx, W * 0.04, y, W * 0.92, H * 0.24, '#161d25', COLORS.border, 3);
        (icons[s.topic] ?? icons.muscle_bone)(ctx, W * 0.14, y + H * 0.12, H * 0.085);
        icon.text(ctx, t(`personal.health.card.${s.topic}`), W * 0.26, y + H * 0.075, { size: H * 0.065, bold: true, maxWidth: W * 0.66 });
        icon.text(ctx, t(`personal.health.tip.${s.topic}`), W * 0.26, y + H * 0.165, { size: H * 0.055, color: COLORS.info, maxWidth: W * 0.66 });
      });
    });
    addInfo(g, kit, {
      bx: 0, by: -0.47, px: 0, py: 0, w: 1.2, h: 0.86,
      title: () => t('personal.health.title'),
      lines: () => [
        ...osdr.studies.flatMap((/** @type {any} */ s) => [
          {
            text: s.mission
              ? t('personal.health.info_study', { accession: s.accession, where: t(`personal.health.where.${s.topic}`), mission: s.mission })
              : `${s.accession} · ${t(`personal.health.where.${s.topic}`)}`,
            color: COLORS.info,
            size: 0.75,
          },
          { text: t(s.summaryKey), size: 0.8 },
        ]),
        { text: t('personal.health.info_note'), color: COLORS.dim, size: 0.7 },
        { text: t('personal.health.source', { date: formatDay(osdr.source.retrievedAt) }), color: COLORS.dim, size: 0.7 },
      ],
    });
  },
};

/** @param {any} state @param {Function} t @returns {Line[]} */
function nasaScenarioInfoLines(state, t) {
  const { scenario, counts } = state;
  const start = formatDay(scenario.fechaReal);
  const end = formatDay(scenario.fechaFin ?? scenario.fechaReal);
  const range = start === end ? start : `${start}–${end}`;
  const stage = scenario.etapaJuego;
  /** @type {Line[]} */
  const lines = [
    { text: t('personal.sun.attribution', { source: scenario.fuenteOficial, date: range }), color: COLORS.info, size: 0.78 },
    { text: t('personal.sun.current', { ...counts, maxKp: counts.maxKp ?? '—' }), size: 0.8 },
    { text: t('personal.sun.total', scenario.summary), size: 0.76 },
  ];
  if (state.latestEvent) {
    lines.push({ text: t('personal.sun.latest', { event: describeHistoricalEvent(state.latestEvent, t) }), size: 0.76 });
  } else {
    lines.push({ text: t('personal.sun.no_event'), color: COLORS.dim, size: 0.76 });
  }
  if (state.nextEvent) {
    lines.push({ text: t('personal.sun.next', { event: describeHistoricalEvent(state.nextEvent, t) }), color: COLORS.warning, size: 0.76 });
  }
  lines.push(
    { text: t('personal.sun.schedule', { start: stage.diaInicio, end: stage.diaFin }), size: 0.74 },
    { text: t('personal.sun.controls'), size: 0.74 },
    { text: t('personal.sun.visual_only'), color: COLORS.dim, size: 0.72 },
    { text: t('personal.sun.source_url'), color: COLORS.dim, size: 0.68 },
  );
  return lines;
}

/** @param {{ type: string, time: string, data: any }} event @param {Function} t */
function describeHistoricalEvent(event, t) {
  let detail = '';
  if (event.type === 'cme' && event.data.speedKms !== null) detail = `${Math.round(event.data.speedKms)} km/s`;
  if (event.type === 'flr') detail = event.data.classType ?? '';
  if (event.type === 'gst') {
    const kp = event.data.observations?.map((/** @type {any} */ item) => item.kpIndex).filter(Number.isFinite) ?? [];
    if (kp.length) detail = `Kp ${Math.max(...kp)}`;
  }
  if (event.type === 'sep') detail = `${event.data.instruments?.length ?? 0} instrumentos`;
  return `${t(`personal.sun.event.${event.type}`, { detail })} · ${event.time.replace('T', ' ').replace('Z', ' UTC')}`;
}

/**
 * Dosimeter face for young players: big current rate, Mars vs ISS bars, the real 24 h record with a "now"
 * marker, and one short line. Numbers and sources are in the Info sheet.
 * @param {CanvasRenderingContext2D} ctx @param {number} W @param {number} H
 * @param {{ t: Function, r: any, minute: number, date: string }} p
 */
function drawDosimeter(ctx, W, H, { t, r, minute, date }) {
  const pad = W * 0.04;
  icon.frame(ctx, W, H);
  icon.text(ctx, t('personal.dosimeter.short_title'), pad, H * 0.08, { size: H * 0.075, color: COLORS.title, bold: true });

  // Big current rate.
  icon.particles(ctx, pad + H * 0.07, H * 0.27, H * 0.06, COLORS.info);
  icon.text(ctx, t('personal.dosimeter.now'), pad + H * 0.17, H * 0.19, { size: H * 0.05, color: COLORS.dim });
  icon.text(ctx, `${fmt(r.rate)} µGy/h`, pad + H * 0.17, H * 0.29, { size: H * 0.1, color: COLORS.info, bold: true });

  // Mars vs ISS bars (same day, real data).
  const bx = W * 0.55;
  const bw = W * 0.4;
  const max = Math.max(r.rate, r.issTypical ?? 0) * 1.1;
  icon.text(ctx, t('personal.dosimeter.mars'), bx, H * 0.17, { size: H * 0.045, color: COLORS.dim });
  icon.bar(ctx, bx, H * 0.2, bw, H * 0.045, r.rate / max, '#d9472b');
  if (r.issTypical !== null) {
    icon.text(ctx, t('personal.dosimeter.iss_short'), bx, H * 0.29, { size: H * 0.045, color: COLORS.dim });
    icon.bar(ctx, bx, H * 0.32, bw, H * 0.045, r.issTypical / max, '#7cc4ff');
  }

  // Chart of the real 24 h record.
  const cx = pad;
  const cy = H * 0.42;
  const cw = W - pad * 2;
  const ch = H * 0.3;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx, cy, cw, ch);
  const values = r.samples.map((/** @type {any} */ s) => s.rate);
  const vMin = Math.min(...values) * 0.95;
  const vMax = Math.max(...values) * 1.05;
  const px = (/** @type {number} */ m) => cx + (m / 1440) * cw;
  const py = (/** @type {number} */ v) => cy + ch - ((v - vMin) / (vMax - vMin)) * ch;
  ctx.strokeStyle = COLORS.info;
  ctx.lineWidth = 3;
  ctx.beginPath();
  r.samples.forEach((/** @type {any} */ s, /** @type {number} */ i) => (i ? ctx.lineTo(px(s.minute), py(s.rate)) : ctx.moveTo(px(s.minute), py(s.rate))));
  ctx.stroke();
  ctx.strokeStyle = COLORS.title; // "now" in the replay
  ctx.beginPath();
  ctx.moveTo(px(minute), cy);
  ctx.lineTo(px(minute), cy + ch);
  ctx.stroke();
  icon.text(ctx, t('personal.dosimeter.today', { date: formatDay(date) }), cx + cw - 6, cy + H * 0.035, { size: H * 0.042, color: COLORS.dim, align: 'right' });

  // One short, reassuring line.
  icon.buriedBase(ctx, pad + H * 0.08, H * 0.86, H * 0.07);
  icon.text(ctx, t('personal.dosimeter.safe'), pad + H * 0.2, H * 0.86, { size: H * 0.07, color: COLORS.nominal, bold: true, maxWidth: W - pad * 2 - H * 0.2 });
}

/** @param {number} microGy */
function formatDose(microGy) {
  return microGy >= 1000 ? `${fmt(microGy / 1000, 2)} mGy` : `${fmt(microGy)} µGy`;
}

/** "2023-01-01" → "01/01/2023" */
function formatDay(/** @type {string} */ iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
