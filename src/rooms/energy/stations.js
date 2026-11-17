// OWNER: teammate (Telecom · Control · Energy) — see docs/COLLABORATION.md
// Energía y oxígeno, laid out as a flow: N distribution (breakers + relay, life-support gauges) · E generation
// (solar console under the window, LIMPIAR = dust shield) · S life support (O₂ tanks + electrolyzer, CO₂ scrubber) · W climate.
// Panels are pictograms (energyIcons.js) for young players; each has an «Info» button that opens the rigorous
// text with numbers (src/ui/InfoSheet.js). Placement: src/data/stations/energy.json
import * as THREE from 'three';
import { COLORS, BUTTON, statusColor } from '../../ui/StationKit.js';
import { Button } from '../../objects/Button.js';
import { addInfo } from '../../ui/InfoSheet.js';
import { addRepairPoint } from '../../ui/RepairPoint.js';
import { fmt } from '../../utils/strings.js';
import { SolarTracker } from '../../systems/SolarTracker.js';
import * as icon from './energyIcons.js';

/** «35° E» / «20° O» / «0°» / «de canto». @param {number} deg @param {Function} t */
function angleLabel(deg, t) {
  const d = Math.round(deg);
  if (Math.abs(d) >= 89) return t('solar.edge_on');
  return d === 0 ? '0°' : `${Math.abs(d)}° ${t(d < 0 ? 'solar.dir.east' : 'solar.dir.west')}`;
}

const CIRCUITS = ['lifeSupport', 'heating', 'lighting', 'telecom', 'hydro', 'repairBay'];
const STATE_COLORS = { on: COLORS.nominal, off: COLORS.dim, offline: COLORS.critical };
/** Canvas resolution for pictogram panels. */
const SHARP = { pxPerMeter: 560 };
/** Scale of the two north-wall dashboards (ENERGÍA DE LA BASE, AIRE DE LA BASE). */
const BIG = 1.35;

/**
 * Battery charge line for the breaker panel: charging / discharging at the net rate (kWh per game hour = kW)
 * with the time to full / empty, or «full».
 * @param {{ value: number, max: number, ratePerHour: number }} batt @param {Function} t
 * @returns {{ key: 'charging' | 'discharging' | 'full' | 'idle', text: string, color: string }}
 */
export function batteryCharge(batt, t) {
  const rate = batt.ratePerHour ?? 0;
  const hours = (/** @type {number} */ h) => (h >= 10 ? String(Math.round(h)) : fmt(h, 1));
  if (batt.value >= batt.max - 0.05 && rate >= -0.01) return { key: 'full', text: t('energy.breakers.full'), color: COLORS.nominal };
  if (rate > 0.01) return { key: 'charging', text: t('energy.breakers.charging', { kw: fmt(rate, 2), h: hours((batt.max - batt.value) / rate) }), color: COLORS.nominal };
  if (rate < -0.01) return { key: 'discharging', text: t('energy.breakers.discharging', { kw: fmt(-rate, 2), h: hours(batt.value / -rate) }), color: COLORS.warning };
  return { key: 'idle', text: t('energy.breakers.steady'), color: COLORS.dim };
}

/** @type {Record<string, (g: import('three').Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  /**
   * Solar console under the solar-field window (src/world/SolarField.js): a desk with physical push buttons
   * (◀ IZQUIERDA · DERECHA ▶ · PROTEGER) that drive the sun tracker (src/systems/SolarTracker.js), LIMPIAR
   * (electrodynamic dust shield, `solar:clean`; the window plays the shield wave), a production strip on the
   * desk and a top-view panel on the wall.
   */
  energy_solar_view(g, station, kit) {
    const { t, sim, game } = kit;
    // Desk under the window (sill 1.05 m): top at 0.78 m.
    const deskTop = 0.78 - station.y;
    kit.addBox(g, 1.6, 0.74, 0.6, 0, deskTop - 0.39, 0.33, '#3a4048');
    kit.addBox(g, 1.64, 0.04, 0.64, 0, deskTop - 0.01, 0.33, '#2a2f35');
    // Production strip standing on the back of the desk, below the sill.
    const strip = kit.addPanel(g, 1.4, 0.24, 0, deskTop + 0.15, SHARP);
    /** @param {string} label @param {number} x @param {() => void} onSelect */
    const deskButton = (label, x, onSelect) => {
      const button = new Button({ width: 0.27, height: 0.1, label, color: BUTTON.action, onSelect });
      const holder = new THREE.Group();
      holder.position.set(x, deskTop + 0.01, 0.15);
      holder.rotation.x = -Math.PI / 2;
      holder.add(button.mesh);
      g.add(holder);
      return kit.registerButton(button);
    };
    // Top-view panel on the wall beside the window, left of the solar field.
    const view = kit.addPanel(g, 1.0, 0.72, -2.4, 0.6, SHARP);

    // Keep the MARS-CLEANER controls on the wall beside the window opening.
    const cleanerX = 2.35;
    const cleanerY = 0.68;
    const cleanerPanel = kit.addPanel(g, 1.05, 0.72, cleanerX, cleanerY, SHARP);
    const maxPanelsPerTrip = sim().cleaner?.maxPanelsPerTrip ?? 3;
    const defaultPanels = sim().balance.cleaner?.defaultPanels ?? [0, 1, 2];
    const selectedPanels = new Set(defaultPanels.slice(0, maxPanelsPerTrip));
    let selectionAtCapacity = false;

    addInfo(g, kit, {
      bx: cleanerX + 0.68, by: 1.16, px: cleanerX, py: cleanerY, w: 1.25, h: 0.88,
      title: () => t('cleaner.title'),
      lines: () => [
        { text: 'MARS-CLEANER: Vehículo Autónomo de Mantenimiento', bold: true, size: 0.85 },
        { text: 'Batería: 2.400 Wh (Li-Ion). Recarga por inducción en muelle exterior (300 W).', size: 0.78 },
        { text: 'Consumo: 150 W en marcha, 280 W en cepillado fotovoltaico.', size: 0.78 },
        { text: t('cleaner.info.capacity', { max: maxPanelsPerTrip }), size: 0.78 },
        { text: 'No utiliza Telecom para electricidad; la recarga consume del circuito Taller.', color: COLORS.info, size: 0.75 },
      ],
    });

    // 12 panel selector push buttons (2 rows of 6)
    const panelButtons = [];
    for (let k = 0; k < 12; k++) {
      const row = Math.floor(k / 6);
      const col = k % 6;
      const bx = cleanerX + (col - 2.5) * 0.16;
      const by = 0.19 - row * 0.11;
      const pIdx = k;
      const pBtn = new Button({
        width: 0.13, height: 0.075, label: `P${k + 1}`,
        color: BUTTON.action,
        onSelect: () => {
          if (selectedPanels.has(pIdx)) {
            selectedPanels.delete(pIdx);
            selectionAtCapacity = false;
          } else if (selectedPanels.size < maxPanelsPerTrip) {
            selectedPanels.add(pIdx);
            selectionAtCapacity = false;
          } else {
            selectionAtCapacity = true;
          }
        },
      });
      pBtn.mesh.position.set(bx, by, 0.02);
      g.add(pBtn.mesh);
      kit.registerButton(pBtn);
      panelButtons.push(pBtn);
    }

    // Keep the mission buttons under the status display, away from the solar window.
    const btnDispatch = kit.addButton(g, { width: 0.36, height: 0.1, label: t('cleaner.btn.dispatch'), onSelect: () => {
      game.intent('cleaner:dispatch', { panels: Array.from(selectedPanels) });
    } }, cleanerX - 0.2, -0.05);
    const btnRecall = kit.addButton(g, { width: 0.36, height: 0.1, label: t('cleaner.btn.return'), onSelect: () => {
      game.intent('cleaner:return', {});
    } }, cleanerX + 0.2, -0.05);
    const btnRecharge = kit.addButton(g, { width: 0.62, height: 0.1, label: t('cleaner.btn.recharge'), onSelect: () => {
      game.intent('cleaner:recharge', {});
    } }, cleanerX, -0.19);
    addInfo(g, kit, {
      bx: -2.4, by: 0.15, px: -2.4, py: 0.66, w: 1.2, h: 0.86,
      title: () => t('energy.info.solar.title'),
      lines: () => {
        const s = sim();
        const clock = s.time.clock();
        const cfg = s.power.cfg;
        const tr = s.solarTracker;
        const day = clock.hourFloat >= cfg.solarStartHour && clock.hourFloat < cfg.solarEndHour;
        const solar = Math.max(0, s.power.generation(clock) - cfg.rtgKw);
        /** @type {import('../../ui/InfoSheet.js').Line[]} */
        const lines = [{ text: t('solar.now', { kw: solar.toFixed(2), max: cfg.solarKw.toFixed(1) }), size: 0.82 }];
        if (tr) {
          lines.push({ text: t(`solar.mode.${tr.mode}`), size: 0.8 });
          lines.push({ text: t('solar.angle', { panel: angleLabel(tr.angleDeg, t), sun: day ? angleLabel(SolarTracker.sunAngle(clock.hourFloat), t) : t('solar.sun_down'), pct: Math.round(tr.factor(clock.hourFloat) * 100) }), color: COLORS.info, size: 0.8 });
          lines.push({ text: t('solar.auto_cost', { kw: tr.cfg.autoKw, kwh: fmt(tr.cfg.autoKw * (cfg.solarEndHour - cfg.solarStartHour), 1) }), color: tr.mode === 'auto' ? COLORS.warning : COLORS.text, size: 0.78 });
        }
        lines.push({ text: t('solar.dust', { pct: Math.round((1 - s.power.dustFactor) * 100), factor: s.power.dustFactor.toFixed(2) }), size: 0.8 });
        lines.push({ text: t('energy.info.solar.1'), size: 0.78 });
        lines.push({ text: t('energy.info.solar.2'), size: 0.78 });
        if (s.power.dustCfg) lines.push({ text: t('energy.info.solar.clean', { kwh: fmt(s.power.dustCfg.cleanKwh) }), size: 0.78 });
        lines.push({ text: t('solar.rover', { state: t(s.rover?.docked ? 'solar.rover.docked' : 'solar.rover.away') }), color: COLORS.dim, size: 0.7 });
        return lines;
      },
    });

    // Five desk buttons: manual tracking, AUTO, PROTEGER and the electrodynamic dust shield.
    const left = deskButton(t('solar.btn.left'), -0.56, () => game.intent('solar:turn', { dir: -1 }));
    const right = deskButton(t('solar.btn.right'), -0.28, () => game.intent('solar:turn', { dir: 1 }));
    const auto = deskButton(t('solar.btn.auto'), 0, () => game.intent('solar:auto', { on: sim().solarTracker?.mode !== 'auto' }));
    const stow = deskButton(t('solar.btn.stow'), 0.28, () => game.intent('solar:stow', { on: sim().solarTracker?.mode !== 'stow' }));
    const clean = deskButton(t('solar.btn.clean'), 0.56, () => game.intent('solar:clean', {}));

    kit.onRefresh(() => {
      const s = sim();
      const clock = s.time.clock();
      const cfg = s.power.cfg;
      const tr = s.solarTracker;
      const solar = Math.max(0, s.power.generation(clock) - cfg.rtgKw);
      const day = clock.hourFloat >= cfg.solarStartHour && clock.hourFloat < cfg.solarEndHour;
      const storm = s.power.stormActive;
      const dust = 1 - s.power.dustFactor;
      const align = tr ? tr.factor(clock.hourFloat) : 1;
      const mode = tr?.mode ?? 'manual';
      const [msgKey, msgColor] = storm && mode !== 'stow' ? ['energy.solar.msg_storm', COLORS.critical]
        : mode === 'stow' ? ['energy.solar.msg_stowed', COLORS.warning]
        : !day ? ['energy.solar.msg_night', COLORS.dim]
        : dust > 0.2 ? ['energy.solar.msg_dusty', COLORS.warning]
        : align < 0.8 ? ['energy.solar.msg_turn', COLORS.warning]
        : ['energy.solar.msg_sun', COLORS.nominal];

      strip.renderCustom(`${fmt(solar, 2)}|${day}|${storm}`, (ctx, W, H) => {
        icon.frame(ctx, W, H, !day ? COLORS.border : storm ? COLORS.warning : COLORS.nominal);
        icon.lightIcon(ctx, H * 0.5, H / 2, H * 0.32, day);
        icon.bar(ctx, H * 0.95, H * 0.36, W - H * 2.9, H * 0.28, solar / cfg.solarKw, storm ? COLORS.warning : '#ffcf66');
        icon.text(ctx, t('energy.solar.kw', { kw: fmt(solar, 2) }), W - H * 0.2, H / 2, { size: H * 0.42, bold: true, align: 'right', color: !day ? COLORS.dim : COLORS.text });
      });

      const sunDeg = day ? SolarTracker.sunAngle(clock.hourFloat) : null;
      const key = [mode, Math.round(tr?.angleDeg ?? 0), sunDeg === null ? 'n' : Math.round(sunDeg / 3), Math.round(align * 20), Math.round(dust * 20), msgKey].join('|');
      view.renderCustom(key, (ctx, W, H) => {
        icon.frame(ctx, W, H, mode === 'stow' ? COLORS.warning : COLORS.border);
        icon.text(ctx, t('energy.solar.title_short'), W * 0.05, H * 0.09, { size: H * 0.08, color: COLORS.title, bold: true });
        const pillColor = mode === 'auto' ? COLORS.nominal : mode === 'stow' ? COLORS.warning : COLORS.info;
        icon.tile(ctx, W * 0.64, H * 0.03, W * 0.32, H * 0.12, '#11161c', pillColor, 4);
        icon.text(ctx, t(`energy.solar.pill.${mode}`), W * 0.8, H * 0.09, { size: H * 0.065, color: pillColor, bold: true, align: 'center', maxWidth: W * 0.28 });
        icon.fieldTopView(ctx, W * 0.3, H * 0.6, H * 0.36, { panelDeg: tr?.angleDeg ?? 0, sunDeg, stowed: mode === 'stow' });
        const bx = W * 0.6;
        const bw = W * 0.35;
        icon.text(ctx, t('energy.solar.align'), bx, H * 0.27, { size: H * 0.06, color: COLORS.dim });
        icon.bar(ctx, bx, H * 0.32, bw, H * 0.07, day ? align : 0, align >= 0.8 ? COLORS.nominal : COLORS.warning);
        icon.text(ctx, t('energy.solar.dust'), bx, H * 0.49, { size: H * 0.06, color: COLORS.dim });
        icon.bar(ctx, bx, H * 0.54, bw, H * 0.07, dust, dust > 0.2 ? COLORS.warning : '#b5653a');
        icon.dustSpecks(ctx, bx, H * 0.54, bw * dust, H * 0.07, dust);
        icon.text(ctx, t(msgKey), W / 2, H * 0.9, { size: H * 0.075, color: msgColor, bold: true, align: 'center', maxWidth: W * 0.92 });
      });

      const off = !s.power.relayClosed;
      left.setState(t('solar.btn.left'), off ? BUTTON.off : BUTTON.action);
      right.setState(t('solar.btn.right'), off ? BUTTON.off : BUTTON.action);
      auto.setState(t('solar.btn.auto'), tr?.mode === 'auto' ? BUTTON.on : off ? BUTTON.off : BUTTON.action);
      stow.setState(t('solar.btn.stow'), tr?.mode === 'stow' ? BUTTON.warn : storm ? BUTTON.danger : BUTTON.off);
      clean.setState(t('solar.btn.clean'), dust < 0.01 || storm || off ? BUTTON.off : dust > 0.2 ? BUTTON.warn : BUTTON.action);

      // MARS-CLEANER update
      const cleaner = s.cleaner;
      const cStatus = cleaner?.status ?? 'docked';
      const cBattPct = Math.round(cleaner?.batteryPct ?? 100);
      const waitingStatus = s.phase === 'training' ? 'awaitTurn'
        : s.phase === 'playing' && s.time.speed === 0 ? 'awaitResume'
          : null;
      const roverMoving = ['traveling', 'cleaning', 'returning'].includes(cStatus);
      const shownStatus = waitingStatus && roverMoving
        ? waitingStatus
        : cStatus;
      const waitingHint = s.phase === 'training' ? 'cleaner.selection.start'
        : s.phase === 'playing' && s.time.speed === 0 ? 'cleaner.selection.resume'
          : null;

      panelButtons.forEach((btn, k) => {
        const isSel = selectedPanels.has(k);
        const isTarget = cleaner?.currentTargetIdx === k;
        const panelColor = isTarget ? COLORS.nominal : isSel ? BUTTON.action : BUTTON.off;
        btn.setState(`P${k + 1}`, panelColor);
      });

      const fullyCharged = cleaner?.batteryWh >= cleaner?.maxBatteryWh - 1e-3;
      const canDispatch = cStatus === 'ready' || (cStatus === 'docked' && fullyCharged);
      btnDispatch.setState(t('cleaner.btn.dispatch'), canDispatch && selectedPanels.size > 0 ? BUTTON.action : BUTTON.off);
      btnRecall.setState(t('cleaner.btn.return'), !cleaner?.isDocked && cStatus !== 'broken' ? BUTTON.warn : BUTTON.off);
      const canRecharge = !cleaner?.isDocked && cStatus !== 'broken' && cStatus !== 'returning';
      btnRecharge.setState(t('cleaner.btn.recharge'), canRecharge ? BUTTON.action : BUTTON.off);

      cleanerPanel.renderCustom(`${s.phase}|${s.time.speed}|${cStatus}|${cBattPct}|${selectedPanels.size}|${selectionAtCapacity}|${cleaner?.currentTargetIdx ?? -1}`, (ctx, W, H) => {
        icon.frame(ctx, W, H, cStatus === 'broken' ? COLORS.critical : COLORS.border);
        icon.text(ctx, 'MARS-CLEANER · MANTENIMIENTO', W * 0.04, H * 0.12, { size: H * 0.08, color: COLORS.title, bold: true });

        const statusCol = cStatus === 'broken' ? COLORS.critical
          : (waitingStatus && roverMoving) || cStatus === 'cleaning' ? COLORS.warning
            : COLORS.nominal;
        icon.tile(ctx, W * 0.58, H * 0.03, W * 0.38, H * 0.13, '#11161c', statusCol, 4);
        icon.text(ctx, t(`cleaner.status.${shownStatus}`), W * 0.77, H * 0.11, { size: H * 0.065, color: statusCol, bold: true, align: 'center', maxWidth: W * 0.36 });

        // Battery level
        icon.text(ctx, `Batería: ${cBattPct}%`, W * 0.05, H * 0.28, { size: H * 0.07, color: COLORS.text, bold: true });
        icon.bar(ctx, W * 0.38, H * 0.22, W * 0.56, H * 0.08, cBattPct / 100, cBattPct < 25 ? COLORS.critical : COLORS.nominal);

        // Selection info
        icon.text(ctx, t('cleaner.selection.count', { count: selectedPanels.size, max: maxPanelsPerTrip }), W * 0.05, H * 0.42, { size: H * 0.065, color: COLORS.dim });
        const selectionHint = waitingHint ?? (selectionAtCapacity ? 'cleaner.selection.limit' : 'cleaner.selection.hint');
        icon.text(ctx, t(selectionHint, { max: maxPanelsPerTrip }), W * 0.05, H * 0.54, {
          size: H * 0.06,
          color: waitingHint || selectionAtCapacity ? COLORS.warning : COLORS.text,
        });

        // Mini preview of the 12 panels (2 rows x 6 cols)
        const pw = W * 0.12;
        const ph = H * 0.14;
        for (let k = 0; k < 12; k++) {
          const row = Math.floor(k / 6);
          const col = k % 6;
          const px = W * 0.05 + col * (pw + W * 0.032);
          const py = H * 0.64 + row * (ph + H * 0.04);
          const isSel = selectedPanels.has(k);
          const isTarget = cleaner?.currentTargetIdx === k;
          ctx.fillStyle = isTarget ? '#22c55e' : isSel ? '#0284c7' : '#1f2937';
          ctx.fillRect(px, py, pw, ph);
          ctx.strokeStyle = isTarget ? '#86efac' : isSel ? '#38bdf8' : '#374151';
          ctx.lineWidth = 2;
          ctx.strokeRect(px, py, pw, ph);
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.round(H * 0.065)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(`P${k + 1}`, px + pw / 2, py + ph * 0.7);
        }
      });
    });
  },

  /** Breaker wall: one icon per circuit above its ON/OFF button, battery and power flow, relay reset. */
  breakers(g, _station, kit) {
    const { t, game, sim } = kit;
    const panelW = 1.7 * BIG;
    const panel = kit.addPanel(g, panelW, 0.5 * BIG, 0, 0.16 * BIG, SHARP);
    const spacing = 0.26 * BIG;
    const btns = CIRCUITS.map((id, i) =>
      kit.addButton(g, { width: 0.16 * BIG, height: 0.1 * BIG, label: '', onSelect: () => {
        game.intent('breaker:toggle', { circuitId: id, on: !sim().power.breakers[id] });
      } }, (i - 2.5) * spacing, -0.2 * BIG));
    const reset = kit.addButton(g, { width: 0.42 * BIG, height: 0.1 * BIG, label: t('ui.breakers.reset'), color: BUTTON.danger,
      onSelect: () => game.intent('relay:resetRequest') }, 0, -0.38 * BIG);
    addInfo(g, kit, {
      bx: 0.4 * BIG, by: -0.38 * BIG, px: 0, py: 0.12 * BIG, w: 1.7 * BIG, h: 0.8 * BIG,
      title: () => t('energy.info.breakers.title'),
      lines: () => {
        const s = sim();
        const p = s.power;
        const bal = s.balance;
        const batt = s.resources.get('power');
        return [
          { text: t('energy.info.breakers.1', { gen: fmt(p.generationKw, 2), rtg: p.cfg.rtgKw, use: fmt(p.servedLoadKw, 2), kwh: fmt(batt.value, 1), max: batt.max }), size: 0.8 },
          { text: t('energy.info.breakers.2', { limit: p.cfg.busLimitKw, trips: p.cfg.relayBurnTrips }), size: 0.8 },
          { text: t('energy.info.breakers.battery'), color: COLORS.info, size: 0.8 },
          { text: t('energy.info.breakers.3'), size: 0.8 },
          { text: t('energy.info.breakers.tradeoff'), color: COLORS.warning, size: 0.8 },
          ...p.order.map((/** @type {string} */ id, /** @type {number} */ i) => ({
            text: t('energy.info.breakers.circuit', {
              n: i + 1,
              name: t(`ui.circuit.${id}`),
              kw: id === 'lifeSupport'
                ? t('energy.info.breakers.ls_kw', { e: bal.lifeSupport.electrolyzerKw, s: bal.lifeSupport.scrubberKw })
                : `${String(bal.circuits[id].drawKw).replace('.', ',')} kW`,
            }),
            color: COLORS.info,
            size: 0.75,
          })),
          { text: t('energy.info.breakers.rtg'), size: 0.75 },
          { text: t('energy.info.general'), color: COLORS.dim, size: 0.65 },
        ];
      },
    });

    kit.onRefresh(() => {
      const s = sim();
      const p = s.power;
      const batt = s.resources.get('power');
      const states = CIRCUITS.map((id) => (!p.breakers[id] ? 'off' : p.served[id] ? 'on' : 'offline'));
      const overload = p.relayClosed && p.totalDemandKw > p.cfg.busLimitKw;
      /** @type {[string, string]} */
      const [msgKey, msgColor] = p.relayBurned ? ['energy.breakers.msg_burned', COLORS.critical]
        : !p.relayClosed ? ['energy.breakers.msg_tripped', COLORS.critical]
        : overload ? ['energy.breakers.msg_overload', COLORS.warning]
        : batt.status !== 'nominal' ? ['energy.breakers.msg_low', COLORS.warning]
        : states.includes('offline') ? ['energy.breakers.msg_dark', COLORS.warning]
        : ['energy.breakers.msg_ok', COLORS.nominal];
      const charge = batteryCharge(batt, t);
      const key = JSON.stringify([states, msgKey, Math.round(batt.value), charge.text]);
      panel.renderCustom(key, (ctx, W, H) => {
        icon.frame(ctx, W, H, p.relayClosed ? COLORS.border : COLORS.critical);
        icon.text(ctx, t('energy.breakers.title_short'), W * 0.02, H * 0.11, { size: H * 0.1, color: COLORS.title, bold: true });
        icon.battery(ctx, W * 0.36, H * 0.04, W * 0.14, H * 0.14, batt.value / batt.max, statusColor(batt.status));
        icon.text(ctx, `${Math.round(batt.value)} kWh`, W * 0.515, H * 0.11, { size: H * 0.085, color: statusColor(batt.status), bold: true });
        icon.text(ctx, charge.text, W * 0.98, H * 0.11, { size: H * 0.075, color: charge.color, bold: true, align: 'right', maxWidth: W * 0.34 });
        const colW = (spacing / panelW) * W;
        CIRCUITS.forEach((id, i) => {
          const x = W / 2 + (i - 2.5) * colW;
          const color = STATE_COLORS[/** @type {'on'} */ (states[i])];
          icon.tile(ctx, x - colW * 0.42, H * 0.25, colW * 0.84, H * 0.5, '#161d25', color, states[i] === 'off' ? 2 : 5);
          icon.circuitIcon(ctx, id, x, H * 0.43, H * 0.11, color);
          icon.text(ctx, t(`ui.circuit.${id}`), x, H * 0.65, { size: H * 0.075, align: 'center', maxWidth: colW * 0.8, color: states[i] === 'off' ? COLORS.dim : COLORS.text });
        });
        icon.text(ctx, t(msgKey), W / 2, H * 0.88, { size: H * 0.1, color: msgColor, bold: true, align: 'center', maxWidth: W * 0.95 });
      });
      btns.forEach((b, i) => {
        const st = states[i];
        b.setState(p.breakers[CIRCUITS[i]] ? 'ON' : 'OFF', st === 'on' ? BUTTON.on : st === 'off' ? BUTTON.off : BUTTON.warn);
      });
      reset.setState(t('ui.breakers.reset'), p.relayClosed ? BUTTON.off : BUTTON.danger);
    });
  },

  /** Air of the base: four dial gauges (O₂, CO₂, pressure, temperature) and the two machines that keep it. */
  ls_gauges(g, _station, kit) {
    const { t, sim } = kit;
    const panel = kit.addPanel(g, 0.95 * BIG, 0.72 * BIG, 0, 0, SHARP);
    const IDS = ['oxygen', 'co2', 'pressure', 'temperature'];
    addInfo(g, kit, {
      bx: 0, by: -0.43 * BIG, px: 0, py: 0.1 * BIG, w: 1.15 * BIG, h: 0.86 * BIG,
      title: () => t('energy.info.ls.title'),
      lines: () => {
        const s = sim();
        const c = s.balance.lifeSupport;
        return [
          ...IDS.map((id) => {
            const r = s.resources.get(id);
            return {
              text: t('energy.info.ls.value', { name: t(`ui.resource.${id}`), value: r.value.toFixed(id === 'temperature' ? 1 : 0), unit: r.unit, warn: r.warnAt, crit: r.criticalAt }),
              color: statusColor(r.status),
              size: 0.78,
            };
          }),
          { text: t('energy.info.ls.1', { o2: c.o2ProductionPerHour, water: c.electrolyzerWaterPerHour, use: c.o2ConsumptionPerHour }), size: 0.78 },
          { text: t('energy.info.ls.2', { co2: c.co2ProductionPerHour, scrub: c.co2ScrubPerHour }), size: 0.78 },
          { text: t('energy.info.ls.3'), size: 0.78 },
          { text: t('energy.info.general'), color: COLORS.dim, size: 0.65 },
        ];
      },
    });
    kit.onRefresh(() => {
      const s = sim();
      const ls = s.lifeSupport;
      const res = IDS.map((id) => s.resources.get(id));
      const worst = res.find((r) => r.status === 'critical') ?? res.find((r) => r.status === 'warning') ?? null;
      const [msgKey, msgColor] = !worst ? ['energy.ls.msg_ok', COLORS.nominal]
        : worst.status === 'critical' ? ['energy.ls.msg_crit', COLORS.critical] : ['energy.ls.msg_warn', COLORS.warning];
      const machine = (/** @type {boolean} */ running) => (running ? 'on' : s.power.served.lifeSupport ? 'idle' : 'off');
      const machines = [['electrolyzer', machine(ls.electrolyzerRunning)], ['scrubber', machine(ls.scrubberRunning)]];
      const key = JSON.stringify([res.map((r) => [Math.round(r.value * 2), r.status]), machines, msgKey]);
      panel.renderCustom(key, (ctx, W, H) => {
        icon.frame(ctx, W, H, worst ? statusColor(worst.status) : COLORS.border);
        icon.text(ctx, t('energy.ls.title_short'), W / 2, H * 0.08, { size: H * 0.08, color: COLORS.title, bold: true, align: 'center' });
        res.forEach((r, i) => {
          const cx = W * (0.14 + i * 0.24);
          icon.dial(ctx, cx, H * 0.37, W * 0.085, r);
          icon.text(ctx, t(`ui.resource.${IDS[i]}`), cx, H * 0.45, { size: H * 0.055, align: 'center', color: COLORS.dim, maxWidth: W * 0.22 });
          icon.text(ctx, `${fmt(r.value, IDS[i] === 'temperature' ? 1 : 0)} ${r.unit}`, cx, H * 0.53, { size: H * 0.065, align: 'center', bold: true, color: statusColor(r.status), maxWidth: W * 0.22 });
        });
        machines.forEach(([id, st], i) => {
          const x = W * (0.05 + i * 0.48);
          const color = st === 'on' ? COLORS.nominal : st === 'idle' ? COLORS.dim : COLORS.critical;
          icon.tile(ctx, x, H * 0.62, W * 0.42, H * 0.13, '#161d25', color, 3);
          if (id === 'electrolyzer') icon.drop(ctx, x + H * 0.08, H * 0.69, H * 0.07, color);
          else icon.circuitIcon(ctx, 'lifeSupport', x + H * 0.08, H * 0.685, H * 0.045, color);
          icon.text(ctx, t(`energy.ls.machine.${id}`), x + H * 0.15, H * 0.685, { size: H * 0.055, color, bold: st === 'on', maxWidth: W * 0.42 - H * 0.17 });
        });
        icon.text(ctx, t(msgKey, { name: worst ? t(`ui.resource.${IDS[res.indexOf(worst)]}`) : '' }), W / 2, H * 0.88, { size: H * 0.075, color: msgColor, bold: true, align: 'center', maxWidth: W * 0.92 });
      });
    });
  },

  /** CO₂ scrubber: filter cartridge that darkens as it is used, spare count and the swap button. */
  ls_scrubber(g, station, kit) {
    const { t, game, sim } = kit;
    kit.addBox(g, 0.8, station.y - 0.4, 0.5, 0, -0.4 - (station.y - 0.4) / 2 + 0.02, 0.28, '#4d6670');
    // Fan grille on the cabinet front: the screwdriver fixes it when the fan breaks (Repairs, D3).
    addRepairPoint(g, kit, { targetId: 'scrubber_fan', x: 0.18, y: -0.4 - (station.y - 0.4) / 2 + 0.02, z: 0.42, size: 0.3, labelY: -0.3 });
    const panel = kit.addPanel(g, 0.62, 0.36, 0, 0.13, SHARP);
    const swap = kit.addButton(g, { width: 0.3, height: 0.09, label: t('ui.ls.swap_filter'), color: BUTTON.action,
      onSelect: () => game.intent('filter:swap') }, -0.06, -0.16);
    addInfo(g, kit, {
      bx: 0.2, by: -0.16, px: 0, py: 0.2, w: 0.95, h: 0.6,
      title: () => t('energy.info.scrubber.title'),
      lines: () => {
        const s = sim();
        return [
          { text: t('energy.info.scrubber.1', { hours: s.balance.lifeSupport.filterLifeHours, left: fmt(s.lifeSupport.filterLifeHours), count: s.inventory.filters }), color: COLORS.info, size: 0.82 },
          { text: t('ui.ls.scrubber', { state: t(s.lifeSupport.scrubberRunning ? 'ui.state.running' : s.power.served.lifeSupport ? 'ui.state.idle' : 'ui.state.unpowered') }), size: 0.82 },
          { text: t('energy.info.scrubber.2'), size: 0.8 },
          { text: t('energy.info.scrubber.3', { crit: s.resources.get('co2').criticalAt }), size: 0.8 },
          { text: t('energy.info.general'), color: COLORS.dim, size: 0.65 },
        ];
      },
    });
    kit.onRefresh(() => {
      const s = sim();
      const ls = s.lifeSupport;
      const frac = ls.filterFraction;
      const pct = Math.round(frac * 100);
      const spares = s.inventory.filters;
      const powered = s.power.served.lifeSupport;
      const [msgKey, msgColor] = !powered ? ['energy.scrubber.msg_off', COLORS.critical]
        : pct <= 0 ? [spares ? 'energy.scrubber.msg_empty' : 'energy.scrubber.msg_none', COLORS.critical]
        : pct < 15 ? [spares ? 'energy.scrubber.msg_low' : 'energy.scrubber.msg_none', COLORS.warning]
        : ['energy.scrubber.msg_ok', COLORS.nominal];
      panel.renderCustom(`${pct}|${spares}|${msgKey}`, (ctx, W, H) => {
        icon.frame(ctx, W, H, msgColor === COLORS.nominal ? COLORS.border : msgColor);
        icon.text(ctx, t('energy.scrubber.title_short'), W * 0.05, H * 0.13, { size: H * 0.12, color: COLORS.title, bold: true });
        icon.filterCartridge(ctx, W * 0.17, H * 0.47, W * 0.22, frac);
        icon.bar(ctx, W * 0.32, H * 0.4, W * 0.36, H * 0.12, frac, pct < 15 ? COLORS.critical : COLORS.nominal);
        icon.text(ctx, `${pct} %`, W * 0.72, H * 0.46, { size: H * 0.13, bold: true });
        icon.text(ctx, t('energy.scrubber.spares'), W * 0.05, H * 0.68, { size: H * 0.09, color: COLORS.dim });
        for (let i = 0; i < Math.min(spares, 6); i++) icon.filterCartridge(ctx, W * (0.42 + i * 0.09), H * 0.68, W * 0.07, 1);
        if (!spares) icon.text(ctx, '0', W * 0.42, H * 0.68, { size: H * 0.1, color: COLORS.critical, bold: true });
        icon.text(ctx, t(msgKey), W / 2, H * 0.88, { size: H * 0.1, color: msgColor, bold: true, align: 'center', maxWidth: W * 0.92 });
      });
      swap.setState(t('ui.ls.swap_filter'), spares > 0 ? (pct < 15 ? BUTTON.warn : BUTTON.action) : BUTTON.off);
    });
  },

  /** Two emergency O₂ tanks (one-shot valves) next to the electrolyzer. */
  ls_o2tanks(g, station, kit) {
    const { t, game, sim } = kit;
    kit.addCylinder(g, 0.22, 1.5, -0.55, 0.75 - station.y, 0.3, '#5f87a8');
    kit.addCylinder(g, 0.22, 1.5, 0.55, 0.75 - station.y, 0.3, '#5f87a8');
    kit.addBox(g, 0.9, 1.0, 0.5, 1.4, 0.5 - station.y, 0.3, '#6b7a86'); // electrolyzer
    const panel = kit.addPanel(g, 0.66, 0.34, 0, 0.22, SHARP);
    const ids = ['valve_o2_tank_1', 'valve_o2_tank_2'];
    const btns = ids.map((valveId, i) =>
      kit.addButton(g, { width: 0.2, height: 0.09, label: '', onSelect: () => game.intent('valve:turn', { valveId, open: true }) }, i === 0 ? -0.2 : 0.04, -0.06));
    addInfo(g, kit, {
      bx: 0.24, by: -0.06, px: 0, py: 0.3, w: 0.9, h: 0.5,
      title: () => t('energy.info.o2.title'),
      lines: () => [
        { text: t('energy.info.o2.1', { boost: sim().balance.lifeSupport.o2TankBoost }), size: 0.85 },
        { text: t('energy.info.o2.2'), size: 0.85 },
      ],
    });
    kit.onRefresh(() => {
      const s = sim();
      const ls = s.lifeSupport;
      const used = ids.map((id) => Boolean(ls.o2TanksUsed[id]));
      const o2 = s.resources.get('oxygen');
      const [msgKey, msgColor] = used.every(Boolean) ? ['energy.o2.msg_empty', COLORS.dim]
        : o2.status !== 'nominal' ? ['energy.o2.msg_low', COLORS.critical] : ['energy.o2.msg_ready', COLORS.info];
      panel.renderCustom(`${used}|${msgKey}`, (ctx, W, H) => {
        icon.frame(ctx, W, H, msgColor === COLORS.critical ? COLORS.critical : COLORS.border);
        icon.text(ctx, t('energy.o2.title_short'), W / 2, H * 0.13, { size: H * 0.12, color: COLORS.title, bold: true, align: 'center' });
        used.forEach((u, i) => icon.tank(ctx, W * (0.36 + i * 0.28), H * 0.5, H * 0.42, !u));
        icon.text(ctx, t(msgKey), W / 2, H * 0.87, { size: H * 0.1, color: msgColor, bold: true, align: 'center', maxWidth: W * 0.92 });
      });
      btns.forEach((b, i) => {
        b.setState(used[i] ? t('energy.o2.btn.used') : t('energy.o2.btn.open', { n: i + 1 }), used[i] ? BUTTON.off : o2.status !== 'nominal' ? BUTTON.warn : BUTTON.action);
      });
    });
  },

  /** Thermostat: wanted vs current temperature as two thermometers, heater flame, − / + buttons. */
  ls_thermostat(g, _station, kit) {
    const { t, game, sim } = kit;
    const panel = kit.addPanel(g, 0.6, 0.4, 0, 0.14, SHARP);
    kit.addButton(g, { width: 0.1, height: 0.08, label: '−', color: BUTTON.action,
      onSelect: () => game.intent('thermostat:set', { setpointC: sim().lifeSupport.setpointC - 1 }) }, -0.2, -0.14);
    kit.addButton(g, { width: 0.1, height: 0.08, label: '+', color: BUTTON.action,
      onSelect: () => game.intent('thermostat:set', { setpointC: sim().lifeSupport.setpointC + 1 }) }, -0.06, -0.14);
    addInfo(g, kit, {
      bx: 0.16, by: -0.14, px: 0, py: 0.24, w: 0.95, h: 0.62,
      title: () => t('energy.info.thermo.title'),
      lines: () => {
        const b = sim().balance;
        return [
          { text: t('energy.info.thermo.1', { ext: b.thermal.externalC, ref: b.thermal.referenceC, loss: b.thermal.lossPerHourAtReference }), size: 0.82 },
          { text: t('energy.info.thermo.2', { kw: b.circuits.heating.drawKw, heat: b.thermal.heaterPerHour, min: b.thermal.setpointMin, cold: b.food.cold?.belowC ?? b.thermal.setpointMin }), size: 0.82 },
          { text: t('energy.info.thermo.3', { hyst: b.thermal.hysteresis }), size: 0.82 },
          { text: t('energy.info.general'), color: COLORS.dim, size: 0.65 },
        ];
      },
    });
    kit.onRefresh(() => {
      const s = sim();
      const ls = s.lifeSupport;
      const temp = s.resources.get('temperature');
      const th = s.balance.thermal;
      const lo = th.setpointMin - 6;
      const hi = th.setpointMax + 4;
      const lvl = (/** @type {number} */ v) => (v - lo) / (hi - lo);
      const [msgKey, msgColor] = !s.power.served.heating ? ['energy.thermo.msg_off', COLORS.critical]
        : temp.status !== 'nominal' ? ['energy.thermo.msg_cold', COLORS.critical]
        : ls.heaterRunning ? ['energy.thermo.msg_heating', COLORS.warning] : ['energy.thermo.msg_ok', COLORS.nominal];
      panel.renderCustom(`${ls.setpointC}|${fmt(temp.value)}|${msgKey}`, (ctx, W, H) => {
        icon.frame(ctx, W, H, msgColor === COLORS.critical ? COLORS.critical : COLORS.border);
        icon.text(ctx, t('energy.thermo.title_short'), W / 2, H * 0.1, { size: H * 0.1, color: COLORS.title, bold: true, align: 'center' });
        /** @param {number} cx @param {string} label @param {number} v @param {string} color */
        const col = (cx, label, v, color) => {
          icon.thermometer(ctx, cx - W * 0.1, H * 0.47, H * 0.42, lvl(v), color);
          icon.text(ctx, label, cx, H * 0.33, { size: H * 0.08, color: COLORS.dim });
          icon.text(ctx, `${fmt(v, Number.isInteger(v) ? 0 : 1)} °C`, cx, H * 0.48, { size: H * 0.12, bold: true, color });
        };
        col(W * 0.2, t('energy.thermo.want'), ls.setpointC, COLORS.info);
        col(W * 0.62, t('energy.thermo.now'), temp.value, statusColor(temp.status));
        if (ls.heaterRunning) icon.circuitIcon(ctx, 'heating', W * 0.9, H * 0.47, H * 0.08, COLORS.warning);
        icon.text(ctx, t(msgKey), W / 2, H * 0.86, { size: H * 0.1, color: msgColor, bold: true, align: 'center', maxWidth: W * 0.92 });
      });
    });
  },
};
