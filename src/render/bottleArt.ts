/**
 * Grandes bouteilles de l'étagère « Ma gamme » et réserve du stockage.
 * La bouteille fait 34 × 72 px natifs, affichée ×4 : son étiquette (30 × 19 px natifs) y est posée en
 * surimpression à 120 × 76 px, soit exactement la taille native de l'étiquette — nette au pixel près.
 */
import type { Beer } from '../core/game';
import type { BottleShape } from '../core/label';
import { CRATE } from '../core/warehouse';
import { drawMiniLabel } from './labelArt';

export const BOTTLE_W = 34;
export const BOTTLE_H = 72;
export const BOTTLE_SCALE = 2;
/** Zone de l'étiquette sur le corps de la bouteille (px natifs), selon sa forme. */
export const LABEL_SPOT = { x: 2, y: 36, w: 30, h: 19 };
const SPOTS: Record<BottleShape, number> = { classic: 36, longneck: 42, stubby: 44, swing: 38, champagne: 44 };
export const labelSpot = (shape: BottleShape = 'classic') => ({ ...LABEL_SPOT, y: SPOTS[shape] ?? 36 });

const CX = 17;
/** Profil de chaque bouteille : haut du goulot, fin du col, fin de l'épaule (px natifs). */
const PROFILE: Record<BottleShape, { top: number; neck: number; shoulder: number; neckW: number; body: number }> = {
  classic: { top: 0, neck: 18, shoulder: 28, neckW: 5, body: 17 },
  longneck: { top: 0, neck: 26, shoulder: 34, neckW: 4, body: 16 },
  stubby: { top: 14, neck: 22, shoulder: 28, neckW: 6, body: 17 },
  swing: { top: 4, neck: 18, shoulder: 30, neckW: 6, body: 17 },
  champagne: { top: 0, neck: 14, shoulder: 38, neckW: 5, body: 17 },
};
/** Demi-largeur de la bouteille à la ligne y : capsule, col, épaule, corps arrondi en bas. */
function halfWidth(y: number, shape: BottleShape = 'classic'): number {
  const p = PROFILE[shape] ?? PROFILE.classic;
  if (y < p.top || y >= BOTTLE_H) return 0;
  if (y < p.top + 4) return p.neckW + 1;
  if (y < p.neck) return p.neckW;
  if (y < p.shoulder) {
    const k = (y - p.neck) / (p.shoulder - p.neck - 1);
    const e = shape === 'champagne' ? Math.sin((k * Math.PI) / 2) : k; // épaule longue et galbée
    return Math.round(p.neckW + e * (p.body - p.neckW));
  }
  if (y === BOTTLE_H - 1) return p.body - 3;
  if (y === BOTTLE_H - 2) return p.body - 1;
  return p.body;
}

export type ShelfBottleKind = 'beer' | 'empty' | 'add' | 'locked';

export function drawShelfBottle(canvas: HTMLCanvasElement, kind: ShelfBottleKind, shape: BottleShape = 'classic'): void {
  canvas.width = BOTTLE_W;
  canvas.height = BOTTLE_H;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, BOTTLE_W, BOTTLE_H);
  if (kind === 'beer') return glassBottle(g, shape);
  const halfWidth = (y: number) => halfWidthOf(y, shape);
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

const halfWidthOf = halfWidth;

function glassBottle(g: CanvasRenderingContext2D, shape: BottleShape): void {
  const p = PROFILE[shape] ?? PROFILE.classic;
  const halfWidth = (y: number) => halfWidthOf(y, shape);
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
  g.fillRect(CX - p.body + 6, p.shoulder + 2, 2, BOTTLE_H - p.shoulder - 8);
  g.fillRect(CX - 3, p.top + 6, 1, Math.max(3, p.neck - p.top - 7));
  g.fillStyle = 'rgba(255,240,210,0.25)';
  g.fillRect(CX - p.body + 8, p.shoulder + 2, 1, BOTTLE_H - p.shoulder - 12);
  const t = p.top;
  if (shape === 'swing') {
    // bouchon mécanique : porcelaine blanche, joint rouge, étrier de fil
    g.fillStyle = '#1a0c06'; g.fillRect(CX - 6, t - 4, 12, 6);
    g.fillStyle = '#f6ecd6'; g.fillRect(CX - 5, t - 4, 10, 4);
    g.fillStyle = '#c8bca4'; g.fillRect(CX - 5, t - 1, 10, 1);
    g.fillStyle = '#e8553a'; g.fillRect(CX - 6, t + 1, 12, 1);
    g.fillStyle = '#98a6b6';
    for (let y = t - 3; y < t + 12; y++) { g.fillRect(CX - 8, y, 1, 1); g.fillRect(CX + 7, y, 1, 1); }
    g.fillRect(CX - 8, t + 11, 16, 1);
  } else if (shape === 'champagne') {
    // feuille d'or sur le goulot, muselet
    g.fillStyle = '#a8742a';
    for (let y = t; y < t + 16; y++) { const hw = halfWidth(y); g.fillRect(CX - hw, y, hw * 2, 1); }
    g.fillStyle = '#f2c14e';
    for (let y = t; y < t + 15; y++) { const hw = halfWidth(y) - 1; g.fillRect(CX - hw, y, hw * 2 - 1, 1); }
    g.fillStyle = '#ffe7a0'; g.fillRect(CX - 3, t + 1, 1, 12);
    g.fillStyle = '#6a4220'; g.fillRect(CX - 5, t + 15, 10, 1);
  } else {
    // capsule dorée
    g.fillStyle = '#1a0c06';
    g.fillRect(CX - p.neckW - 2, t, (p.neckW + 2) * 2, 5);
    g.fillStyle = '#f2c14e';
    g.fillRect(CX - p.neckW - 1, t, (p.neckW + 1) * 2, 4);
    g.fillStyle = '#a8742a';
    g.fillRect(CX - p.neckW - 1, t + 3, (p.neckW + 1) * 2, 1);
    g.fillStyle = '#ffe7a0';
    for (let x = CX - p.neckW - 1; x < CX + p.neckW + 1; x += 2) g.fillRect(x, t, 1, 1);
    // collerette (étiquette de col)
    if (p.neck - t > 10) {
      g.fillStyle = '#e8dcc0';
      g.fillRect(CX - p.neckW + 1, t + 12, (p.neckW - 1) * 2, 4);
      g.fillStyle = '#bdb59e';
      g.fillRect(CX - p.neckW + 1, t + 15, (p.neckW - 1) * 2, 1);
    }
  }
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
