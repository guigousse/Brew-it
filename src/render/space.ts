/**
 * Outils de profondeur pour les décors en pixel art : sol en perspective (un point de fuite), ombrage tramé,
 * ombres portées. Tout se calcule au pixel, une fois, quand le décor est mis en cache.
 *
 * Coordonnées : celles de la pièce (la scène de 160 × 300 au centre). Une pièce peut déborder de cette scène
 * (écran plus large ou plus haut) : ses limites sont alors L < 0, R > 160, T < 0, B > 300.
 * `ox`, `oy` : position de l'origine de la pièce dans le canvas.
 */

export interface Bounds { L: number; R: number; T: number; B: number; ox: number; oy: number }
export type RGB = readonly [number, number, number];

/** Tramage ordonné 4 × 4 (seuils 0..1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)]!;

export function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Premier multiple de `step` (décalé de `start`) au plus égal à `min` : pour prolonger un motif répété vers la gauche ou le haut. */
export const from = (start: number, step: number, min: number) => start - Math.ceil((start - min) / step) * step;

/** Lumière quantifiée en paliers tramés : garde l'aspect pixel art (pas de dégradé lisse). */
const STEPS = 10;
export const quant = (f: number, x: number, y: number) => Math.floor(f * STEPS + bayer(x, y)) / STEPS;

interface Px { x: number; y: number; w: number; h: number }

function region(g: CanvasRenderingContext2D, b: Bounds, r: Px): { img: ImageData; x0: number; y0: number } | null {
  const x0 = Math.max(0, Math.floor(r.x + b.ox));
  const y0 = Math.max(0, Math.floor(r.y + b.oy));
  const x1 = Math.min(g.canvas.width, Math.ceil(r.x + r.w + b.ox));
  const y1 = Math.min(g.canvas.height, Math.ceil(r.y + r.h + b.oy));
  if (x1 <= x0 || y1 <= y0) return null;
  return { img: g.getImageData(x0, y0, x1 - x0, y1 - y0), x0, y0 };
}

/**
 * Éclaire ou assombrit une zone : chaque pixel est multiplié par f(x, y) (1 = inchangé), en paliers tramés.
 * Sert à l'occlusion ambiante (coins, pied des murs), aux halos des lampes et aux ombres portées.
 */
export function shade(g: CanvasRenderingContext2D, b: Bounds, r: Px, f: (x: number, y: number) => number): void {
  const reg = region(g, b, r);
  if (!reg) return;
  const { img, x0, y0 } = reg;
  const d = img.data;
  for (let j = 0; j < img.height; j++) {
    for (let i = 0; i < img.width; i++) {
      const cx = x0 + i;
      const cy = y0 + j;
      const k = f(cx - b.ox + 0.5, cy - b.oy + 0.5);
      if (k === 1) continue;
      const q = quant(k, cx, cy);
      const o = (j * img.width + i) * 4;
      if (q <= 1) {
        d[o] = d[o]! * q;
        d[o + 1] = d[o + 1]! * q;
        d[o + 2] = d[o + 2]! * q;
      } else {
        // lumière : on éclaircit vers une teinte chaude
        const a = q - 1;
        d[o] = Math.min(255, d[o]! + (255 - d[o]!) * a * 0.9);
        d[o + 1] = Math.min(255, d[o + 1]! + (240 - d[o + 1]!) * a * 0.8);
        d[o + 2] = Math.min(255, d[o + 2]! + (200 - d[o + 2]!) * a * 0.6);
      }
    }
  }
  g.putImageData(img, x0, y0);
}

/** Distance focale (px) des sols en perspective : fixe le rapport largeur / profondeur des carreaux. */
const FOCAL = 110;

/**
 * Sol en perspective, vu de face, qui fuit vers le point (vx, vy) (vy = hauteur des yeux, au-dessus du sol).
 * Pour chaque pixel, `paint` reçoit ses coordonnées dans le plan du sol, en carreaux carrés de `tile` px de large
 * au bas de la scène : u (latéral, 0 sous le point de fuite) et v (profondeur, grandit vers le fond),
 * et la taille d'un pixel dans ces unités (du, dv), pour tracer des joints d'un pixel sans crénelage.
 */
export function floor(
  g: CanvasRenderingContext2D,
  b: Bounds,
  top: number,
  vx: number,
  vy: number,
  tile: number,
  paint: (u: number, v: number, du: number, dv: number, x: number, y: number) => RGB,
  bottom = b.B,
): void {
  const reg = region(g, b, { x: b.L, y: top, w: b.R - b.L, h: bottom - top });
  if (!reg) return;
  const { img, x0, y0 } = reg;
  const d = img.data;
  const s = (300 - vy) / tile;
  for (let j = 0; j < img.height; j++) {
    const y = y0 + j - b.oy + 0.5;
    const t = y - vy;
    const du = s / t;
    const v = (FOCAL * s) / t;
    const dv = v / t;
    for (let i = 0; i < img.width; i++) {
      const x = x0 + i - b.ox + 0.5;
      const c = paint((x - vx) * du, v, du, dv, x, y);
      const o = (j * img.width + i) * 4;
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, x0, y0);
}

/** Point du sol (u, v) à l'écran : pour poser un objet ou une tache à sa place dans la perspective. */
export function onFloor(u: number, v: number, vx: number, vy: number, tile: number): { x: number; y: number } {
  const s = (300 - vy) / tile;
  const t = (FOCAL * s) / v;
  return { x: vx + (u * t) / s, y: vy + t };
}

/** Assombrit le fond du sol (là où il rejoint le mur) et ses bords, éclaire sous les lampes. */
export function floorLight(g: CanvasRenderingContext2D, b: Bounds, top: number, lights: readonly (readonly [number, number, number, number])[] = [], ao = 0.55): void {
  const cx = (b.L + b.R) / 2;
  const half = (b.R - b.L) / 2;
  shade(g, b, { x: b.L, y: top, w: b.R - b.L, h: b.B - top }, (x, y) => {
    let f = 1;
    const back = (y - top) / 22;
    if (back < 1) f *= ao + (1 - ao) * back ** 0.7;
    f *= 1 - 0.22 * (Math.abs(x - cx) / half) ** 2.5;
    f *= 0.9 + 0.1 * Math.min(1, (y - top) / 80); // le premier plan, plus près de la lumière de la pièce
    for (const [lx, ly, r, k] of lights) {
      const dd = Math.hypot((x - lx) / r, ((y - ly) / r) * 2.2);
      if (dd < 1) f += k * (1 - dd) ** 2;
    }
    return f;
  });
}

/** Mélange de deux couleurs. */
export const mix = (a: RGB, c: RGB, k: number): RGB => [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k];
export const dim = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

/** Joint d'un pixel : vrai si la ligne entière n tombe dans [w, w + dw). */
export const seam = (w: number, dw: number) => Math.floor(w) !== Math.floor(w + dw);

/** Ombre portée douce d'un objet posé au sol : une ellipse aplatie (rx, ry) centrée sur (cx, cy). */
export function dropShadow(g: CanvasRenderingContext2D, b: Bounds, cx: number, cy: number, rx: number, ry: number, k = 0.55): void {
  shade(g, b, { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 }, (x, y) => {
    const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    return e >= 1 ? 1 : 1 - (1 - k) * (1 - e) ** 0.6;
  });
}

/** Ombre d'un meuble rectangulaire contre le mur ou au sol : bande qui s'estompe sur `soft` px autour du rectangle. */
export function boxShadow(g: CanvasRenderingContext2D, b: Bounds, r: Px, soft: number, k = 0.6): void {
  shade(g, b, { x: r.x - soft, y: r.y - soft, w: r.w + soft * 2, h: r.h + soft * 2 }, (x, y) => {
    const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
    const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
    const dd = Math.hypot(dx, dy) / soft;
    return dd >= 1 ? 1 : 1 - (1 - k) * (1 - dd) ** 1.5;
  });
}

/**
 * Occlusion ambiante d'un mur du fond : plus sombre au plafond, dans les coins, et au pied (où il rejoint le sol).
 * `light` : halos de lampes (x, y, rayon, intensité) qui éclaircissent.
 */
export function wallLight(g: CanvasRenderingContext2D, b: Bounds, top: number, bottom: number, lights: readonly (readonly [number, number, number, number])[] = [], ceil = 0.72): void {
  const cx = (b.L + b.R) / 2;
  const half = (b.R - b.L) / 2;
  shade(g, b, { x: b.L, y: top, w: b.R - b.L, h: bottom - top }, (x, y) => {
    let f = 1;
    const up = (y - top) / 60;
    if (up < 1) f *= ceil + (1 - ceil) * up ** 0.8;
    const down = (bottom - y) / 16;
    if (down < 1) f *= 0.7 + 0.3 * down;
    const side = Math.abs(x - cx) / half;
    f *= 1 - 0.18 * side ** 3;
    for (const [lx, ly, r, k] of lights) {
      const dd = Math.hypot(x - lx, (y - ly) * 1.2) / r;
      if (dd < 1) f += k * (1 - dd) ** 2;
    }
    return f;
  });
}

/**
 * Trapèze aux bords haut et bas horizontaux, rempli au pixel près (sans anticrénelage) :
 * dessus d'un meuble, embrasure d'une fenêtre, face latérale…
 */
export function trap(g: CanvasRenderingContext2D, y0: number, y1: number, l0: number, r0: number, l1: number, r1: number, col: string): void {
  g.fillStyle = col;
  const n = Math.max(1, y1 - y0);
  for (let y = y0; y < y1; y++) {
    const k = (y - y0 + 0.5) / n;
    const l = Math.round(l0 + (l1 - l0) * k);
    const r = Math.round(r0 + (r1 - r0) * k);
    if (r > l) g.fillRect(l, y, r - l, 1);
  }
}

/** Bande verticale qui fuit vers un point : face latérale d'un objet (x0 → x1 de haut en bas à gauche, idem à droite). */
export function skew(g: CanvasRenderingContext2D, x0: number, x1: number, top0: number, bot0: number, top1: number, bot1: number, col: string): void {
  g.fillStyle = col;
  const n = Math.max(1, Math.abs(x1 - x0));
  const dir = x1 >= x0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const t = Math.round(top0 + (top1 - top0) * k);
    const bb = Math.round(bot0 + (bot1 - bot0) * k);
    if (bb > t) g.fillRect(x0 + i * dir - (dir < 0 ? 1 : 0), t, 1, bb - t);
  }
}
