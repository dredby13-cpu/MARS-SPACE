# Floor Plan — Marte VR Survival

> **Baseline (2026-11-14, v2: hub layout).** A hub-and-spokes underground base derived from the owner's sketch. It is the reference for the greybox (`docs/ASSET_CREATION_WORKFLOW.md` Stage 0/1) and for panel placement (`docs/SIMULATION_SPEC.md` §9.2).
> **Source of truth for coordinates:** `src/data/layout.json`. Walls, floors, collision, teleport and stations are all generated from it. If the layout changes, update that file, this document, the spec §9 and the `AGENT_CONTEXT.md` diagram in the same change.

---

## 1) Conventions

- Three.js axes: **+x = east, +y = up, −z = north**. 1 unit = 1 m. Origin at the centre of the hub, floor level.
- Dimensions are **interior**. Walls are 0.2 m thick, ceiling 2.6 m.
- Doors: 0.8 × 2.0 m clear opening, with a yellow frame. Hub openings to the north and south connectors: 1.8 × 2.3 m.
- The owner's sketch has diagonal corridors. They are built as straight L-shaped corridors with the **same connections**, because the engine handles 90° walls only.

## 2) Plan

```
                          (exterior: Mars, seen through the window)
   ┌────────[VENTANA]──┐                                   ┌──────────────────┐ z=-8.5
   │     TELECOM       │                                   │  SALA DE CONTROL │
   │      5 × 4        ├┤ ├═══════ north hall ════════┤ ├──┤      6 × 6       │
   │ (servidor W)      │          10 × 1.8 m              │ (spawn, PC, rover)│
   └───────────────────┘              ║                    └──────────────────┘ z=-2.5
 z=-7.5…-3.5                   north connector
                                     ║
 ┌──────────────────┐┌───────────────╨──────┐ z=-2.5
 │    PERSONAL      ├┤       HUB /          │
 │      5 × 4       ├┤    HERRAMIENTAS      │
 │ (crew, refugio)  ││      7.5 × 5         │
 └──────────────────┘└───────────────╥──────┘ z=2.5
 z=-2…2   (shared wall + door, no corridor)
                               south connector
   ┌──────────────────┐              ║                      ┌──────────────────┐ z=3.5
   │   HIDROPONÍA ·   ├┤ ├═══════ south hall ══════════┤ ├──┤  ENERGÍA Y       │
   │   AGRICULTURA    │           12 × 1.8 m                │  OXÍGENO  8 × 7  │
   │  5 × 6 (cocina)  │                                     │ [VENTANA solar E]│
   └──────────────────┘ z=5…11                              └──────────────────┘ z=10.5
   x=-10            x=-5     x=-0.9  x=0.9                  x=7               x=15

   ┤ ├ = door 0.8 m      ║ / ═ = corridor (1.8 m wide)      [VENTANA] = panoramic window
```

## 3) Areas

| Area (player name) | id | x | z | Size | Doors / openings |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Sala central · Herramientas (hub) | `room_hub` | −3 → 4.5 | −2.5 → 2.5 | 7.5 × 5 m (enlarged east, 2026-11-15) | N + S 1.8 m openings (x 0), W door (z 0) |
| Sala de control | `room_control` | 5 → 11 | −8.5 → −2.5 | 6 × 6 m | W door (z −5.5) |
| Telecomunicaciones | `room_telecom` | −10 → −5 | −7.5 → −3.5 | 5 × 4 m | E door (z −5.5); window on the N wall |
| Personal | `room_personal` | −8 → −3 | −2 → 2 | 5 × 4 m | E door (z 0) straight into the Sala central (shared wall x = −3, no corridor). Crew quarters, storm shelter and dosimeter |
| Hidroponía · Agricultura | `room_hydro` | −10 → −5 | 5 → 11 | 5 × 6 m | E door (z 6.9). South half (z 9–11) = kitchen |
| Energía y oxígeno | `room_energy` | 7 → 15 | 3.5 → 10.5 | 8 × 7 m | W door (z 6.9); rounded window on the E wall |
| North connector | `conn_north` | −0.9 → 0.9 | −4.6 → −2.5 | 1.8 × 2.1 m | — |
| North hall | `hall_north` | −5 → 5 | −6.4 → −4.6 | 10 × 1.8 m | opening to the connector (x 0) |
| South connector | `conn_south` | −0.9 → 0.9 | 2.5 → 6 | 1.8 × 3.5 m | — |
| South hall | `hall_south` | −5 → 7 | 6 → 7.8 | 12 × 1.8 m | opening to the connector (x 0) |

Corridor areas (`light: false`) have emissive ceiling fixtures and colour-coded conduits but no point light. The 6 rooms have one point light each (Quest light budget).

## 4) Panel placement

Panel centres at 1.2–1.5 m height.

| Room | Wall → elements |
| :-- | :-- |
| Sala de control | **N:** main PC (`main_pc`, x ≈ 6.8; monitoring + "Iniciar turno"/"Continuar"), time lever (`time_lever`, x ≈ 8.6) and disconnected rover vitals panel (`rover_vitals`, x ≈ 10.05; displays «sin datos»). **E**, centred opposite the entrance: rover map/NavCam console (`rover_console`, z ≈ −5.5) in a futuristic multi-monitor housing. **S:** bio panel (`bio_panel`, x ≈ 7.0). Settings panel and log terminal pending |
| Energía y oxígeno | Laid out as a flow. Every panel is a pictogram for young players (circuit icons, dial gauges, thermometers, tanks, filter, solar top view) with one short message and an «Info» button that opens the rigorous text with the numbers (`src/rooms/energy/energyIcons.js`, `src/ui/InfoSheet.js`). **N (distribution):** breaker wall (6 breakers + relay reset + battery charge line, `breakers`, x ≈ 10.4, 2.3 m wide) and O₂/CO₂/pressure/temperature gauges (`ls_gauges`, x ≈ 13.6, 1.3 m wide); both dashboards are drawn ×1.35 (`BIG` in `src/rooms/energy/stations.js`). **E (generation):** **rounded** window onto the solar field (z 5.6–8.4, sill 1.05 m, top 2.3 m, corner radius 0.6 m; `view: "solar"`); solar console under it (`energy_solar_view`, along 7) with buttons ◀ IZQUIERDA · DERECHA ▶ · AUTO · PROTEGER · LIMPIAR, production strip and «Campo solar» info panel. The battery level and charge status remain on the breaker dashboard. The field has 2 rows × 6 solar panels and an inverter; LIMPIAR shows the electrodynamic-shield wave through the window. The MARS-CLEANER status, panel selectors, information button and dispatch/return/«Recargar» controls are grouped on the wall beside the window, outside its viewing area. The player selects up to three panels and presses «Despachar»; four wheels carry the rover along visible service rails, it selects the shorter crossover between panel rows, sprays compressed air at each target, then returns to its dock to recharge from `repairBay`. «Recargar» can send it back early; once charged, «Despachar» starts another trip. During training or a time pause it waits for the turn clock to advance, which the digital status panel explains. **S (life support):** CO₂ scrubber (along 11.4) with filter socket; 2 emergency O₂ tanks + electrolyzer (along 9.1). **W (climate, by the door):** thermostat (z ≈ 8.4) |
| Hidroponía · Agricultura | **W:** soilless growing bench (`hydro_racks`): **4 white channels** with rockwool cubes, a water sight tube per channel (good zone in green), nutrient manifold + pump, **pink LED grow lights** overhead (lit only when the hydro lights are on), plants in 3 stages (sprout → young → mature), one **pictogram panel** per channel (crop icon, growth bar, water gauge, one short message) and one «Sembrar/Cosechar» button on the front lip; **seed kiosk** on the wall south of the bench («Semilla ▶», time/food dots). **N:** wall guide «¿Qué hago ahora?» (`hydro_cropguide`, x ≈ −9.05: 4 pictogram steps, the current one lit), water tank + **nutrient reservoir** («Nutrientes +», `hydro_water`, x ≈ −7.5), **hose reel** with a grabbable nozzle (`hydro_hose`, x ≈ −5.6). **S:** food processor (`hydro_processor`, x ≈ −8.9: machine with hopper and status lamp, pictogram panel, single «Hacer barra» button), rations + kcal (`hydro_food`, x ≈ −7.5), **spirulina bioreactor** (`hydro_bioreactor`, x ≈ −5.9). **Kitchen (south extension):** pantry cabinet with one crate per raw lot + freshness traffic-light panel + «Comer» (`hydro_pantry`, W wall, z ≈ 9.95); bar dispenser with the finished bars stacked in its tray (`hydro_bars`, E wall, z ≈ 9.7). Every station has an «Info» button that opens a text sheet with the rigorous explanation (NFT, pH/EC, photosynthesis, recipes, real crop data) |
| Telecomunicaciones | **N:** panoramic window (opening x −8.4…−6.6, y 1.1…2.1; 3D Mars diorama `src/world/Porthole.js`) with the operator console under it (signal/alignment panel and left/right antenna controls) and the antenna motor unit. **W:** communications distribution panel with uplink/signal status and data ports, replacing the former airlock hatch at the same station position |
| Sala central · Herramientas | **E:** training bench + mission board (`PANEL_TrainingBoard`, "Iniciar turno", live checklist for mission T1). **N:** "Fuentes científicas" board (`hub_sources`, real-data attribution, x ≈ −1.95) and «Prueba de mandos» controller diagnostics (`hub_controllers`, x ≈ 1.95: live per-hand buttons/axes, select/squeeze counters, ray test button). **S:** tool wall with 4 grabbable tools (`hub_toolwall`, x ≈ 1.95; each tool has an enlarged invisible grab zone) and the orange **spares locker** next to it (`hub_spares`, x ≈ 3.6: 1 × 1.9 × 0.5 m, two doors that swing open on a ray tap, lit shelves with the stock in 3D, the inside of the left door lists what each item is for, «REPUESTOS» sign above). The SW corner is left free for the electronics bench. **W:** component status board (`hub_status`, z ≈ −1.6) and **electronics bench** (`hub_electronics`, z ≈ 1.35: receiver board on the bench, oscilloscope + ESCANEAR button + step card + Info on the wall, spare cards on the bench) |
| Personal | Pictogram panels for young players, each with an «Info» button that opens the rigorous text with numbers and sources. **N:** «Tu cuerpo en el espacio» (`personal_health`, x ≈ −6.65): 3 picture cards from NASA OSDR studies, and «Historial del Sol» (`personal_spaceweather`, x ≈ −4.35): local NASA CCMC DONKI replay of CME/GST/SEP/FLR counts with historical UTC date; 1/2/3 choose a scenario, and the replay can progress by mission day (presentation only). **W** (facing the door): locker (`personal_locker`, z ≈ −1.45) and dosimeter (`personal_dosimeter`, z ≈ −0.2: current rate, Mars vs ISS bars, real 24 h record; becomes the «¡Tormenta solar!» alarm, with a shield that turns green inside the shelter). **S:** storm-shelter alcove (`personal_bunk`): bunk inside, water tanks on the back wall, both sides and the roof, «Refugio» sign on the lintel with the live state, and a floor pad (blue; pulsing red in a storm while you are outside; green inside). **Only the alcove protects** (spec §6.5) |

## 5) Teleport, spawn and flow

- **Spawn:** Sala de control, in front of the main PC at (6.8, −6.4), facing north (`layout.json` → `spawn`). The time lever is beside the PC; the training bench is in the Sala central (hub).
- Teleport works on any floor (`COL_Floor_*`, merged). There are no fixed anchors yet.
- Typical routes from the hub: Control ≈ 13 m, Telecom ≈ 11 m, Energy ≈ 14 m, Hydro ≈ 12 m, Personal ≈ 4 m (door straight from the hub).
- Keyboard collision (`src/vr/Collision.js`) uses the same walls, the door frames and the solid furniture, with door assist.

## 6) Alarm sources (positional, planned)

| Source | Position |
| :-- | :-- |
| Breaker wall / relay, life support resources, scrubber, electrolyzer | Energía y oxígeno |
| Water, crop, recycler | Hidroponía · Agricultura |
| Signal / link lost, antenna | Telecom console |
| Leaks | at the leaking seal (positions to be defined for the new layout) |
| Health | biomonitor (wrist) + bio panel in Control |
| Door beacons | above each door, mirroring the room's worst alarm |

## 7) Rendering

- Static geometry is merged by material: walls, floors, ceilings, door frames + conduits, and fixtures each take 1 draw call.
- Measured (desktop, `?debug`, 2026-11-14): 6–59 draw calls per view (budget < 150); 6 point lights + 1 hemisphere light.
