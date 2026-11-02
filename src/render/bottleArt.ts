/**
 * Grandes bouteilles de l'étagère « Ma gamme » et réserve du stockage.
 * La bouteille fait 34 × 72 px natifs, affichée ×4 : son étiquette (30 × 19 px natifs) y est posée en
 * surimpression à 120 × 76 px, soit exactement la taille native de l'étiquette — nette au pixel près.
 */
import type { Beer } from '../core/game';
import { CRATE } from '../core/warehouse';
import { drawMiniLabel } from './labelArt';

export const BOTTLE_W = 34;
export const BOTTLE_H = 72;
export const BOTTLE_SCALE = 2;
/** Zone de l'étiquette sur le corps de la bouteille (px natifs). */
export const LABEL_SPOT = { x: 2, y: 36, w: 30, h: 19 };

const CX = 17;
/** Demi-largeur de la bouteille à la ligne y : capsule, col, épaule, corps arrondi en bas. */
function halfWidth(y: number): number {
  if (y < 0 || y >= BOTTLE_H) return 0;
  if (y < 4) return 6;
  if (y < 18) return 5;
  if (y < 28) return Math.round(5 + ((y - 18) / 9) * 11);
  if (y === BOTTLE_H - 1) return 14;
  if (y === BOTTLE_H - 2) return 16;
  return 17;
}

export type ShelfBottleKind = 'beer' | 'empty' | 'add' | 'locked';

export function drawShelfBottle(canvas: HTMLCanvasElement, kind: ShelfBottleKind): void {
  canvas.width = BOTTLE_W;
  canvas.height = BOTTLE_H;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, BOTTLE_W, BOTTLE_H);
  if (kind === 'beer') return glassBottle(g);
  // silhouette : contour en pointillés, intérieur sombre
  const dim = kind === 'add' ? '#a894bc' : '#5c4a6e';
  g.fillStyle = kind === 'add' ? 'rgba(242,193,78,0.07)' : 'rgba(0,0,0,0.18)';
  for (let y = 0; y < BOTTLE_H; y++) {
    const hw = halfWidth(y);
    g.fillRect(CX - hw, y, hw * 2, 1);
  }
  g.fillStyle = dim;
  for (let y = 0; y < BOTTLE_H; y++) {
    const hw = halfWidth(y);
    const prev = halfWidth(y - 1);
    const next = halfWidth(y + 1);
    for (let x = CX - hw; x < CX + hw; x++) {
      const edge = x === CX - hw || x === CX + hw - 1 || Math.abs(x - CX + 0.5) >= Math.min(prev, next) - 0.5;
      if (edge && (x + y) % 3 !== 0) g.fillRect(x, y, 1, 1);
    }
  }
  if (kind === 'add') {
    // grand « + » au centre du corps
    g.fillStyle = '#1b1424';
    g.fillRect(CX - 8, 44, 16, 6);
    g.fillRect(CX - 3, 39, 6, 16);
    g.fillStyle = '#f2c14e';
    g.fillRect(CX - 7, 45, 14, 4);
    g.fillRect(CX - 2, 40, 4, 14);
    g.fillStyle = '#ffe7a0';
    g.fillRect(CX - 7, 45, 14, 1);
    g.fillRect(CX - 2, 40, 1, 14);
  }
}

function glassBottle(g: CanvasRenderingContext2D): void {
  // contour
  g.fillStyle = '#1a0c06';
  for (let y = 0; y < BOTTLE_H; y++) {
    const hw = halfWidth(y);
    g.fillRect(CX - hw, y, hw * 2, 1);
  }
  // verre brun, ombré par colonne
  for (let y = 1; y < BOTTLE_H - 1; y++) {
    const hw = Math.min(halfWidth(y - 1), halfWidth(y), halfWidth(y + 1)) - 1;
    if (hw <= 0) continue;
    for (let i = 0; i < hw * 2; i++) {
      const k = i / (hw * 2);
      g.fillStyle = k < 0.12 ? '#4a2a12' : k < 0.3 ? '#8a5a2e' : k < 0.72 ? '#6a4220' : k < 0.88 ? '#55341a' : '#3a200c';
      g.fillRect(CX - hw + i, y, 1, 1);
    }
  }
  // reflets
  g.fillStyle = 'rgba(255,240,210,0.55)';
  g.fillRect(CX - 11, 30, 2, 36);
  g.fillRect(CX - 3, 6, 1, 11);
  g.fillStyle = 'rgba(255,240,210,0.25)';
  g.fillRect(CX - 9, 30, 1, 30);
  // capsule dorée
  g.fillStyle = '#1a0c06';
  g.fillRect(CX - 7, 0, 14, 5);
  g.fillStyle = '#f2c14e';
  g.fillRect(CX - 6, 0, 12, 4);
  g.fillStyle = '#a8742a';
  g.fillRect(CX - 6, 3, 12, 1);
  g.fillStyle = '#ffe7a0';
  for (let x = CX - 6; x < CX + 6; x += 2) g.fillRect(x, 0, 1, 1);
  // collerette (étiquette de col)
  g.fillStyle = '#e8dcc0';
  g.fillRect(CX - 4, 12, 8, 4);
  g.fillStyle = '#bdb59e';
  g.fillRect(CX - 4, 15, 8, 1);
}

/** Couleur dominante d'une caisse : le fond de l'étiquette de la bière. */
export interface CrateSpec {
  beer: Beer;
  /** Bouteilles dans la caisse (12 = pleine). */
  count: number;
}

/** Liste des caisses en stock, bière par bière (la dernière de chaque bière peut être entamée). */
export function crateList(beers: Beer[]): CrateSpec[] {
  const out: CrateSpec[] = [];
  for (const beer of beers) {
    let left = beer.stock;
    while (left > 0) {
      out.push({ beer, count: Math.min(CRATE, left) });
      left -= CRATE;
    }
  }
  return out;
}

/**
 * Réserve vue de face : des rayonnages où les caisses s'empilent de bas en haut.
 * Plus le stockage est grand, plus il y a d'emplacements (et plus les caisses paraissent petites).
 */
export function drawStorage(canvas: HTMLCanvasElement, beers: Beer[], capacity: number, level: number): void {
  const W = 160;
  const cols = Math.ceil(Math.sqrt(capacity * 2));
  const rows = Math.ceil(capacity / cols);
  const cell = Math.floor((W - 12) / cols);
  const gridW = cols * cell;
  const ox = Math.floor((W - gridW) / 2);
  const shelfGap = Math.max(1, Math.round(cell / 6));
  const rowH = cell + shelfGap;
  const H = rows * rowH + 18;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  // mur (brique pour le garage et la cave, béton au-delà) et sol
  const wall = level <= 2 ? ['#6a3226', '#4a221a'] : level === 3 ? ['#3a5a6a', '#2a4250'] : ['#4a4a58', '#363644'];
  px(0, 0, W, H, wall[0]!);
  for (let y = 0; y < H; y += 6) {
    px(0, y + 5, W, 1, wall[1]!);
    if (level <= 2) for (let x = ((y / 6) % 2) * 6; x < W; x += 12) px(x, y, 1, 5, wall[1]!);
  }
  if (level === 3) for (let y = 3; y < H; y += 10) px(0, y, W, 1, '#c8f0ff30');
  const floor = H - 8;
  px(0, floor, W, 8, '#2c2228');
  px(0, floor, W, 1, '#5c4848');
  // montants des rayonnages
  for (let r = 0; r < rows; r++) {
    const y = floor - (r + 1) * rowH;
    px(ox - 3, y + cell, gridW + 6, shelfGap, '#7a6a5a');
    px(ox - 3, y + cell, gridW + 6, 1, '#a8987e');
  }
  const top = floor - rows * rowH;
  for (const x of [ox - 4, ox + gridW + 2]) px(x, top - 2, 2, floor - top + 2, '#4e5a6a');
  // caisses : de bas en haut, de gauche à droite
  const crates = crateList(beers);
  for (let i = 0; i < rows * cols && i < capacity; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = ox + c * cell;
    const y = floor - (r + 1) * rowH;
    const crate = crates[i];
    if (!crate) {
      // emplacement libre : marquage au sol en pointillés
      g.fillStyle = '#ffffff22';
      for (let k = 0; k < cell - 1; k += 2) {
        g.fillRect(x + k, y + cell - 1, 1, 1);
        g.fillRect(x + k, y + 1, 1, 1);
      }
      continue;
    }
    drawCrate(g, x, y, cell - 1, crate);
  }
}

export function drawCrate(g: CanvasRenderingContext2D, x: number, y: number, s: number, crate: CrateSpec): void {
  const full = crate.count >= CRATE;
  const lid = Math.max(1, Math.round(s / 5));
  g.fillStyle = '#3a2410';
  g.fillRect(x, y, s, s);
  g.fillStyle = '#b8803e';
  g.fillRect(x + 1, y + 1, s - 2, s - 2);
  if (s >= 8) {
    g.fillStyle = '#d8a868';
    g.fillRect(x + 1, y + 1, s - 2, 1);
    g.fillStyle = '#8a5a28';
    g.fillRect(x + 1, y + Math.floor(s / 2), s - 2, 1);
  }
  if (!full) {
    // caisse entamée : ouverte, on voit les capsules
    g.fillStyle = '#2a1608';
    g.fillRect(x + 1, y + 1, s - 2, lid);
    if (s >= 6) {
      g.fillStyle = '#f2c14e';
      const n = Math.max(1, Math.round(((s - 3) / 2) * (crate.count / CRATE)));
      for (let k = 0; k < n; k++) g.fillRect(x + 2 + k * 2, y + 1, 1, 1);
    }
  }
  if (s >= 10) drawMiniLabel(g, crate.beer.label, x + Math.floor((s - 7) / 2), y + Math.floor(s / 2) - 2, 7);
  else {
    // trop petit pour l'étiquette : une bande à la couleur de la bière
    g.fillStyle = crate.beer.label.bg;
    g.fillRect(x + 1, y + s - 2, s - 2, 1);
  }
}
