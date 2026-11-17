import * as THREE from 'three';

/**
 * Procedural canvas textures (generated once, shared). Simple industrial greybox style:
 * panel seams, rivets, baseboard and light grime — no image assets to license or download.
 * Sizes stay small (≤ 512 px) for Quest GPU memory (AGENTS.md §7).
 */

/** Deterministic tiny PRNG so textures look identical every load. @param {number} seed */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** @param {number} w @param {number} h @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw */
function canvasTexture(w, h, draw, { repeat = true } = {}) {
  if (typeof document === 'undefined') return new THREE.Texture();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Subtle noise speckles. */
function speckle(ctx, w, h, count, alpha, seed) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const v = Math.floor(r() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

function rivet(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(x + 1, y + 1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Wall panel: u spans one 2 m panel horizontally, v spans the full wall height (floor → ceiling).
 * Baseboard, mid seam, cornice shadow and grime near the floor.
 */
export function createWallTexture() {
  return canvasTexture(256, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#8a9097');
    g.addColorStop(0.75, '#7d838a');
    g.addColorStop(1, '#646a70');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 1400, 0.12, 7);

    // Cornice shadow under the ceiling
    const top = ctx.createLinearGradient(0, 0, 0, h * 0.06);
    top.addColorStop(0, 'rgba(0,0,0,0.35)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, h * 0.06);

    // Panel seams (vertical at the panel edges, horizontal at ~1.3 m and ~2.2 m)
    ctx.fillStyle = 'rgba(30,34,38,0.55)';
    ctx.fillRect(0, 0, 3, h);
    ctx.fillRect(w - 2, 0, 2, h);
    for (const t of [0.15, 0.5]) ctx.fillRect(0, h * t, w, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(3, 0, 2, h);
    for (const t of [0.15, 0.5]) ctx.fillRect(0, h * t + 3, w, 2);

    // Rivets along the seams
    for (const t of [0.15, 0.5]) for (let x = 20; x < w; x += 54) rivet(ctx, x, h * t - 7, 2);

    // Baseboard (bottom ~0.12 m) with hazard tint
    const base = h * (1 - 0.12 / 2.6);
    ctx.fillStyle = '#3b4046';
    ctx.fillRect(0, base, w, h - base);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, base, w, 2);

    // Grime gradient above the baseboard
    const grime = ctx.createLinearGradient(0, base - h * 0.12, 0, base);
    grime.addColorStop(0, 'rgba(60,45,35,0)');
    grime.addColorStop(1, 'rgba(60,45,35,0.25)');
    ctx.fillStyle = grime;
    ctx.fillRect(0, base - h * 0.12, w, h * 0.12);
  });
}

/** Floor plate: one texture tile = 2 m, with 1 m plates and anti-slip dots. Light grey, tinted per room. */
export function createFloorTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e2e5e8';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 1600, 0.15, 11);
    const half = w / 2;
    // Diamond-plate dots
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 6; y < h; y += 12) for (let x = (y / 12) % 2 ? 6 : 12; x < w; x += 12) ctx.fillRect(x, y, 4, 2);
    // Plate seams
    ctx.fillStyle = 'rgba(20,22,25,0.55)';
    for (const p of [0, half]) {
      ctx.fillRect(p, 0, 3, h);
      ctx.fillRect(0, p, w, 3);
    }
    for (const [x, y] of [[10, 10], [half - 10, 10], [10, half - 10], [half - 10, half - 10]]) {
      for (const [ox, oy] of [[0, 0], [half, 0], [0, half], [half, half]]) rivet(ctx, x + ox, y + oy, 2);
    }
  });
}

/** Ceiling: acoustic panels with a grid. One tile = 2 m. */
export function createCeilingTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c3c8cd';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 2400, 0.18, 23);
    ctx.fillStyle = 'rgba(40,44,48,0.6)';
    for (const p of [0, w / 2]) {
      ctx.fillRect(p, 0, 4, h);
      ctx.fillRect(0, p, w, 4);
    }
  });
}

/** Generic machinery skin for props (box default UVs: one copy per face). */
export function createMachineTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d4d8dc';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 900, 0.14, 31);
    ctx.strokeStyle = 'rgba(30,34,38,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    // Vent grille
    ctx.fillStyle = 'rgba(25,28,31,0.55)';
    for (let y = h * 0.62; y < h * 0.86; y += 10) ctx.fillRect(w * 0.18, y, w * 0.64, 5);
    // Label plate
    ctx.fillStyle = 'rgba(255,207,102,0.85)';
    ctx.fillRect(w * 0.18, h * 0.18, w * 0.3, h * 0.08);
    for (const [x, y] of [[16, 16], [w - 16, 16], [16, h - 16], [w - 16, h - 16]]) rivet(ctx, x, y, 4);
  }, { repeat: false });
}

/**
 * Photovoltaic solar cell module texture: dark blue monocrystalline silicon wafers,
 * anti-reflective coating sheen, fine conductive fingers, 3 vertical silver busbars,
 * and wafer division lines. Clean and continuous with no black seams.
 */
export function createSolarPanelTexture() {
  return canvasTexture(512, 256, (ctx, w, h) => {
    // 1. Dark navy-blue silicon substrate
    ctx.fillStyle = '#10223e';
    ctx.fillRect(0, 0, w, h);

    // 2. Solar wafer cells: 6 columns x 3 rows of rectangular solar cells
    const cols = 6;
    const rows = 3;
    const padX = 5;
    const padY = 5;
    const cellW = (w - padX * (cols + 1)) / cols;
    const cellH = (h - padY * (rows + 1)) / rows;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = padX + c * (cellW + padX);
        const y = padY + r * (cellH + padY);

        // Wafer gradient (anti-reflective coating sheen)
        const g = ctx.createLinearGradient(x, y, x + cellW, y + cellH);
        g.addColorStop(0, '#1d3e75');
        g.addColorStop(0.5, '#152d56');
        g.addColorStop(1, '#0e1e3b');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, cellW, cellH);

        // Fine horizontal grid lines (current collectors / fingers)
        ctx.fillStyle = 'rgba(130, 175, 235, 0.25)';
        for (let fy = y + 4; fy < y + cellH - 2; fy += 5) {
          ctx.fillRect(x, fy, cellW, 1);
        }

        // Wafer border bevel
        ctx.strokeStyle = '#28508e';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
      }
    }

    // 3. Vertical busbars across all cells (3 silver conductive ribbons per column)
    for (let c = 0; c < cols; c++) {
      const cellLeft = padX + c * (cellW + padX);
      for (const barFrac of [0.25, 0.5, 0.75]) {
        const bx = cellLeft + cellW * barFrac;
        ctx.fillStyle = '#a0bcdd';
        ctx.fillRect(bx - 1, padY, 2, h - padY * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx, padY, 1, h - padY * 2);
      }
    }

    // 4. White/grey backsheet border around panel
    ctx.strokeStyle = '#607288';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }, { repeat: false });
}

