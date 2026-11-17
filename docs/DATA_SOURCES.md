# Data sources — Marte VR Survival

> Short explanation of the real datasets for the NASA Space Apps 2026 challenge "Build a Junior Astronaut Mission Trainer".
> In-game attribution: hub board «Fuentes científicas» + a source line on every panel that shows real data.
> Verified 2026-11-14.

## Honesty rule

Each panel identifies its source and the actual historical date. The game reads embedded snapshots only; it does not fetch NASA data during play. The DONKI scenario selector is a presentation replay and never drives simulation rules.

Real data never drives hidden game rules. Anything time-compressed or simplified (crop growth, CME effects) is labelled that way in-world.

## Datasets

| Dataset | Access | Where in the game | Why (trade-off it teaches) |
| :-- | :-- | :-- | :-- |
| **NASA CCMC DONKI** — CME, GST, SEP and FLR events, with UTC timestamps and event links. `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/` | Historical snapshots in `src/data/real/escenarios_nasa.json`. Calm: 2020-01-01 (0 events); moderate: 2024-01-01 (1 CME, 2 flares); extreme: 2024-05-10–12 (14 CME, 2 GST, 6 SEP, 38 flares, max Kp 9). Regenerate manually with `npm run data:escenarios`; never called by the game | Personal → «Historial del Sol». Automatically plays days 1–2 / 3–4 / 5–7; keys 1/2/3 select a scenario until the next automatic stage | Shows how event counts and Kp change over real historical UTC timestamps. It is explicitly visual and does not trigger a solar storm in the simulation |
| **NASA OSDR RadLab** — MSL RAD (Curiosity, Gale crater) + ISS DosTel, 24 h on 2023-01-01 | Snapshot (`npm run data:radlab`). The API has no CORS, so it can't be called from the Quest | Personal → dosimeter (rate, chart, shift dose, ISS comparison) | Mars surface vs ISS vs inside the base; why shelter matters |
| **NASA OSDR study search** — OSD-924 (muscle, SpaceX-16), OSD-343 (mitochondrial stress, SpaceX-12 + astronaut data), OSD-812 (human NK cells, simulated microgravity + radiation-relevant cells) | Snapshot of metadata (`npm run data:osdr`). CORS is limited to osdr.nasa.gov. Kid-level summaries hand-written in `strings/es/personal.json` from each study's description | Personal → «Salud del astronauta» (accession + link per study) | Spaceflight effects on the body explain why health, exercise and radiation protection are mission resources |
| **NASA NTRS — CELSS crops**: quinoa (Schlick & Bubenheim 1993, NASA TP-3422, https://ntrs.nasa.gov/citations/19940015664: protein 12–18 %) and spirulina (Tadros 1993 NASA-CR-194123, https://ntrs.nasa.gov/citations/19940009624: edible, evolves O₂; Tadros 1988 NASA-CR-185329: protein up to ≈70 %; Oguchi et al. 1987: food + gas exchange) | Curated by hand (`src/data/real/bioregen_crops.json`) | Hidroponía → crop guide + spirulina bioreactor | NASA chose some crops and algae for life support because they give protein **and** O₂ |
| **NASA Mars 2020 Perseverance — rover components** (https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/): top speed 152 m/h, MMRTG ≈ 110 W at launch, two Li-ion batteries, 43 sample tubes, 6 HazCams; landing in Jezero Crater on 2021-02-18 | Curated by hand (`src/data/real/perseverance.json`) | Sala de control → rover console (speed and MMRTG used in the simulation, facts line) | Driving a rover is slow and power-limited, and depends on the comms link |
| **NASA images for the rover NavCam**: PIA25218 (Ingenuity, backshell + parachute, 2022), PIA24690 (HiRISE map of Ingenuity flight 11 over Séítah, 2021), PIA24921 (Mastcam-Z panorama of the Jezero delta, 2022) + the latest Perseverance NAVCAM_LEFT frame (Mars 2020 raw-images API) | Snapshot (`npm run data:roverphotos` → `public/images/rover/`, `src/data/real/rover_photos.json`). Not live: the raw-images API blocks browser (CORS) requests | Sala de control → NAVCAM shows the real image at each site, and the latest real NavCam frame while docked | Every game site is a real place or object on Mars; the photo makes it tangible |
| **JPL Approximate Positions of the Planets** (Standish, Table 1, https://ssd.jpl.nasa.gov/planets/approx_pos.html): mean elements of Earth and Mars. Checked against **JPL Horizons** (2026-11-14: 1.324 au, 11.0 min) | Curated by hand (`src/data/real/orbits.json`); computed in the game (`src/systems/orbits.js`) | Telecom → distribution panel («Retraso hasta la Tierra: 11,0 min»), every mission message shows when it was sent | Why a Mars base cannot wait for Earth: a real 4–24 min delay, and none for the rover driven from the base |
| **NASA OSDR RadLab — solar particle event of 20 May 2024** (MSL RAD, 3 days: peak ≈ 304 µGy/h vs ≈ 3.8 background) + NASA news (8,100 µGy for a person beside the rover) + **NASA-STD-3001** limits via OCHMO-TB-020 Rev E (250 mSv per SPE, 600 mSv career, shelter ≈ 10 g/cm² water-equivalent) | Snapshot (`npm run data:radlab:sep`) | Personal → dosimeter turns into «TORMENTA SOLAR · VE AL REFUGIO»; water-tank shelter wall by the bunk | Warnings from Earth + shelter: the real hazard of the Sun on Mars is radiation |
| **Mars Pathfinder Materials Adherence Experiment** (Landis & Jenkins 2000, NASA Glenn): dust obscuration 0.28 %/sol | Curated (`src/data/real/solar_dust.json`) | Energía → «Polvo en los paneles», cleaning button; dirtier panels in the solar window | Dust slowly steals solar power; storms make it worse; cleaning costs energy |
| **CSA Food production toolkit** — crop growth times, crew diet range, plant habitats, O₂/CO₂ | Curated by hand (`src/data/real/csa_food.json`, URL per fact) | Hidroponía → crop guide + rack | Food is slow to grow; light and water compete with power |
| **NASA DONKI incident snapshot (Person B)** — one CME and two radio blackouts | Static (`docs/references/registro_nasa_donki.md`, planned `src/data/spaceWeather.json`) | Telecom/incidents (spec §6.3) | Separate planned simulation incident data; the Personal history replay does not feed it |

## Evaluated but not used

- **Mars Trek** (trek.nasa.gov): terrain and imagery. Suggested to Person B for the Telecom window view.
- **Mars Rover Photos API** (api.nasa.gov): discontinued, returns 404 "No such app".

## Refresh

```bash
npm run data:radlab -- 2023-01-01   # RadLab snapshot
npm run data:osdr                   # OSDR study metadata
npm run data:escenarios             # NASA CCMC DONKI historical replay data (manual refresh; no key)
```

Terms: NASA OSDR https://www.nasa.gov/reference/osdr-help-terms-and-conditions/ · CSA https://www.asc-csa.gc.ca/eng/terms.asp · NASA API data is public (credit NASA/CCMC). See `docs/ASSET_REGISTRY.md` for credits.
