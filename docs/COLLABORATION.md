# Colaboración — Marte VR Survival (2 personas)

> **Léelo antes de tu primer commit.** Define quién es dueño de cada archivo, cómo usar ramas en GitHub y cómo evitar conflictos.
> Lo hacen cumplir `.github/CODEOWNERS` (GitHub pide revisión al dueño) y `tests/data.test.js`, que falla si dos archivos definen la misma clave.

---

## 1) Reparto por salas

| Persona | Salas | GitHub |
| :-- | :-- | :-- |
| **Persona A** | Personal · Hidroponía · Agricultura · Sala central · Herramientas (hub) | @Broccoli176 |
| **Persona B** | Telecom / Esclusa · Sala de control · Energía y oxígeno | @dredby13-cpu |

Plano y coordenadas de las salas: `docs/FLOOR_PLAN.md`.

## 2) Qué archivos son de cada uno

| Tipo | Persona A (Personal · Hidro · Central) | Persona B (Telecom · Control · Energía) |
| :-- | :-- | :-- |
| Estaciones (3D + paneles + botones) | `src/rooms/personal/`, `src/rooms/hydro/`, `src/rooms/hub/` | `src/rooms/telecom/`, `src/rooms/control/`, `src/rooms/energy/`, `src/world/Porthole.js` |
| Colocación de estaciones | `src/data/stations/{personal,hydro,hub}.json` | `src/data/stations/{telecom,control,energy}.json` |
| Textos (español) | `src/data/strings/es/{personal,hydro,hub}.json` | `src/data/strings/es/{telecom,control,energy}.json` |
| Números de balance | `src/data/balance/hydro.json` (comida, agua) | `src/data/balance/{energy,telecom}.json` (energía, circuitos, soporte vital, térmica, telecom) |
| Sistemas de simulación | `src/systems/Food.js`, `src/systems/Kitchen.js` (+ futuros de Personal / entrenamiento) | `src/systems/{PowerGrid,LifeSupport,Telecom}.js` |
| Datos reales (NASA/CSA) | `src/data/real/{radlab,csa_food,osdr_health,escenarios_nasa}.json`, `scripts/fetch-{radlab,osdr,nasa-scenarios}.js`, `src/systems/Radiation.js`, `src/rooms/personal/spaceWeatherLive.js` (reproductor local) | (futuro) `src/data/spaceWeather.json` (DONKI para incidentes). El panel DONKI de Personal usa solo escenarios históricos locales y nunca consulta la red durante el juego. Sugerencia: Mars Trek para la ventana de Telecom |
| Herramientas (Sala central) | `src/rooms/hub/{tools,toolRules,controllerDiag,electronics,electronicsRules}.js`, `src/systems/Electronics.js`, `src/data/balance/hub.json` (herramientas + tabla de componentes §6.1) | Fase 2 (reparar componentes de sus salas): coordinar. Se acerca la herramienta a un componente y se mantiene; necesita el sistema Electronics y `repair:*` |
| Tests | `tests/hydro.test.js`, `tests/hydroRules.test.js`, `tests/kitchen.test.js`, `tests/electronics.test.js`, `tests/electronicsRules.test.js`, `tests/radiation.test.js`, `tests/shelter.test.js`, `tests/tools.test.js`, `tests/spaceweather.test.js`, `tests/controllers.test.js` | `tests/power.test.js`, `tests/telecom.test.js`, `tests/dust.test.js`, `tests/tracker.test.js`, `tests/solarField.test.js`, `tests/energySolarDesk.test.js`, `tests/rover*.test.js`. Shared: `tests/tradeoffs.test.js` |

> **Nota (14/11/2026):** a petición del usuario, Persona A hizo la ventana del campo solar en Energía (`src/world/SolarField.js`, `energy_solar_view`) y la consola del rover en la Sala de control (`src/rooms/control/rover.js`, `src/systems/Rover.js`, `src/data/balance/rover.json`). Persona B revisa el PR.

> **Trabaja solo en tus archivos.** Si necesitas algo en un archivo del otro, pídeselo por chat o abre un PR pequeño y espera su revisión.

### Archivos COMPARTIDOS (tocar solo con PR pequeño y aviso previo)

- **Código base:** `src/core/`, `src/vr/` (incluye `Grab.js` y `Holsters.js`: agarre, fundas del cinturón (botón B/Y → `holsters.onBelt`, registrado por las herramientas del hub) y «usar lo que sostienes» con `onUse`, usados por todas las salas), `src/utils/`, `src/objects/`.
- **Mundo e interfaz:** `src/world/Basement.js`, `src/world/textures.js`, `src/ui/Panel.js`, `src/ui/StationKit.js` (`services` = { scene, grab, holsters, floors, renderer }), `src/ui/Stations.js`.
- **Sistemas centrales:** `src/systems/{Simulation,TimeManager,ResourceManager,Crew,IncidentRunner,GameState}.js`.
- **Datos comunes:**
  - `src/data/layout.json` (paredes, salas, carteles, punto de aparición)
  - `resources.json`, `events.json`
  - `balance/core.json`, `strings/es/common.json`
  - `src/data/index.js`, `src/data/merge.js`
- **Tests y scripts:** `tests/helpers/`, `tests/{rules,time,collision,data}.test.js`, `scripts/`.
- **Configuración y documentación:** `package.json`, `package-lock.json`, `vite.config.js`, `docs/`, `AGENTS.md`, `README.md`.

Reglas para lo compartido:
1. Avisa por chat **antes** («voy a tocar `layout.json` para mover la puerta de Hidroponía»).
2. Haz un PR **solo** con ese cambio. Prefijo `chore:` (herramientas o estructura) o `contract:` (eventos, guardado o datos que el otro usa).
3. Se fusiona primero; el otro hace `git pull --rebase` enseguida.

## 3) Flujo de ramas en GitHub (ramas cortas desde `main`)

`main` **siempre funciona**: tests y build en verde. Nadie trabaja directamente en `main`.

### Configuración inicial (una vez)

```bash
git clone https://github.com/Broccoli176/Mars-sector-XR.git
cd Mars-sector-XR
npm ci                          # instala TODO (incluido iwer). Si el build falla por un paquete, es esto
git config pull.rebase true
git config rebase.autoStash true
```

### Ciclo de cada tarea

```bash
git switch main
git pull                                  # main al día
git switch -c <usuario>/<tarea>           # p. ej. broccoli/hidro-riego  ·  dred/telecom-cola-mensajes
# ... trabajar SOLO en tus archivos ...
npm test && npm run build                 # ambos en verde antes de subir
git add <tus archivos>
git commit -m "feat(hidro): riego automático"
git push -u origin <usuario>/<tarea>
```

Después, en GitHub:
1. Abre un **Pull Request** hacia `main` usando la plantilla.
2. Fusiona con **Squash and merge** cuando esté en verde. Si tocó algo compartido, espera la revisión del otro.
3. Borra la rama.

- **Frecuencia:** un PR cada 1–2 h. Las ramas viejas acumulan conflictos.
- **Si el otro fusionó algo mientras trabajabas:**
  ```bash
  git fetch origin
  git rebase origin/main          # en tu rama
  npm test
  git push --force-with-lease     # solo en TU rama, nunca en main
  ```
- **Mensajes de commit:** `feat(sala): …`, `fix(sala): …`, `chore: …`, `docs: …`, `test: …`.
- **Nunca:** `git push --force` a `main`, ni commitear `node_modules/` o `dist/`.

## 4) Recetas

**Añadir una estación a tu sala**
1. En `src/data/stations/<tu-sala>.json`, añade `{ "id": "mi_estacion", "room": "room_<sala>", "wall": "north|south|east|west", "along": <coordenada>, "y": <altura> }`. Las coordenadas de cada muro están en `docs/FLOOR_PLAN.md` §3.
2. En `src/rooms/<tu-sala>/stations.js`, añade `mi_estacion(g, station, kit) { … }` dentro de `builders`. Usa `kit.addPanel`, `kit.addButton`, `kit.addBox`, `kit.onRefresh`. Ejemplo pequeño: `src/rooms/hub/stations.js`.
3. Solo **lee** la simulación (`kit.sim()`) y **emite intents** (`kit.game.intent('evento', {...})`). No modifiques el estado de la simulación desde la presentación (`AGENTS.md` §3).

**Añadir textos**
- Ponlos en `src/data/strings/es/<tu-sala>.json` con prefijo propio (`ui.hydro.*`, `ui.telecom.*`, …). Si la clave ya existe en otro archivo, `npm test` falla y te dice dónde.

**Añadir números de balance**
- Van en tu `src/data/balance/<archivo>.json`, siguiendo `docs/SIMULATION_SPEC.md`. Nada de números mágicos en el código.

**Nueva sala o pared**
- Es geometría compartida (`layout.json`). Aplica las reglas de la §2.

**Añadir un conjunto de datos reales**
- Va en `src/data/real/<id>.json` con un objeto `source` que tenga `institution`, `product`, `url` y `retrievedAt` (AAAA-MM-DD).
- Añade el texto `hub.sources.use.<id>` en `strings/es/hub.json` (lo pide Persona A, dueña del hub). Aparecerá solo en el panel «Fuentes científicas». `npm test` comprueba la atribución.
- Nunca lo presentes como «en vivo» si es un registro.

**Resolver un conflicto**
```bash
git status                        # ver archivos en conflicto
# editar, quitar <<<<<<< ======= >>>>>>> conservando lo de los dos
npm test && npm run build
git add <archivo> && git rebase --continue
```
Si no está claro qué conservar, pregunta al otro antes de decidir.

## 5) Lecciones aprendidas (no repetir)

- **No sacar dependencias del bundle para que compile.** Por ejemplo, `external: ['iwer']` en `vite.config.js` rompió `?iwer`. Si un paquete «no se encuentra», ejecuta `npm ci`.
- **No basar el trabajo en un `main` viejo.** Haz `git pull` antes de crear la rama: un cambio sobre código antiguo puede fusionarse «sin conflicto» y aun así romper el juego.
- **Respetar la spec:** valores de `docs/SIMULATION_SPEC.md` en `balance/`, y no inventar otros en el código.
- **Presupuesto Quest:** nada de luces dinámicas nuevas ni post-procesado, y piezas repetidas instanciadas o fusionadas (`AGENTS.md` §7). Mide los draw calls con `?debug` (`window.__marte.renderer.info.render.calls`).

## 6) Antes de empezar en paralelo

1. Persona A sube a `main` el estado actual (gráficos, colisión, integración de Telecom, nuevo plano y esta división).
2. Persona B hace `git pull` y `npm ci`.
3. Desde ahí, cada uno en su rama según la §3.
