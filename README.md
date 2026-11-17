# Marte VR Survival

> **Prototipo v0.1** — simulación headless + greybox WebXR jugable de la base (sin assets finales).

A realistic, stationary **VR survival and management game** set in the first human outpost on Mars. You are the operator of an underground basement habitat: keep life support, power, food, water, telecom and electronics alive for **7 accelerated days** — and learn, by doing, that every engineering decision has a cost.

**Stack:** Three.js, Vite, WebXR y mitt (JavaScript + JSDoc, Vitest, Node 22) para **Meta Quest 3**. Se desarrolla en una **hackathon de 2 días: 14–15 de noviembre de 2026**.

---

## Estado

- **Actual (v0.1):**
  - Hecho: tiempo acelerado (4 ticks/s a 1×), red eléctrica con breakers, relé y tormenta, soporte vital con termostato, filtro y tanques de O₂, hidroponía con cosecha y putrefacción, salud, derrota por energía o salud y victoria en el día 7.
  - Escena: base en estrella con 6 salas contando la Sala central · Herramientas (5 a su alrededor), según [`docs/FLOOR_PLAN.md`](docs/FLOOR_PLAN.md). Tiene paneles diegéticos, ventana a Marte en Telecom y biomonitor en la muñeca.
  - Pendiente: CME y apagones de radio, derrota por cascada, reparaciones con herramientas (existen, pero la simulación aún no las usa), fugas, tutorial T2–T5, audio y guardado.
- **Objetivo MVP:** partida completa de 7 días acelerados con gestión de energía, soporte vital, comida/agua, telecomunicaciones y reparaciones; victoria al llegar al final del día 7 con vida; derrota por fallo de salud (asfixia, hipotermia, deshidratación o inanición), pérdida total de energía o cascada irrecuperable (esta última, planificada: aún no está implementada).
- **Idioma (objetivo):** texto de jugador en **español**; código y documentación en inglés.

Reglas numéricas: [`docs/SIMULATION_SPEC.md`](docs/SIMULATION_SPEC.md). Intención de diseño: [`docs/AGENT_CONTEXT.md`](docs/AGENT_CONTEXT.md).

## Quick start

Requisitos: Node ≥ 22 + npm. Para el visor: Meta Quest 3 en modo desarrollador y `adb`.

```bash
npm ci
npm run dev        # vite --host → http://localhost:5173
npm test           # simulación headless (Vitest)
npm run sim        # informe de balance: jugador inactivo / codicioso / competente
npm run build && npm run preview
```

### Menú inicial

Al abrir el juego sale un menú con el resumen de la misión (sobrevivir 7 días, unos 42 minutos a 1×, cómo se pierde y las crisis de los días 1, 2, 4 y 6) y dos opciones:

- **Realidad virtual:** entra con el visor Meta Quest o con la extensión [Meta Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik) (actívala en la página con su botón de la barra). Si el navegador no tiene ninguno, el menú lo dice y ofrece **«Usar emulador integrado (Quest 3)»**, que no necesita instalar nada.
- **Navegador:** ratón y teclado, sin VR.

Al salir de VR se vuelve al menú. En modo navegador, el botón **«Menú»** de la ayuda (arriba a la izquierda) también lo abre.

### Controles

| Dónde | Cómo |
| :-- | :-- |
| Quest 3 | Menú inicial → «Realidad virtual». Apunta con el rayo y aprieta el gatillo para pulsar botones o teletransportarte al suelo (aparece un aro azul). Stick: giro de 30°. Biomonitor en la muñeca izquierda |
| Teclado (escritorio **y** dentro de VR en el emulador) | **W/S** (o ↑/↓) avanzar/retroceder hacia donde miras · **A/D** lateral · **Q/E** (o ←/→) girar: continuo en escritorio, saltos de 30° en VR. No atraviesa paredes: solo cruza por las puertas |
| Ratón (solo escritorio, desarrollo) | Arrastra para mirar, clic para pulsar o teletransportarte. **G**: coger o soltar la herramienta bajo el cursor (mira hacia abajo y pulsa G para enfundarla en la cadera) |
| Agarre en VR | **Botón de agarre (grip)** del mando: coger o soltar herramientas. Suéltala junto al anillo de la cadera para enfundarla, o junto a su silueta en la pared para colgarla |

**Immersive Web Emulator:** haz clic una vez en la página para darle el foco al teclado; si no, las teclas van al panel del emulador. Los mandos se ven con el modelo real del Quest (se descarga de la CDN de WebXR input profiles; sin conexión aparece una caja gris).

**Sin extensión:** en el menú, «Realidad virtual» → «Usar emulador integrado (Quest 3)». Usa el runtime de emulación de Meta (IWER). También sirve `?iwer`, que lo instala al cargar.

Apareces en la **Sala de control**, frente al ordenador principal y los controles de tiempo, ambos en la pared norte. Pulsa «Iniciar turno» para empezar. En la misma sala están el biomonitor (pared sur), la consola del rover (mapa y conducción, pared este) y un panel de telemetría del rover, con datos de la simulación y datos reales de Perseverance (pared norte). **Personal** es la habitación de la tripulación y el refugio contra la radiación. Los breakers y el relé están en **Energía y oxígeno** (al sur, pasando por la Sala central). A las 09:00 del día 1 salta el relé: rearma desde allí.

Parámetros de desarrollo (combinables con `&`):
- `?view=x,z,grados`: coloca al jugador.
- `?ff=ticks`: adelanta la simulación al iniciar turno (p. ej. `?ff=545` llega a la derrota por energía del jugador inactivo).
- `?iwer`: activa el Quest 3 emulado sin extensión.
- `?mode=browser`: salta el menú inicial y entra en modo navegador (también lo salta `?view=`).
- `?debug`: expone `window.__marte` para inspeccionar desde la consola.

### Datos reales (NASA / CSA)

El juego usa datos reales **embebidos como registros con fecha**; durante la partida no consulta ninguna API. El historial de NASA DONKI cambia con el reloj del juego: calmado (01/01/2020), moderado (01/01/2024) y extremo (10–12/05/2024). Avanza automáticamente en los días 1–2, 3–4 y 5–7; las teclas **1/2/3** permiten elegir otro escenario hasta la siguiente etapa. Esta reproducción es visual y no altera la simulación. Detalle: `docs/DATA_SOURCES.md`; las fuentes se listan dentro del juego en «Fuentes científicas».

| Datos | Fuente | Dónde se ven | Cómo actualizar |
| :-- | :-- | :-- | :-- |
| Radiación en la superficie de Marte (MSL RAD, Curiosity) e ISS, 24 h del 01/01/2023 | [NASA OSDR RadLab](https://visualization.osdr.nasa.gov/radlab/gui/data-api/) | Dosímetro (Personal) | `npm run data:radlab -- AAAA-MM-DD` |
| Historial espacial: 3 escenarios DONKI con CME, GST, SEP y llamaradas | [NASA CCMC DONKI](https://ccmc.gsfc.nasa.gov/DONKI/) | «Historial del Sol» (Personal), reproducción local con fecha UTC | `npm run data:escenarios` (descarga manual; no se ejecuta durante la partida) |
| Estudios reales de salud en el espacio (OSD-924, OSD-343, OSD-812) | [NASA OSDR](https://osdr.nasa.gov/bio/repo/) | «Salud del astronauta» (Personal) | `npm run data:osdr` |
| Distancia real Tierra–Marte y retraso de los mensajes (11 min al inicio) | [JPL Approximate Positions](https://ssd.jpl.nasa.gov/planets/approx_pos.html), comprobado con JPL Horizons | Telecom (distribuidor de red) y registro de mensajes | a mano (`orbits.json`) |
| Tormenta solar real del 20/05/2024 (Curiosity RAD) y límites de radiación NASA-STD-3001 | [NASA OSDR RadLab](https://visualization.osdr.nasa.gov/radlab/) | Dosímetro y refugio (Personal) | `npm run data:radlab:sep` |
| Polvo en paneles solares: 0,28 % por sol (Mars Pathfinder) | [NASA NTRS](https://ntrs.nasa.gov/citations/20020031145) | Energía (polvo y limpieza) | a mano (`solar_dust.json`) |
| Fotos reales: escudo trasero y paracaídas (Ingenuity), Séítah (HiRISE), delta de Jezero (Mastcam-Z), última NavCam | [NASA Photojournal](https://science.nasa.gov/photojournal/) + API de imágenes de Mars 2020 | NAVCAM del rover (Sala de control) | `npm run data:roverphotos` |
| Rover Perseverance: velocidad 152 m/h, MMRTG ≈ 110 W, 43 tubos | [NASA Mars 2020](https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/) | Consola del rover (Sala de control) | Editar `src/data/real/perseverance.json` |
| Quinua y espirulina para soporte vital (CELSS): proteína, O₂ | [NASA NTRS](https://ntrs.nasa.gov/citations/19940015664) | Guía de cultivos y biorreactor (Hidroponía) | Editar `src/data/real/bioregen_crops.json` |
| Ciclos de cultivo, dieta de la tripulación, hábitats de plantas | [CSA – Food production](https://www.asc-csa.gc.ca/eng/youth-educators/toolkits/food-production/) | Guía de cultivos y bastidor (Hidroponía) | Editar `src/data/real/csa_food.json` |

Los paneles leen los archivos JSON locales. El comando `npm run data:escenarios` solo consulta DONKI cuando se ejecuta manualmente para regenerar el conjunto; el runtime WebXR no realiza peticiones ni requiere una clave API.

### Testing en Quest 3

WebXR requiere **contexto seguro**. Opciones típicas:

1. **ADB reverse (recomendado):** `adb reverse tcp:<puerto> tcp:<puerto>` y abrir `http://localhost:<puerto>` en Quest Browser.
2. **HTTPS tunnel** o **build desplegado en HTTPS**.
3. **Desktop:** Chrome + [Immersive Web Emulator](https://github.com/meta-quest/immersive-web-emulator) para iteración rápida (no sustituye pruebas en headset).

Comprobar `navigator.xr.isSessionSupported('immersive-vr')` antes de mostrar el botón de entrar en VR.

## Visión de juego (objetivo)

| Sistema | Rol |
| :-- | :-- |
| Red eléctrica | Alimenta todo; breakers permiten redirigir/sacrificar circuitos |
| Soporte vital | O₂/CO₂, temperatura, presión |
| Comida y agua | Presión a medio/largo plazo; difícil de recuperar |
| Telecomunicaciones | Avisos tempranos y feedback de estado; sin alineación de antena no se transmiten datos |
| Electrónica (Sala central · Herramientas) | Repuestos, reparaciones y banco de entrenamiento (tutorial) |
| Clima espacial | CME y fulguraciones basadas en datos reales de NASA DONKI (snapshot estático) |

## Estructura del repositorio

- `src/core/` — arranque/motor/composición (planificado)
- `src/systems/` — simulación headless y propiedad del estado (planificado)
- `src/vr/`, `src/world/`, `src/objects/`, `src/ui/` — presentación e interacción (planificado)
- `src/data/` — balance, recursos, componentes, eventos, strings, gráficos (planificado)
- `src/types/` — contratos compartidos en JSDoc (planificado)
- `docs/` — documentación de diseño e ingeniería
- `tests/` — pruebas headless (planificado)

## Documentación

| Documento | Contenido |
| :-- | :-- |
| [`AGENTS.md`](AGENTS.md) | Contratos/reglas para agentes: arquitectura, eventos, save, presupuestos (baseline) |
| [`docs/AGENT_CONTEXT.md`](docs/AGENT_CONTEXT.md) | Contexto de diseño, sistemas, riesgos |
| [`docs/SIMULATION_SPEC.md`](docs/SIMULATION_SPEC.md) | Especificación numérica de simulación (implementada en parte; cada sección indica su estado) |
| [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) | Flujo de desarrollo, pruebas y profiling (objetivo) |
| [`docs/ASSET_CREATION_WORKFLOW.md`](docs/ASSET_CREATION_WORKFLOW.md) | Pipeline de assets y validación VR (objetivo) |
| [`docs/ASSET_REGISTRY.md`](docs/ASSET_REGISTRY.md) | Registro de assets/licencias y fuentes de datos |
| [`docs/CONTENT_SCRIPT.md`](docs/CONTENT_SCRIPT.md) | Guion de comms, tutorial y claves de strings |
| [`docs/FLOOR_PLAN.md`](docs/FLOOR_PLAN.md) | Plano acotado de la base (salas, paneles, teleport) |
| [`docs/COLLABORATION.md`](docs/COLLABORATION.md) | **Trabajo en equipo:** quién edita qué sala/archivo y flujo de ramas en GitHub |
| [`docs/references/registro_nasa_donki.md`](docs/references/registro_nasa_donki.md) | Snapshot NASA DONKI usado para el clima espacial |
| [`docs/project-context.json`](docs/project-context.json) | Resumen machine-readable |
| [`llms.txt`](llms.txt) | Mapa compacto para LLMs |

## Objetivos de rendimiento (Quest 3, presupuesto conservador)

72 Hz (60 mínimo) · <150 draw calls · 500k–1M tris · texturas optimizadas · iluminación mayormente bakeada · sin cadena de post-procesado por defecto. Verificar en hardware cuando exista implementación.

## Licencia

TBD. Registrar licencias y atribuciones de cualquier asset de terceros en [`docs/ASSET_REGISTRY.md`](docs/ASSET_REGISTRY.md) antes de incluirlo.

