# Content Script — Marte VR Survival

> **Baseline (pre-implementation).** Player-facing text plan: comms script, tutorial texts and string key convention. Final strings live in `src/data/strings/es/*.json` (`common.json` + one file per room owner, see `docs/COLLABORATION.md`). Rules and timings come from `docs/SIMULATION_SPEC.md`; if they change, update this file in the same change.

---

## 1) Delivery

- **Comms are text only (D21):** shown on the telecom message screen/printer and on the main PC "Comms" page, with radio static + beep SFX. No voice in MVP.
- **Delivery depends on signal (spec §3.8):**
  - < 20 %: queued (link lost).
  - Storm forecast needs ≥ 30 %.
  - Failure warnings and CME alerts need ≥ 50 %.
  - A queued message is dropped if its incident has already triggered.
- **Hints** (`hint` event) appear on the panel nearest to the relevant control, never floating in the view.
- Tone: mission control in Spanish, calm and short (≤ 2 lines on the printer, ≤ 120 characters per line).

## 2) String key convention

`<domain>.<context>.<id>[.<variant>]`, lowercase, dots as separators, snake_case ids matching game ids. Interpolation with `{param}`.

| Domain | Use | Example |
| :-- | :-- | :-- |
| `ui` | Panel labels, buttons, units | `ui.panel.power.title`, `ui.button.start_shift` |
| `comms` | Mission control messages | `comms.incident.pump_thermal.warning` |
| `hint` | Contextual guidance | `hint.relay.reset` |
| `tutorial` | Training bench missions | `tutorial.t3.step2` |
| `alarm` | Alarm labels on panels | `alarm.co2.critical` |
| `summary` | Post-run screen | `summary.cause.suffocation` |
| `settings` | "Ajustes" panel | `settings.handedness.left` |

Variants for incidents: `warning`, `triggered`, `resolved`.

## 3) Comms script (baseline)

### 3.1 Daily briefing (06:00, `comms.daily.dN`)

| Key | Text |
| :-- | :-- |
| `comms.daily.d1` | "Buenos días, Ares Uno. Turno de 7 días iniciado. Revise el panel de energía y el filtro de CO₂." |
| `comms.daily.d2` | "Día 2. Recuerde: el cultivo está listo hoy. Si no se cosecha en 12 horas, se pierde." |
| `comms.daily.d3` | "Día 3. Actividad solar elevada esta semana: {flareCount} fulguraciones clase M registradas." |
| `comms.daily.d4` | "Día 4. Tormenta de polvo sobre la base. Priorice soporte vital y calefacción." |
| `comms.daily.d5` | "Día 5. La tormenta amaina esta tarde. Revise la alineación de la antena." |
| `comms.daily.d6` | "Día 6. Impacto de la CME previsto para mañana a las 12:00." |
| `comms.daily.d7` | "Día 7. Último turno. Mantenga la demanda por debajo de 2.0 kW a mediodía." |

The day 6 and 7 briefings mention the CME only if the day-4 alert was delivered; otherwise use the variant `comms.daily.dN.no_cme`.

### 3.2 Incidents

| Incident | `warning` | `triggered` | `resolved` |
| :-- | :-- | :-- | :-- |
| `hull_seal_corridor` / `hull_seal_telecom` | "Telemetría: microfisura probable en {location} en ~{hours} h." | "Pérdida de presión en {location}. Localícela por el sonido." | "Sello confirmado. Presión recuperándose." |
| `pump_thermal` | "Vibración anómala en la bomba térmica. Fallo probable en ~{hours} h." | "Bomba térmica averiada: calefacción al 50 %." | "Bomba térmica operativa." |
| `scrubber_fan` | "Ventilador del depurador degradado. Fallo en ~{hours} h." | "Depurador detenido. El CO₂ subirá." | "Depurador operativo." |
| `electrolyzer_cell` | "Celda del electrolizador fuera de tolerancia. Fallo en ~{hours} h." | "Electrolizador detenido. Sin producción de O₂." | "Producción de O₂ restablecida." |
| `valve_recycler` | "Presión irregular en el reciclador de agua." | "Válvula del reciclador atascada. Sin recuperación de agua." | "Reciclador liberado." |
| `antenna_motor` | "Motor de antena con sobrecorriente. Fallo en ~{hours} h." | "Motor de antena averiado. Señal limitada al 40 %." | "Motor de antena reparado." |
| `storm` | "Previsión: tormenta de polvo en {hours} h. Duración estimada 36 h." | "Tormenta activa: solar al 20 %, la antena se desalinea." | "Tormenta finalizada." |

### 3.3 Space weather (DONKI, spec §6.3)

Personal «Historial del Sol» is a local, presentation-only replay of `src/data/real/escenarios_nasa.json`. It starts calm, advances to moderate on mission day 3 and extreme on day 5; keys 1/2/3 select a scenario until the next automatic stage. The panel and Info sheet show cumulative events at the replay's UTC timestamp, the actual historical date and NASA CCMC DONKI attribution. This does not emit incidents or affect radiation simulation.

| Key | Text |
| :-- | :-- |
| `comms.space.cme.alert` | "Alerta: CME detectada a {speedKms} km/s. Distancia a Marte ≈ {distanceMkm} millones de km ⇒ llegada en ≈ {etaHours} h (día 7, 12:00)." |
| `comms.space.cme.reminder` | "Recordatorio: impacto de la CME en 24 h. Reduzca la demanda por debajo de 2.0 kW." |
| `comms.space.cme.impact` | "Impacto de la CME. Mástil solar desconectado 2 h por protección." |
| `comms.space.cme.honesty` | "Nota: en Marte el mayor riesgo de una tormenta solar es la radiación; el regolito protege esta base." |
| `comms.space.flare.blackout` | (shown after the link returns) "Fulguración clase M: apagón de radio de 2 h. Los mensajes en cola se han entregado." |
| `comms.space.ambient` | "Boletín DONKI: {cmeCount} CME y {flareCount} fulguraciones en 7 días; sin eventos de partículas (SEP)." |

### 3.4 Link status

| Key | Text |
| :-- | :-- |
| `comms.link.lost` | (shown on the telecom panel, not as a message) "SIN ENLACE — datos en cola" |
| `comms.link.restored` | "Enlace restablecido. {queued} mensajes recibidos." |

## 4) Training bench (spec §9.4)

| Key | Text |
| :-- | :-- |
| `tutorial.board.title` | "Banco de entrenamiento" |
| `tutorial.t1.title` | "T1 · Herramientas: coge la llave, enfúndala en la cadera y suéltala." |
| `tutorial.t2.title` | "T2 · Energía: apaga y enciende el breaker de práctica; rearma el relé." |
| `tutorial.t3.title` | "T3 · Consumibles: cambia el filtro de práctica." |
| `tutorial.t4.title` | "T4 · Fugas: sella la fuga de práctica con la pistola de sellado." |
| `tutorial.t5.title` | "T5 · Reparación: mantén el soldador sobre la placa; suelta y retoma." |
| `tutorial.done` | "Entrenamiento completado. Pulsa «Iniciar turno» en el ordenador central." |
| `ui.button.start_shift` | "Iniciar turno" |
| `ui.button.continue` | "Continuar" |

Each mission has `stepN` keys for multi-step hints (e.g. `tutorial.t3.step2` = "Encaja el filtro nuevo hasta oír el clic.").

## 5) Post-run summary

| Key | Text |
| :-- | :-- |
| `summary.won` | "Turno completado. Ares Uno sigue operativa." |
| `summary.cause.suffocation` | "Causa: asfixia." |
| `summary.cause.hypothermia` | "Causa: hipotermia." |
| `summary.cause.dehydration` | "Causa: deshidratación." |
| `summary.cause.starvation` | "Causa: inanición." |
| `summary.cause.powerLoss` | "Causa: pérdida total de energía." |
| `summary.cause.cascade` | "Causa: fallo en cascada irrecuperable." (planned: the cascade lose rule is not implemented yet) |
| `summary.decisions.title` | "Las 3 decisiones con más efecto" |

## 6) Pending
- The remaining `ui.*`, `alarm.*` and `settings.*` keys are written during implementation, following §2.
- Credits text: `docs/ASSET_REGISTRY.md` → "Attribution text".

## 7) Real-data panels (Person A)

| Keys | File | Content |
| :-- | :-- | :-- |
| `personal.dosimeter.*` | `strings/es/personal.json` | Dosimeter: rate, shift dose, ISS comparison, chart label, context, **source + "no en vivo"** |
| `personal.sun.*` | `strings/es/personal.json` | «Historial del Sol» (DONKI): historical date, four event counts, latest/next event, source, UTC time, and 1/2/3 scenario selection |
| `personal.health.*` | `strings/es/personal.json` | «Salud del astronauta» (OSDR): title, `where.<topic>`, one kid summary per study (`osd924`, `osd343`, `osd812`), source, `no_data` |
| `hydro.guide.*`, `real.crop.*` | `strings/es/hydro.json` | Crop guide (CSA + NASA NTRS: real days vs game hours, quinoa, spirulina), crop names |
| `hydro.tray.*`, `hydro.btn.*`, `hydro.hose.*`, `hydro.bio.*`, `ui.log.food_spoiled.overwatered` | `strings/es/hydro.json` | Tray panels (seed, growth, moisture, dry/flooded/dark warnings), buttons, hose instructions, bioreactor panel, rot log |
| `hub.elec.*`, `hint.elec.*`, `hub.comp.rx_psu` | `strings/es/hub.json` | Electronics bench: scope, supply quality, guided steps (`step.*`, `how.*`), feedback messages (`msg.*`), spare cards, Info sheet (`info.*`, `fact.*`), fault and repair hints |
| `comms.sep.*`, `hint.sep.*`, `personal.sep.*`, `personal.shelter.*` | `strings/es/common.json`, `personal.json` | Solar particle event: alert from Earth, shelter sign, storm dosimeter |
| `ui.telecom.earth_delay` / `in_transit` / `held` / `conjunction` / `rover_delay` | `strings/es/telecom.json` | Earth link panel (light-time delay, queue) |
| `ui.log.comms_sent`, `ui.log.link_*`, `ui.log.solar_*`, `solar.dust` | `strings/es/common.json`, `energy.json` | Log lines for delayed messages, link loss, panel cleaning; dust on the solar label |
| `solar.btn.*`, `solar.mode.*`, `solar.angle`, `solar.auto_cost`, `solar.dir.*`, `ui.log.solar_tracker.*`, `hint.solar.manual` | `strings/es/energy.json`, `common.json` | Manual left/right solar orientation and protection buttons, tracker status/logs, day-1 orientation hint |
| `rover.*` | `strings/es/control.json` | Rover console: screens, buttons, link/battery/mode/cargo, rejections, stops, sites, hints, NASA facts. `rover.photo.*` / `rover.cam.photo_title` / `rover.cam.latest_title`: real NASA image captions, credit line, gallery counter, «vista simulada» label |
| `solar.*`, `ui.circuit.repairBay` | `strings/es/energy.json` | «Campo solar» label under the Energía window; breaker «Taller · Rover» |
| `hub.ctrl.*` | `strings/es/hub.json` | «Prueba de mandos» panel: session line, per-hand buttons/stick/events, ray test button, legend of what each control does |
| `hub.sources.*` (incl. `hub.sources.use.<datasetId>`) | `strings/es/hub.json` | "Fuentes científicas" board; one `use` line per dataset in `src/data/real/` |

## 8) Hub tools (Person A)

| Keys | Content |
| :-- | :-- |
| `hub.tool.*` | Tool names (wrench, screwdriver, soldering iron, sealant gun) |
| `hub.comp.*` | Repairable components (spec §6.1) |
| `hub.toolwall.*`, `hub.spares.*`, `hub.status.*` | Tool wall, spares locker (sign, door panels, inside list `name.*`/`use.*`, electronics hint), component status board |
| `hub.t1.*` | Training mission T1 checklist |
