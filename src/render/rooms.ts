/**
 * Les deux autres pièces de la brasserie, au même format que l'atelier (canvas 160 × 300 agrandi au pixel près) :
 * - le stockage : des rayonnages où s'empilent les caisses, un diable et la palette des commandes prêtes ;
 * - le bar : le comptoir, ses tireuses aux couleurs des bières à la carte, et des clients qui vont et viennent.
 * Chaque pièce a 5 décors, selon son niveau.
 */
import type { Game } from '../core/game';
import type { Label } from '../core/label';
import { crateList, drawCrate } from './bottleArt';
import { STORAGE } from '../core/warehouse';
import { drawMiniLabel } from './labelArt';
import { PAL } from './painter';
import type { Rect } from './sprites';
import { boxShadow, dropShadow, floor, floorLight, from, mix, rgb, seam, shade, dim, trap, wallLight, type Bounds } from './space';

export const ROOM_W = 160;
export const ROOM_H = 300;

/** Limites d'un écran de w × h px natifs, le plan de 160 × 300 au centre. */
export function boundsFor(w: number, h: number): Bounds {
  const ox = Math.floor((w - ROOM_W) / 2);
  const oy = Math.floor((h - ROOM_H) / 2);
  return { L: -ox, R: w - ox, T: -oy, B: h - oy, ox, oy };
}
/** Ligne du sol (comme la salle d'embouteillage de l'atelier). */
const FLOOR = 210;

export type Px = (x: number, y: number, w: number, h: number, c: string) => void;
export const painter = (g: CanvasRenderingContext2D): Px => (x, y, w, h, c) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};

/** Chiffres de 3 × 5 px (écran de l'ordinateur). */
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
export function drawDigits(g: CanvasRenderingContext2D, text: string, x: number, y: number, col: string): void {
  g.fillStyle = col;
  for (let k = 0; k < text.length; k++) {
    const d = DIGITS[Number(text[k])]!;
    for (let i = 0; i < 15; i++) if (d[i] === '1') g.fillRect(x + k * 4 + (i % 3), y + Math.floor(i / 3), 1, 1);
  }
}

/** Hachage déterministe 0..1 (décor, clients). */
export const hash = (a: number, b = 0) => {
  let x = Math.imul(a * 374761393 + b * 668265263, 1274126177);
  x ^= x >>> 13;
  x = Math.imul(x, 1103515245);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/**
 * Pièce commune : canvas, décors en cache par niveau, récupération après une purge mémoire d'iOS.
 * La pièce garde son plan de 160 × 300 au centre, mais son canvas prend tout l'écran (ROOM_W × ROOM_H au moins) :
 * murs et sols sont peints d'un seul tenant jusqu'aux bords, sans rien recopier.
 */
export abstract class Room {
  readonly canvas = document.createElement('canvas');
  protected g: CanvasRenderingContext2D;
  protected bgs = new Map<number, HTMLCanvasElement>();
  private checkedAt = 0;
  /** Limites de la pièce (dans son plan) et position de son origine dans le canvas. */
  b: Bounds = { L: 0, R: ROOM_W, T: 0, B: ROOM_H, ox: 0, oy: 0 };
  /** Objet sélectionné (liseré clignotant). */
  selected: string | null = null;

  constructor() {
    this.canvas.width = ROOM_W;
    this.canvas.height = ROOM_H;
    this.g = this.canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
  }

  /** Taille de l'écran de la pièce en pixels natifs : le plan reste centré, le décor s'étend jusqu'aux bords. */
  resize(w: number, h: number): void {
    this.b = boundsFor(w, h);
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.invalidate();
  }

  invalidate(): void {
    this.bgs.clear();
  }

  protected background(level: number, t: number): HTMLCanvasElement {
    if (t - this.checkedAt > 1) {
      this.checkedAt = t;
      const bg = this.bgs.get(level);
      try {
        if (bg && bg.getContext('2d')!.getImageData(0, 0, 1, 1).data[3] === 0) this.invalidate();
      } catch {
        this.invalidate();
      }
    }
    let c = this.bgs.get(level);
    if (!c) {
      c = document.createElement('canvas');
      c.width = this.canvas.width;
      c.height = this.canvas.height;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.translate(this.b.ox, this.b.oy);
      this.paintBackground(g, level);
      this.bgs.set(level, c);
    }
    return c;
  }

  /** Début d'une image : le décor, puis on dessine dans le plan de la pièce. */
  protected begin(level: number, t: number): void {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.background(level, t), 0, 0);
    g.setTransform(1, 0, 0, 1, this.b.ox, this.b.oy);
  }

  protected abstract paintBackground(g: CanvasRenderingContext2D, level: number): void;

  /** Niveau qui choisit le décor. */
  protected abstract levelOf(game: Game): number;

  protected outline(r: Rect, t: number): void {
    if (Math.floor(t * 3) % 2) return;
    this.g.strokeStyle = '#f2c14e';
    this.g.lineWidth = 1;
    this.g.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
  }
}

/** Murs et sols communs aux pièces, du plus modeste au plus futuriste. */
export function wall(g: CanvasRenderingContext2D, px: Px, style: 'brick' | 'stone' | 'cold' | 'metal' | 'future' | 'plank' | 'green', bottom: number, b: Bounds): void {
  const { L, R, T } = b;
  const WW = R - L;
  const H = bottom - T;
  const m = (a: number, n: number) => ((a % n) + n) % n;
  if (style === 'brick') {
    px(L, T, WW, H, '#7a3a2c');
    for (let y = from(0, 6, T); y < bottom; y += 6) {
      px(L, y + 5, WW, 1, '#4a221a');
      for (let x = from(m(y / 6, 2) * 6, 12, L - 12); x < R; x += 12) {
        px(x, y, 1, 5, '#4a221a');
        px(x + 1, y, 10, 1, '#9a4e3a');
        if (hash(x, y) < 0.12) px(x + 1, y + 1, 10, 4, '#6a3226');
      }
    }
  } else if (style === 'stone') {
    px(L, T, WW, H, '#4a4038');
    for (let y = from(0, 9, T); y < bottom; y += 9) {
      const row = y / 9;
      for (let x = from(-m(row * 7, 16), 16, L - 16); x < R; x += 16) {
        px(x + 1, y + 1, 14, 7, ['#5e5248', '#56493f', '#665a4e', '#4e4238'][m(x * 3 + row * 5, 4)]!);
        px(x + 1, y + 1, 14, 1, '#76685a');
      }
    }
  } else if (style === 'cold') {
    // panneaux isothermes blancs, joints verticaux, givre en haut
    px(L, T, WW, H, '#dfe8ee');
    for (let x = from(0, 20, L); x < R; x += 20) { px(x, T, 1, H, '#aebcc8'); px(x + 1, T, 1, H, '#f4f8fc'); }
    for (let x = L; x < R; x++) px(x, T, 1, 2 + Math.round(hash(x) * 4) - Math.min(0, T), '#ffffff');
  } else if (style === 'metal') {
    for (let x = L; x < R; x++) px(x, T, 1, H, ['#5c6878', '#6c788a', '#7c889a', '#6c788a', '#56606e', '#4a5462'][m(x, 6)]!);
  } else if (style === 'future') {
    px(L, T, WW, H, '#e8eef4');
    for (let y = from(0, 22, T); y < bottom; y += 22) px(L, y, WW, 1, '#c4d0dc');
    for (let x = from(0, 32, L); x < R; x += 32) px(x, T, 1, H, '#c4d0dc');
  } else if (style === 'plank') {
    // lambris de bois clair
    for (let x = from(0, 8, L); x < R; x += 8) {
      px(x, T, 8, H, ['#a8743c', '#9a6a36', '#b07a40'][m(x / 8, 3)]!);
      px(x, T, 1, H, '#6a4422');
    }
  } else {
    // vert anglais en haut, lambris sombre en bas
    px(L, T, WW, H, '#2c4a3a');
    for (let y = from(4, 14, T); y < bottom; y += 14) for (let x = from(6, 14, L); x < R; x += 14) px(x, y, 1, 1, '#3c5e4a');
  }
}

// =================================================================== stockage

/** Zone des rayonnages (coordonnées de la pièce). */
const RACKS: Rect = { x: 6, y: 30, w: 148, h: 174 };
/** Le diable et ses caisses vides, au premier plan à gauche. */
const TROLLEY = { x: 14, y: 226 };
/** Point de fuite du stockage : au milieu, à hauteur des yeux. */
const EYE_STORE = 128;
const STORAGE_CRATES = STORAGE.map((s) => s.crates);

/** La grille des rayonnages d'un niveau : la plus grande taille de caisse qui fait tout tenir. */
function rackGrid(lv: number) {
  // Au-delà de 160 emplacements, chaque case est une palette de plusieurs caisses.
  const crateCap = STORAGE_CRATES[lv - 1]!;
  const per = Math.max(1, Math.ceil(crateCap / 160));
  const cap = Math.ceil(crateCap / per);
  let cell = 34;
  let cols = 1;
  let rows = 1;
  let gap = 1;
  for (; cell > 3; cell--) {
    gap = Math.max(1, Math.round(cell / 6));
    cols = Math.floor((RACKS.w - 6) / cell);
    rows = Math.ceil(cap / cols);
    if (rows * (cell + gap) <= RACKS.h - 4) break;
  }
  cols = Math.min(cols, Math.ceil(cap / rows));
  const rowH = cell + gap;
  const gw = cols * cell;
  const ox = RACKS.x + Math.floor((RACKS.w - gw) / 2);
  const base = RACKS.y + RACKS.h;
  return { per, cap, cell, cols, rows, gap, rowH, gw, ox, base, top: base - rows * rowH };
}

const mixHex = (a: string, c: string, k: number) => {
  const [r, gg, bb] = mix(rgb(a), rgb(c), k);
  return `rgb(${Math.round(r)},${Math.round(gg)},${Math.round(bb)})`;
};

/** Sol du stockage en perspective : dalle de béton, vieux pavés, résine blanche, résine d'entrepôt, dalles sombres. */
function paintStorageFloor(g: CanvasRenderingContext2D, b: Bounds, lv: number): void {
  const VX = 80;
  const mod = (a: number) => a - Math.floor(a);
  if (lv === 1) {
    const base = rgb('#6a6e74');
    const joint = rgb('#4e5258');
    const spot = rgb('#5a5e64');
    const light = rgb('#7a7e84');
    const oil = rgb('#2a2630');
    floor(g, b, FLOOR, VX, EYE_STORE, 44, (u, v, du, dv) => {
      if (seam(u + 0.5, du) || seam(v / 1.2, dv / 1.2)) return joint;
      const n = hash(Math.floor(u * 24), Math.floor(v * 24));
      // tache d'huile, à sa place dans la perspective
      const e = ((u - 0.75) / 0.42) ** 2 + ((v - 3.25) / 0.3) ** 2;
      if (e < 1) return mix(base, oil, 0.55 * (1 - e) ** 0.4 + (n < 0.3 ? 0.08 : 0));
      return n < 0.12 ? spot : n > 0.94 ? light : base;
    });
  } else if (lv === 2) {
    const stones = ['#5e4430', '#664a34', '#54402c', '#6e5038'].map(rgb);
    const mortar = rgb('#2e2016');
    floor(g, b, FLOOR, VX, EYE_STORE, 13, (u, v, du, dv) => {
      const row = Math.floor(v * 1.4);
      const uu = u + (row & 1) * 0.5 + hash(row, 5) * 0.3;
      if (seam(uu, du) || seam(v * 1.4, dv * 1.4)) return mortar;
      const c = stones[Math.floor(hash(Math.floor(uu), row) * 4)]!;
      const fv = mod(v * 1.4);
      const fu = mod(uu);
      if (fv > 1 - 2.2 * dv * 1.4) return mix(c, rgb('#8a6a4a'), 0.5); // arête éclairée (le haut du pavé)
      if (fv < 2 * dv * 1.4 || fu > 1 - 1.5 * du) return dim(c, 0.72); // flanc dans l'ombre
      return c;
    });
  } else if (lv === 3) {
    const base = rgb('#c4ced8');
    const joint = rgb('#9aa8b6');
    const dot = rgb('#b0bcc8');
    floor(g, b, FLOOR, VX, EYE_STORE, 22, (u, v, du, dv) => {
      if (seam(u, du) || seam(v, dv)) return joint;
      return mod(u * 6) < 0.25 && mod(v * 6) < 0.25 ? dot : base;
    });
  } else if (lv === 4) {
    const base = rgb('#6a6e74');
    const speck = rgb('#5e6268');
    const lane = rgb('#f2c14e');
    const dark = rgb('#1b1424');
    floor(g, b, FLOOR, VX, EYE_STORE, 30, (u, v, du) => {
      // allée de circulation : deux bandes jaunes qui fuient vers le fond, hachures au premier plan
      for (const lx of [-1.7, 1.7]) if (Math.abs(u - lx) < 0.07 + du / 2) return lane;
      if (Math.abs(u) > 2.3 && Math.abs(u) < 2.9 && v < 4.4) return mod((u + v) * 2.5) < 0.5 ? lane : dark;
      return hash(Math.floor(u * 30), Math.floor(v * 30)) < 0.15 ? speck : base;
    });
  } else {
    const base = rgb('#1c2230');
    const joint = rgb('#2a3244');
    const neon = rgb('#5ef0ff');
    floor(g, b, FLOOR, VX, EYE_STORE, 26, (u, v, du, dv) => {
      if (Math.abs(u) < 0.03 + du / 2) return neon;
      if (seam(u, du) || seam(v, dv)) return joint;
      return base;
    });
  }
}

export class StorageRoom extends Room {
  private crates?: { key: string; c: HTMLCanvasElement };

  /** Objets cliquables de la pièce. */
  hits(): { id: 'racks'; rect: Rect }[] {
    return [{ id: 'racks', rect: RACKS }];
  }

  override invalidate(): void {
    super.invalidate();
    this.crates = undefined;
  }

  protected levelOf(game: Game): number {
    return game.storageLevel;
  }

  draw(game: Game, t: number): void {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    const lv = game.storageLevel;
    this.begin(lv, t);
    g.drawImage(this.crateLayer(game), 0, 0);
    this.drawPallet(game, lv);
    // lumière qui vacille dans le coin du garage et la cave
    if (lv <= 2) {
      const k = 0.06 + 0.02 * Math.sin(t * 7) * Math.sin(t * 2.3);
      g.fillStyle = `rgba(255,210,130,${k})`;
      g.fillRect(this.b.L, this.b.T, this.b.R - this.b.L, FLOOR - this.b.T);
    }
    // chambre froide : brume qui flotte au sol
    if (lv === 3) {
      for (let i = 0; i < Math.round((14 * (this.b.R - this.b.L)) / ROOM_W); i++) {
        const span = this.b.R - this.b.L + 20;
        const x = this.b.L + ((i * 23 * span / ROOM_W + t * 6) % span) - 10;
        g.fillStyle = 'rgba(230,245,255,0.18)';
        g.fillRect(Math.round(x), FLOOR + 2 + (i % 3) * 3, 14, 2);
      }
    }
    if (this.selected === 'racks') this.outline(RACKS, t);
  }

  /** Les caisses, redessinées seulement quand le stock change (les rayonnages sont dans le décor). */
  private crateLayer(game: Game): HTMLCanvasElement {
    const lv = game.storageLevel;
    const { per, cap, cell, cols, rows, rowH, gw, ox, base, top } = rackGrid(lv);
    const key = `${lv}|${game.beers.map((b) => `${b.id}:${b.stock}:${b.kegs.length}:${b.label.bg}`).join(',')}`;
    if (this.crates?.key === key) return this.crates.c;
    const c = this.crates?.c ?? document.createElement('canvas');
    c.width = ROOM_W;
    c.height = ROOM_H;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, ROOM_W, ROOM_H);
    g.imageSmoothingEnabled = false;
    const px = painter(g);
    type Cell = { beer: (typeof game.beers)[number]; count: number; keg?: boolean };
    const crates: Cell[] = per === 1 ? crateList(game.beers) : game.beers.flatMap((beer) => {
      const out: Cell[] = [];
      for (let left = beer.stock; left > 0; left -= 12 * per) out.push({ beer, count: Math.max(1, Math.round((Math.min(left, 12 * per) / per))) });
      return out;
    });
    // les fûts pleins, chacun à la place d'une caisse
    for (const beer of game.beers) for (let k = 0; k < Math.ceil(beer.kegs.length / per); k++) crates.push({ beer, count: 12, keg: true });
    for (let i = 0; i < Math.min(cap, rows * cols); i++) {
      const x = ox + (i % cols) * cell;
      const y = base - (Math.floor(i / cols) + 1) * rowH;
      const crate = crates[i];
      if (!crate) continue;
      // chaque caisse fait de l'ombre sur le mur, en haut à droite, et sur la planche
      g.fillStyle = 'rgba(10,6,16,0.28)';
      g.fillRect(x + 2, y + 1, cell - 1, cell - 2);
      if (crate.keg) drawKeg(g, x, y, cell - 1, crate.beer.label);
      else {
        drawCrate(g, x, y, cell - 1 - (per > 1 ? 1 : 0), crate);
        if (per > 1) px(x, y + cell - 2, cell - 1, 1, '#a06830'); // palette
      }
    }
    // plein : bande rouge en haut
    if (game.storageFull) {
      px(ox - 3, top - 6, gw + 6, 3, '#e8553a');
      for (let x = ox - 3; x < ox + gw + 3; x += 6) px(x, top - 6, 3, 3, '#1b1424');
    }
    this.crates = { key, c };
    return c;
  }

  protected paintBackground(g: CanvasRenderingContext2D, lv: number): void {
    const px = painter(g);
    const b = this.b;
    const { L, R, T } = b;
    const WW = R - L;
    wall(g, px, lv === 1 ? 'brick' : lv === 2 ? 'stone' : lv === 3 ? 'cold' : lv === 4 ? 'metal' : 'future', FLOOR, b);
    // décor du haut du mur, et ses lampes (qui éclairent le mur et le sol)
    let lamps: [number, number, number, number][] = [];
    if (lv === 1) {
      // ampoule nue au bout de son fil, toiles d'araignée
      px(80, T, 1, 12 - T, '#1b1424'); px(78, 12, 5, 5, '#fff4b0'); px(79, 13, 3, 3, '#ffffff');
      g.strokeStyle = 'rgba(255,255,255,0.2)';
      g.beginPath(); g.moveTo(L, 2); g.lineTo(L + 14, 2); g.moveTo(L, 2); g.lineTo(L, 16); g.moveTo(L, 2); g.lineTo(L + 11, 13); g.stroke();
      // outils accrochés
      boxShadow(g, b, { x: 132, y: 10, w: 18, h: 14 }, 3, 0.6);
      px(130, 8, 18, 14, '#8a5a2c'); px(130, 8, 18, 1, '#b07a40'); px(133, 10, 2, 10, '#98a6b6'); px(139, 10, 3, 8, '#c4d0dc'); px(144, 11, 2, 9, '#e85a3a');
      lamps = [[80, 15, 70, 0.35]];
    } else if (lv === 2) {
      // voûte en arc et lanternes
      px(L, T, WW, 8 - T, '#3a3028');
      g.fillStyle = '#3a3028'; g.beginPath(); g.ellipse(80, 0, 90 + (WW - 160) / 2, 24, 0, 0, Math.PI); g.fill();
      for (const lx of [20, 140]) { px(lx - 2, 12, 5, 7, '#2a1a10'); px(lx - 1, 13, 3, 5, '#ffb050'); }
      lamps = [[20, 15, 40, 0.35], [140, 15, 40, 0.35]];
    } else if (lv === 3) {
      // groupe froid et thermomètre
      boxShadow(g, b, { x: 56, y: 6, w: 52, h: 14 }, 3, 0.7);
      px(54, 4, 52, 14, '#98a6b6'); px(55, 5, 50, 12, '#c4d0dc');
      for (let x = 58; x < 102; x += 3) px(x, 7, 1, 8, '#6c7a8c');
      px(124, 6, 22, 12, '#1c2a3a'); px(126, 8, 18, 8, '#0c1420');
      g.fillStyle = '#5ef0ff'; g.font = '8px monospace'; g.fillText('2°C', 127, 15);
      lamps = [[80, 0, 90, 0.12]];
    } else if (lv === 4) {
      // verrière et poutre rouge
      px(L, T, WW, 6 - T, '#3a4250');
      for (let wx = from(10, 48, L - 40); wx < R; wx += 48) { px(wx, 8, 40, 16, '#2a303a'); for (let i = 0; i < 4; i++) px(wx + 2 + i * 10, 10, 8, 12, '#7ab0d0'); px(wx + 2, 10, 38, 2, '#b0d8f0'); }
      shade(g, b, { x: L, y: 29, w: WW, h: 4 }, (_, y) => 0.6 + (y - 29) * 0.1);
      px(L, 26, WW, 3, '#c85a2c'); px(L, 26, WW, 1, '#e88a5a');
      lamps = [[34, 24, 50, 0.16], [126, 24, 50, 0.16]];
    } else {
      // néons et bras robotisé au plafond
      px(L, 4, WW, 1, '#5ef0ff'); px(L, 5, WW, 1, '#1c8ca8');
      px(20, 6, 120, 3, '#b8c6d6'); px(70, 9, 6, 12, '#8a9ab0'); px(66, 20, 14, 3, '#5a6a82'); px(72, 23, 2, 3, '#5ef0ff');
      lamps = [[80, 5, 110, 0.1]];
    }
    wallLight(g, b, T, FLOOR, lamps, lv === 3 || lv === 5 ? 0.8 : 0.66);
    // ---- le sol en perspective
    paintStorageFloor(g, b, lv);
    floorLight(g, b, FLOOR, lamps.map(([x, , r, k]) => [x, FLOOR + 30, r * 1.2, k * 0.6] as const), lv === 3 || lv === 5 ? 0.62 : 0.5);
    // ---- les rayonnages : montants, planches vues d'en haut ou d'en dessous, ombres sur le mur et au sol
    const { cell, rows, rowH, gap, gw, ox, base, top } = rackGrid(lv);
    const [post, postHi, plank, plankHi] =
      lv <= 2 ? ['#5a3a1c', '#7a5228', '#8a5a2c', '#c88a4a'] : lv === 3 ? ['#98a6b6', '#e8eef4', '#6c7a8c', '#c4d0dc'] : lv === 4 ? ['#2e5a9a', '#4e8ad0', '#e8742a', '#ffb070'] : ['#dce6f0', '#ffffff', '#8a9ab0', '#5ef0ff'];
    const feet = FLOOR + 5;
    boxShadow(g, b, { x: ox - 1, y: top - 1, w: gw + 6, h: FLOOR - top + 1 }, 5, 0.55); // ombre du meuble sur le mur
    shade(g, b, { x: ox - 10, y: FLOOR, w: gw + 20, h: 10 }, (x, y) => {
      const dx = Math.max(ox - 4 - x, 0, x - (ox + gw + 4)) / 6;
      return Math.min(1, 0.45 + 0.55 * Math.max(dx, (y - FLOOR) / 10));
    });
    for (const x of [ox - 4, ox + gw + 2]) { px(x, top - 3, 2, feet - top + 3, post); px(x, top - 3, 1, feet - top + 3, postHi); px(x, feet - 1, 3, 1, '#1b1424'); }
    if (lv <= 2 && cell >= 10) {
      // parpaings sous les montants du garage
      px(ox - 6, feet - 3, 6, 4, '#8a8a8a'); px(ox - 6, feet - 3, 6, 1, '#aaaaaa');
      px(ox + gw, feet - 3, 6, 4, '#8a8a8a'); px(ox + gw, feet - 3, 6, 1, '#aaaaaa');
    }
    for (let r = 0; r < rows; r++) {
      const y = base - r * rowH - gap;
      // l'ombre de la planche sur le mur, sous elle
      shade(g, b, { x: ox - 3, y: y + gap, w: gw + 6, h: 3 }, (_, yy) => 0.6 + (yy - y - gap) * 0.13);
      if (y > EYE_STORE) px(ox - 2, y - 1, gw + 4, 1, mixHex(plankHi, '#ffffff', 0.35)); // dessus de la planche, vu d'en haut
      px(ox - 3, y, gw + 6, gap, plank);
      px(ox - 3, y, gw + 6, 1, plankHi);
      if (y <= EYE_STORE) px(ox - 2, y + gap, gw + 4, 1, '#00000060'); // dessous, vu d'en bas
    }
    // places vides : la trace des caisses sur les planches
    const grid = rackGrid(lv);
    g.fillStyle = lv === 3 || lv === 5 ? '#00000018' : '#ffffff18';
    for (let i = 0; i < Math.min(grid.cap, rows * grid.cols); i++) {
      const x = ox + (i % grid.cols) * cell;
      const y = base - (Math.floor(i / grid.cols) + 1) * rowH;
      for (let k = 0; k < cell - 1; k += 2) g.fillRect(x + k, y + cell - 2, 1, 1);
    }
    // ---- le diable, et des caisses vides empilées contre lui
    const tx = TROLLEY.x;
    const ty = TROLLEY.y;
    dropShadow(g, b, tx + 16, ty + 70, 24, 4, 0.45);
    const metal = lv === 5 ? ['#ffffff', '#b8c6d6', '#8a9ab0'] : lv >= 3 ? ['#e8eef4', '#98a6b6', '#5a6a82'] : ['#e85a3a', '#a8483a', '#6e2a22'];
    px(tx, ty, 3, 62, metal[1]!); px(tx, ty, 1, 62, metal[0]!); px(tx + 30, ty, 3, 62, metal[1]!); px(tx + 30, ty, 1, 62, metal[0]!);
    px(tx - 4, ty - 4, 8, 3, '#2c283a'); px(tx + 28, ty - 4, 8, 3, '#2c283a'); // poignées
    for (const k of [14, 34]) px(tx + 2, ty + k, 30, 2, metal[2]!);
    trap(g, ty + 58, ty + 60, tx, tx + 34, tx - 2, tx + 36, metal[0]!); // bavette, vue d'en haut
    px(tx - 2, ty + 60, 38, 3, metal[2]!);
    for (const wx of [tx - 4, tx + 30]) { px(wx, ty + 62, 8, 8, '#1b1424'); px(wx + 2, ty + 64, 4, 4, '#545068'); px(wx + 3, ty + 65, 2, 2, '#98a6b6'); }
    const crate = lv === 5 ? ['#dce6f0', '#ffffff', '#8a9ab0'] : ['#a06830', '#d09050', '#5a3418'];
    for (let k = 0; k < 3; k++) {
      const cy = ty + 36 - k * 17;
      if (k === 2) trap(g, cy - 3, cy, tx + 6, tx + 27, tx + 4, tx + 29, crate[2]!); // l'intérieur de la caisse du haut
      px(tx + 4, cy, 25, 16, crate[0]!); px(tx + 4, cy, 25, 1, crate[1]!); px(tx + 4, cy + 15, 25, 1, crate[2]!);
      px(tx + 7, cy + 3, 19, 6, '#00000040');
      px(tx + 12, cy + 10, 9, 3, crate[2]!);
    }
    shade(g, b, { x: tx + 4, y: ty + 2, w: 25, h: 50 }, (x) => 1.05 - ((x - tx - 4) / 25) * 0.25);
    // ---- l'emplacement de la palette des commandes
    dropShadow(g, b, 122, 293, 32, 4, 0.45);
  }

  /** Une palette au premier plan : les caisses prêtes à partir quand une commande peut être remplie. */
  private drawPallet(game: Game, lv: number): void {
    const g = this.g;
    const px = painter(g);
    const x = 96;
    const y = 284;
    px(x, y, 52, 4, lv === 5 ? '#b8c6d6' : '#a06830');
    px(x, y, 52, 1, lv === 5 ? '#ffffff' : '#e8b070');
    for (const k of [0, 23, 47]) px(x + k, y + 4, 5, 4, lv === 5 ? '#8a9ab0' : '#744620');
    const o = game.readyOrders[0];
    if (!o) return;
    const beer = game.suitable(o).find((b) => b.stock > 0) ?? game.beers[0];
    if (!beer) return;
    const n = Math.min(8, Math.ceil(o.qty / 12));
    for (let i = 0; i < n; i++) {
      const cx = x + 2 + (i % 4) * 12;
      const cy = y - 12 - Math.floor(i / 4) * 12;
      drawCrate(g, cx, cy, 11, { beer, count: 12 });
    }
    // film étirable, autour des caisses posées
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x + 1, y - 12 * Math.ceil(n / 4) - 1, 12 * Math.min(4, n) + 2, 12 * Math.ceil(n / 4) + 1);
  }
}

/** Petit fût inox rangé au stockage, cerclé à la couleur de l'étiquette. */
export function drawKeg(g: CanvasRenderingContext2D, x: number, y: number, s: number, label: Label): void {
  const px = painter(g);
  const w = Math.max(3, Math.round(s * 0.8));
  const ox = x + Math.floor((s - w) / 2);
  px(ox, y, w, s, '#6c7a8c');
  px(ox + 1, y, Math.max(1, w - 2), s, '#c4d0dc');
  if (w >= 6) px(ox + 1, y, 1, s, '#ffffff');
  px(ox, y + Math.floor(s / 2), w, Math.max(1, Math.round(s / 6)), label.bg);
  if (s >= 8) { px(ox, y + 1, w, 1, '#98a6b6'); px(ox, y + s - 2, w, 1, '#98a6b6'); }
}

// =================================================================== bar

/** Le bar occupe les 2/3 du haut, la cave et ses fûts le tiers du bas. */
export const CELLAR_Y = 200;
/** Comptoir : dessus et façade. */
const COUNTER = { top: 112, front: 134, x0: 8, x1: 152 };
const BAR_HIT: Rect = { x: 0, y: 24, w: ROOM_W, h: CELLAR_Y - 24 };
/** Sol de la cave, où reposent les fûts. */
const KEG_FLOOR = 290;
/**
 * Coin du bar, en haut à droite, où s'installe l'objet de l'événement en cours (télé, cible, boule à facettes).
 * Le décor de chaque niveau laisse cette place libre.
 */
export const EVENT_SLOT: Rect = { x: 118, y: 0, w: 38, h: 44 };

interface Seat { x: number; y: number; kind: 'stool' | 'table' }

/** Les places : tabourets au comptoir d'abord, puis des tables devant. */
function seatsFor(level: number, n: number): Seat[] {
  const out: Seat[] = [];
  const stools = Math.min(n, level === 1 ? 2 : 6);
  const span = level === 1 ? 50 : COUNTER.x1 - COUNTER.x0 - 24;
  const start = level === 1 ? 48 : COUNTER.x0 + 12;
  for (let i = 0; i < stools; i++) out.push({ x: Math.round(start + (stools === 1 ? span / 2 : (span * i) / (stools - 1))), y: COUNTER.front + 14, kind: 'stool' });
  const rest = n - stools;
  for (let i = 0; i < rest; i++) {
    const tIdx = Math.floor(i / 2);
    const tx = 28 + (tIdx % 3) * 52;
    out.push({ x: tx + (i % 2 ? 9 : -9), y: 186, kind: 'table' });
  }
  return out;
}

/** Couleurs des clients : peau, cheveux, haut. */
const PEOPLE = [
  ['#e0a77f', '#3a2418', '#4ea8f0'], ['#c98563', '#1b1424', '#e85a3a'], ['#f0c8a0', '#e8b030', '#6cc040'],
  ['#8a5a3c', '#1b1424', '#f2c14e'], ['#e0a77f', '#a8483a', '#8a5cc8'], ['#f0c8a0', '#6a4422', '#40c0a8'],
  ['#b07850', '#e8e4dc', '#d4823a'], ['#e0a77f', '#2c283a', '#e8eef4'],
] as const;

export class BarRoom extends Room {
  /** Emplacement du fût de chaque tireuse, dans la cave. */
  kegRect(i: number, taps: number): Rect {
    const slot = (ROOM_W - 12) / taps;
    const w = Math.min(22, Math.floor(slot) - 4);
    const h = Math.round(w * 1.35);
    const x = Math.round(6 + slot * i + (slot - w) / 2);
    return { x, y: KEG_FLOOR - h, w, h };
  }

  /** Abscisse de la tireuse i sur le comptoir. */
  private tapX(i: number, taps: number, lv: number): number {
    const span = lv === 1 ? 30 : COUNTER.x1 - COUNTER.x0 - 30;
    const start = lv === 1 ? 58 : COUNTER.x0 + 15;
    return Math.round(start + (taps === 1 ? span / 2 : (span * i) / (taps - 1)));
  }

  hits(taps: number, eventOn = false): { id: string; rect: Rect }[] {
    const out = [{ id: 'counter', rect: BAR_HIT }];
    for (let i = 0; i < taps; i++) {
      const r = this.kegRect(i, taps);
      out.push({ id: `keg${i}`, rect: { x: r.x - 3, y: CELLAR_Y + 18, w: r.w + 6, h: KEG_FLOOR - CELLAR_Y - 14 } });
    }
    if (eventOn) out.push({ id: 'event', rect: EVENT_SLOT });
    return out;
  }

  /** L'objet de l'événement en cours, dans le coin en haut à droite : il n'est là que le temps de l'événement. */
  private drawEventItem(game: Game, lv: number, t: number): void {
    if (!game.partying) return;
    const ev = game.eventId;
    if (ev === 'foot') this.drawTv(lv, t);
    else if (ev === 'darts') this.drawDarts(lv, t);
    else this.drawDisco(t);
  }

  /** Grande télé suspendue : cathodique en bois au début, écran plat ensuite, verre et néon au dernier niveau. Le match défile. */
  private drawTv(lv: number, t: number): void {
    const g = this.g;
    const px = painter(g);
    const W = 34;
    const H = 24;
    const x = EVENT_SLOT.x + Math.floor((EVENT_SLOT.w - W) / 2);
    const y = 12;
    // suspentes
    px(x + 6, 0, 1, y, '#1b1424'); px(x + W - 7, 0, 1, y, '#1b1424');
    let sx: number, sy: number, sw: number, sh: number;
    if (lv <= 2) {
      px(x, y, W, H, '#1b1424');
      px(x + 1, y + 1, W - 2, H - 2, '#7a5228'); px(x + 1, y + 1, W - 2, 1, '#a8743c');
      [sx, sy, sw, sh] = [x + 3, y + 3, W - 12, H - 6];
      px(sx - 1, sy - 1, sw + 2, sh + 2, '#3a2c20');
      px(x + W - 7, y + 5, 4, 4, '#c4b090'); px(x + W - 6, y + 6, 2, 2, '#5a4a3a');
      px(x + W - 7, y + 12, 4, 4, '#c4b090'); px(x + W - 6, y + 13, 2, 2, '#5a4a3a');
    } else {
      const frame = lv === 5 ? '#dce6f0' : '#1b1424';
      px(x, y, W, H - 2, frame);
      if (lv === 5) { px(x, y + H - 3, W, 1, '#5ef0ff'); px(x, y, W, 1, '#ffffff'); }
      else px(x, y, W, 1, '#545068');
      [sx, sy, sw, sh] = [x + 1, y + 1, W - 2, H - 4];
    }
    // le match : pelouse rayée, ligne médiane, rond central, joueurs et ballon
    for (let i = 0; i < sw; i += 4) px(sx + i, sy, Math.min(2, sw - i), sh, '#2c8a4a');
    for (let i = 2; i < sw; i += 4) px(sx + i, sy, Math.min(2, sw - i), sh, '#33a052');
    const mid = sx + Math.floor(sw / 2);
    px(mid, sy, 1, sh, '#c8f0d0');
    g.strokeStyle = '#c8f0d0'; g.lineWidth = 1;
    g.strokeRect(mid - 2.5, sy + sh / 2 - 2.5, 5, 5);
    const bx = mid + Math.round(Math.sin(t * 1.3) * (sw / 2 - 3));
    const by = sy + Math.round(sh / 2 + Math.sin(t * 2.1) * (sh / 2 - 2));
    for (let i = 0; i < 3; i++) {
      px(bx - 4 + Math.round(Math.sin(t * 1.7 + i * 2) * 3) - i * 3, sy + 2 + i * 4, 1, 2, '#e8553a');
      px(bx + 3 + Math.round(Math.cos(t * 1.5 + i) * 3) + i * 2, sy + 3 + i * 4, 1, 2, '#3f88d4');
    }
    px(bx, by, 1, 1, '#ffffff');
    // reflet
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(sx, sy, sw, 2);
  }

  /** Cible de fléchettes sur son panneau (liège, puis bois sombre, puis blanc laqué) ; les fléchettes se plantent. */
  private drawDarts(lv: number, t: number): void {
    const g = this.g;
    const px = painter(g);
    const S = 28;
    const x = EVENT_SLOT.x + Math.floor((EVENT_SLOT.w - S) / 2);
    const y = 10;
    const panel = lv <= 2 ? ['#a8743c', '#7a5228'] : lv <= 4 ? ['#3a2418', '#241410'] : ['#f4f8fc', '#c4d0dc'];
    px(x, y, S, S, '#1b1424'); px(x + 1, y + 1, S - 2, S - 2, panel[0]!); px(x + 1, y + S - 3, S - 2, 2, panel[1]!);
    const cx = x + S / 2;
    const cy = y + S / 2;
    for (const [r, c] of [[11, '#1b1424'], [10, '#b83a24'], [9, '#1b1424'], [8, '#e8dcc0'], [6, '#2c8a4a'], [5, '#e8dcc0'], [3, '#b83a24'], [1.5, '#2c8a4a']] as const) {
      g.fillStyle = c; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
    // secteurs
    g.strokeStyle = 'rgba(27,20,36,0.5)';
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); g.stroke(); }
    // trois fléchettes, relancées à tour de rôle
    for (let i = 0; i < 3; i++) {
      const round = Math.floor(t * 0.7 + i / 3);
      const a = hash(round, i) * Math.PI * 2;
      const d = hash(round, i + 7) * 8;
      const fx = Math.round(cx + Math.cos(a) * d);
      const fy = Math.round(cy + Math.sin(a) * d);
      px(fx, fy, 1, 1, '#1b1424'); px(fx + 1, fy - 1, 1, 1, '#c4d0dc'); px(fx + 2, fy - 2, 2, 1, '#f2c14e'); px(fx + 3, fy - 3, 1, 1, '#e8553a');
    }
  }

  /** Boule à facettes de la fête : elle tourne, ses facettes scintillent. */
  private drawDisco(t: number): void {
    const g = this.g;
    const px = painter(g);
    const cx = EVENT_SLOT.x + Math.floor(EVENT_SLOT.w / 2);
    const cy = 24;
    const r = 9;
    px(cx, 0, 1, cy - r, '#c4d0dc');
    g.fillStyle = '#1b1424'; g.beginPath(); g.arc(cx + 0.5, cy + 0.5, r + 1, 0, Math.PI * 2); g.fill();
    const spin = Math.floor(t * 6);
    for (let y = -r; y <= r; y += 2) for (let x = -r; x <= r; x += 2) {
      if (x * x + y * y > r * r) continue;
      const k = hash(x * 31 + y + spin * 7, y);
      const col = k > 0.9 ? '#ffffff' : k > 0.6 ? '#dce6f0' : k > 0.3 ? '#98a6b6' : '#6c7a8c';
      px(cx + x, cy + y, 2, 2, col);
    }
    // éclats autour
    for (let i = 0; i < 4; i++) {
      if (hash(spin, i) < 0.5) continue;
      const a = hash(spin, i + 3) * Math.PI * 2;
      const sx = Math.round(cx + Math.cos(a) * (r + 4));
      const sy = Math.round(cy + Math.sin(a) * (r + 4));
      px(sx, sy - 1, 1, 3, '#ffffff'); px(sx - 1, sy, 3, 1, '#ffffff');
    }
  }

  protected levelOf(game: Game): number {
    return game.barLevel;
  }

  draw(game: Game, t: number): void {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    const lv = game.barLevel;
    this.begin(lv, t);
    this.drawBoard(game, lv);
    this.drawEventItem(game, lv, t);
    const labels = game.taps.map((tp) => (tp.glasses > 0 ? game.beer(tp.beerId)?.label ?? null : null));
    this.drawTaps(labels, game.taps.length, lv);
    this.drawBartender(game, lv, t);
    this.drawGuests(game, lv, t);
    if (lv === 1) this.dust(t);
    if (lv === 5) {
      const k = 0.5 + 0.5 * Math.sin(t * 2);
      g.fillStyle = `rgba(94,240,255,${0.25 + 0.2 * k})`;
      g.fillRect(COUNTER.x0, COUNTER.front - 1, COUNTER.x1 - COUNTER.x0, 1);
    }
    if (game.partying && game.eventId === 'party') this.party(t); // projecteurs et confettis : seulement pour la fête
    this.drawCellar(game, lv, t);
    if (this.selected === 'counter') this.outline(BAR_HIT, t);
  }

  /** Fête : projecteurs de couleur qui balaient la salle, confettis. */
  private party(t: number): void {
    const g = this.g;
    const cols = ['255,90,208', '94,240,255', '242,193,78', '126,224,129'];
    for (let i = 0; i < 4; i++) {
      const x = 20 + i * 40;
      const sweep = Math.sin(t * 1.6 + i * 1.7) * 40;
      g.fillStyle = `rgba(${cols[i]},0.13)`;
      g.beginPath(); g.moveTo(x - 2, this.b.T); g.lineTo(x + 2, this.b.T); g.lineTo(x + sweep + 18, CELLAR_Y); g.lineTo(x + sweep - 18, CELLAR_Y); g.fill();
    }
    for (let i = 0; i < 40; i++) {
      const k = (t * 0.25 + hash(i, 21)) % 1;
      const x = (hash(i, 22) * ROOM_W + Math.sin(t * 2 + i) * 6 + ROOM_W) % ROOM_W;
      g.fillStyle = ['#ff5ad0', '#5ef0ff', '#f2c14e', '#7ee081', '#ffffff'][i % 5]!;
      g.fillRect(Math.round(x), Math.round(k * CELLAR_Y), 2, 1);
    }
  }

  /** Poussière qui danse dans le rai de lumière du comptoir poussiéreux. */
  private dust(t: number): void {
    const g = this.g;
    for (let i = 0; i < 16; i++) {
      const k = (t * 0.05 + hash(i, 3)) % 1;
      const x = 64 + hash(i, 4) * 40 + Math.sin(t * 0.7 + i) * 4 + k * 12;
      const y = 20 + k * 100;
      g.fillStyle = `rgba(255,240,200,${0.5 * Math.sin(k * Math.PI)})`;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  protected paintBackground(g: CanvasRenderingContext2D, lv: number): void {
    const px = painter(g);
    const W = ROOM_W;
    const { L, R, T, B } = this.b;
    const WW = R - L;
    const m = (a: number, n: number) => ((a % n) + n) % n;
    const back = COUNTER.top;
    wall(g, px, lv <= 2 ? 'plank' : lv === 3 ? 'green' : lv === 4 ? 'brick' : 'future', COUNTER.front, this.b);
    if (lv === 1) {
      // bois grisé par la poussière, fissure, toiles d'araignée, une seule ampoule
      g.fillStyle = 'rgba(90,80,70,0.45)'; g.fillRect(L, T, WW, COUNTER.front - T);
      px(104, 26, 1, 10, '#3a2c20'); px(105, 35, 1, 8, '#3a2c20');
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      for (const [x0, dir] of [[L, 1], [R - 1, -1]] as const) {
        g.beginPath();
        g.moveTo(x0, 1); g.lineTo(x0 + dir * 18, 1); g.moveTo(x0, 1); g.lineTo(x0, 20); g.moveTo(x0, 1); g.lineTo(x0 + dir * 14, 14);
        g.moveTo(x0 + dir * 6, 1); g.lineTo(x0, 7); g.moveTo(x0 + dir * 11, 1); g.lineTo(x0, 12);
        g.stroke();
      }
      px(80, T, 1, 14 - T, '#1b1424'); px(78, 14, 5, 5, '#f0d890'); px(79, 15, 3, 3, '#fff4b0');
      g.fillStyle = 'rgba(255,230,160,0.06)';
      g.beginPath(); g.moveTo(76, 18); g.lineTo(85, 18); g.lineTo(118, back); g.lineTo(44, back); g.fill();
      g.save(); g.translate(22, 30); g.rotate(-0.12);
      px(0, 0, 34, 11, '#5a3a1c'); px(1, 1, 32, 9, '#e8dcc0');
      g.fillStyle = '#a8483a'; g.font = '8px monospace'; g.fillText('OUVERT', 2, 8);
      g.restore();
    } else if (lv === 2) {
      for (const lx of [36, 100]) {
        px(lx, 0, 1, 14, '#1b1424'); px(lx - 5, 14, 11, 4, '#2c5a3a'); px(lx - 3, 18, 7, 1, '#fff4b0');
        g.fillStyle = 'rgba(255,220,140,0.07)'; g.beginPath(); g.moveTo(lx - 4, 18); g.lineTo(lx + 5, 18); g.lineTo(lx + 24, back); g.lineTo(lx - 23, back); g.fill();
      }
    } else if (lv === 3) {
      px(L, 76, WW, COUNTER.front - 76, '#4a2c14');
      for (let x = from(0, 20, L); x < R; x += 20) { px(x + 2, 80, 16, 26, '#5a3a1c'); px(x + 2, 80, 16, 1, '#744620'); }
      for (const lx of [24, 64, 104]) { px(lx, 0, 1, 8, '#8a5c14'); px(lx - 4, 8, 9, 3, '#e8b030'); px(lx - 3, 11, 7, 1, '#fff4b0'); }
    } else if (lv === 4) {
      px(30, 4, 72, 16, '#1b1424');
      g.fillStyle = '#ff5ad0'; g.font = '11px monospace'; g.fillText('BREW IT', 40, 16);
      g.fillStyle = 'rgba(255,90,208,0.10)'; g.fillRect(26, 0, 80, 24);
      for (const lx of [14, 110]) { px(lx, 0, 1, 22, '#1b1424'); px(lx - 6, 22, 13, 5, '#2c283a'); px(lx - 5, 27, 11, 1, '#fff4b0'); }
    } else {
      px(8, 4, 104, 22, '#0c1420');
      for (let i = 0; i < 26; i++) px(9 + ((i * 37) % 102), 5 + ((i * 13) % 9), 1, 1, i % 5 ? '#ffffff' : '#5ef0ff');
      for (let i = 0; i < 12; i++) { const h = 5 + ((i * 11) % 10); px(10 + i * 8, 26 - h, 6, h, '#1c2a44'); px(11 + i * 8, 27 - h, 1, 1, '#f2c14e'); }
      px(8, 3, 104, 1, '#5ef0ff'); px(8, 26, 104, 1, '#5ef0ff');
    }
    // étagères de bouteilles derrière le comptoir (vides et poussiéreuses au début)
    const shelves = lv === 1 ? [70] : lv <= 3 ? [66, 90] : [58, 78, 98];
    for (const sy of shelves) {
      px(14, sy, W - 28, 2, lv === 5 ? '#dce6f0' : '#5a3a1c'); px(14, sy, W - 28, 1, lv === 5 ? '#ffffff' : '#8a5a2c');
      const n = lv === 1 ? 4 : 12;
      for (let i = 0; i < n; i++) {
        if (lv === 1 && i === 2) continue;
        const bx = 18 + Math.floor(((W - 40) * i) / Math.max(1, n - 1)) + (lv === 1 ? Math.floor(hash(i, sy) * 20) : 0);
        const hgt = 8 + Math.floor(hash(i, sy + 1) * 4);
        const col = lv === 1 ? '#6a6458' : ['#2c5a3a', '#6e3a08', '#a85c26', '#245c56', '#842416'][Math.floor(hash(i, sy + 2) * 5)]!;
        px(bx, sy - hgt, 5, hgt, col); px(bx + 1, sy - hgt - 3, 3, 3, col); px(bx + 1, sy - hgt + 2, 1, hgt - 4, '#ffffff40');
        if (lv === 1) px(bx, sy - hgt - 3, 5, 1, '#a89e8e');
      }
    }
    if (lv >= 2) {
      // ardoise ou écran de la carte
      px(60, 30, 40, lv === 2 ? 24 : 20, lv === 5 ? '#0c1420' : '#2a3030');
      px(59, 29, 42, 1, '#8a5a2c');
    }
    // comptoir
    const { top, front, x0, x1 } = COUNTER;
    const wood = lv === 1 ? ['#8a7a68', '#6a5a4a', '#4a3e32'] : lv === 5 ? ['#ffffff', '#dce6f0', '#8a9ab0'] : lv === 4 ? ['#c4d0dc', '#98a6b6', '#465264'] : ['#c88a4a', '#8a5a2c', '#5a3a1c'];
    px(x0 - 2, top, x1 - x0 + 4, 4, wood[0]!); px(x0 - 2, top + 3, x1 - x0 + 4, 1, wood[2]!);
    px(x0, top + 4, x1 - x0, front - top - 4, wood[1]!);
    for (let x = x0 + 4; x < x1; x += lv === 4 ? 6 : 12) px(x, top + 6, 1, front - top - 8, wood[2]!);
    if (lv === 3) px(x0, front - 4, x1 - x0, 2, '#e8b030');
    if (lv === 1) for (let i = 0; i < 10; i++) px(x0 + Math.floor(hash(i, 9) * (x1 - x0)), top + 1, 3, 1, '#a89e8e');
    // sol de la salle
    const f = front;
    const fh = CELLAR_Y - f;
    if (lv === 1) {
      px(L, f, WW, fh, '#5a4a3a');
      for (let y = f; y < CELLAR_Y; y += 6) { px(L, y, WW, 1, '#3a2e24'); for (let x = from((y * 7) % 30, 30, L); x < R; x += 30) px(x, y, 1, 6, '#3a2e24'); }
      for (let i = 0; i < Math.round((25 * WW) / W); i++) px(L + Math.floor(hash(i, 5) * WW), f + Math.floor(hash(i, 6) * fh), 2, 1, '#6e5e4c');
      // vieux tonneau, caisse de bouteilles vides, balai oublié
      const bx = 116, by = 166;
      px(bx, by, 18, 24, '#6a4422'); px(bx + 2, by, 14, 24, '#7a5228'); px(bx + 5, by, 5, 24, '#8a5a2c');
      for (const yy of [by + 4, by + 18]) px(bx, yy, 18, 2, '#4a4038');
      px(bx - 1, by - 2, 20, 3, '#5a3a1c'); px(bx - 1, by - 2, 20, 1, '#8a7a68');
      px(16, 178, 24, 12, '#6a5a4a'); px(16, 178, 24, 1, '#8a7a68');
      for (let i = 0; i < 4; i++) { px(19 + i * 5, 171, 3, 8, '#4a5a4a'); px(20 + i * 5, 168, 1, 3, '#4a5a4a'); }
      for (let i = 0; i < 16; i++) px(152 - Math.floor(i * 0.5), 140 + i * 3, 1, 3, '#8a5a2c');
      px(141, 186, 8, 6, '#c8a860');
    } else if (lv === 2) {
      for (let j = 0; f + j * 8 < CELLAR_Y; j++) for (let x = from(0, 8, L); x < R; x += 8) px(x, f + j * 8, 8, 8, m(x / 8 + j, 2) ? '#e8e4dc' : '#3e3a50');
    } else if (lv === 3) {
      px(L, f, WW, fh, '#6a2a22');
      for (let y = f + 4; y < CELLAR_Y; y += 12) for (let x = from((y % 24) ? 0 : 6, 12, L); x < R; x += 12) px(x, y, 4, 4, '#8a3a2a');
    } else if (lv === 4) {
      px(L, f, WW, fh, '#5a5e64');
      for (let i = 0; i < Math.round((40 * WW) / W); i++) px(L + Math.floor(hash(i, 7) * WW), f + Math.floor(hash(i, 8) * fh), 1, 1, '#4a4e54');
    } else {
      px(L, f, WW, fh, '#1c2230');
      for (let y = f; y < CELLAR_Y; y += 10) px(L, y, WW, 1, '#2a3244');
    }
    px(L, f, WW, 2, '#00000060');
    // ---------------------------------------------------------------- la cave
    const c = CELLAR_Y;
    // dalle du plancher
    px(L, c, WW, 6, lv === 5 ? '#b8c6d6' : lv === 4 ? '#6a6e74' : '#4a2e14');
    px(L, c, WW, 1, lv === 5 ? '#ffffff' : lv === 4 ? '#8a8e94' : '#7a5228');
    for (let x = from(6, 22, L); x < R; x += 22) px(x, c + 6, 4, 6, lv >= 4 ? '#3e3a50' : '#3a240e'); // solives
    // mur de cave : pierre, brique ou béton selon le niveau
    const cw = c + 6;
    if (lv <= 3) {
      px(L, cw, WW, B - cw, '#2e2622');
      for (let y = cw, row = 0; y < B; y += 8, row++)
        for (let x = from(-((row * 5) % 14), 14, L - 14); x < R; x += 14) { px(x + 1, y + 1, 12, 6, ['#3e342c', '#38302a', '#443a30'][(x + row) & 1 ? 0 : row % 3]!); px(x + 1, y + 1, 12, 1, '#4e4236'); }
    } else if (lv === 4) {
      px(L, cw, WW, B - cw, '#3a3e46');
      for (let y = cw; y < B; y += 12) px(L, y, WW, 1, '#2c3038');
    } else {
      px(L, cw, WW, B - cw, '#141a26');
      for (let y = cw + 10; y < B; y += 20) px(L, y, WW, 1, '#1c8ca8');
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(L, cw, WW, 6); // ombre sous le plancher
    // sol de la cave
    px(L, KEG_FLOOR, WW, B - KEG_FLOOR, lv === 5 ? '#0c1018' : '#1e1814');
    px(L, KEG_FLOOR, WW, 1, lv === 5 ? '#5ef0ff' : '#4a3e32');
    if (lv <= 2) {
      // soupirail
      px(66, cw + 4, 28, 8, '#1b1424'); px(67, cw + 5, 26, 6, '#2a3a5a');
      for (let x = 70; x < 92; x += 4) px(x, cw + 5, 1, 6, '#1b1424');
    }
  }

  /** La cave : un fût par tireuse, relié au comptoir par un tuyau ; sa jauge baisse à chaque verre. */
  private drawCellar(game: Game, lv: number, t: number): void {
    const g = this.g;
    const px = painter(g);
    const n = game.taps.length;
    for (let i = 0; i < n; i++) {
      const tap = game.taps[i]!;
      const r = this.kegRect(i, n);
      const beer = game.beer(tap.beerId);
      const level = tap.glasses / Math.max(1, tap.capacity);
      const cx = r.x + Math.floor(r.w / 2);
      // tuyau jusqu'à la tireuse (traverse le plancher)
      const tx = this.tapX(i, n, lv);
      const pipe = lv === 1 ? '#8a8070' : lv === 5 ? '#5ef0ff' : '#b88420';
      px(cx, CELLAR_Y + 6, 1, r.y - CELLAR_Y - 6, pipe);
      px(Math.min(cx, tx), CELLAR_Y + 3, Math.abs(cx - tx) + 1, 1, pipe);
      if (!beer) {
        // pas de fût : silhouette et « + »
        g.fillStyle = '#ffffff30';
        for (let k = 0; k < r.h; k += 2) { g.fillRect(r.x, r.y + k, 1, 1); g.fillRect(r.x + r.w - 1, r.y + k, 1, 1); }
        for (let k = 0; k < r.w; k += 2) { g.fillRect(r.x + k, r.y, 1, 1); g.fillRect(r.x + k, r.y + r.h - 1, 1, 1); }
        px(cx - 3, r.y + Math.floor(r.h / 2), 7, 1, '#f2c14e');
        px(cx, r.y + Math.floor(r.h / 2) - 3, 1, 7, '#f2c14e');
        continue;
      }
      // fût inox : corps, cerclages, jauge
      const steel = lv === 1 ? ['#c8c0b0', '#a89e8e', '#7a7062', '#5a5246'] : ['#e8eef4', '#c4d0dc', '#98a6b6', '#6c7a8c'];
      px(r.x, r.y, r.w, r.h, steel[3]!);
      px(r.x + 1, r.y, r.w - 2, r.h, steel[1]!);
      px(r.x + 2, r.y, 2, r.h, steel[0]!);
      px(r.x + r.w - 3, r.y, 2, r.h, steel[2]!);
      for (const yy of [r.y + 2, r.y + r.h - 4]) px(r.x, yy, r.w, 2, steel[2]!);
      px(cx - 2, r.y - 2, 5, 2, '#2c283a'); // tête de soutirage
      // jauge : fenêtre où l'on voit la bière
      const gx = r.x + r.w - 6;
      const gy = r.y + 5;
      const gh = r.h - 10;
      px(gx, gy, 3, gh, '#1b1424');
      const fill = Math.round(gh * level);
      if (fill > 0) { px(gx, gy + gh - fill, 3, fill, '#e8a530'); px(gx, gy + gh - fill, 3, 1, '#fff1c8'); }
      // étiquette de la bière
      drawMiniLabel(g, beer.label, r.x + 3, r.y + Math.floor(r.h / 2) - 3, Math.min(7, r.w - 10));
      if (tap.glasses <= 0) {
        // vide : à changer
        g.fillStyle = 'rgba(27,20,36,0.45)'; g.fillRect(r.x, r.y, r.w, r.h);
        if (Math.floor(t * 2) % 2 === 0) { px(cx - 1, r.y - 9, 3, 5, '#e8553a'); px(cx - 1, r.y - 3, 3, 1, '#e8553a'); }
      }
      if (this.selected === `keg${i}`) this.outline(r, t);
    }
  }

  /** Ardoise de la carte : les bières qui coulent. */
  private drawBoard(game: Game, lv: number): void {
    if (lv < 2) return;
    const px = painter(this.g);
    const shown = game.taps.filter((tp) => tp.beerId != null).slice(0, 3);
    shown.forEach((tp, i) => {
      const b = game.beer(tp.beerId)!;
      drawMiniLabel(this.g, b.label, 63, 33 + i * 6, 5);
      px(70, 35 + i * 6, 8 + (b.name.length % 5) * 3, 1, lv === 5 ? '#5ef0ff' : '#e8e4dc');
      px(92, 35 + i * 6, 5, 1, tp.glasses > 0 ? '#f2c14e' : '#a8483a');
    });
  }

  /** Une tireuse par fût ; sa poignée prend la couleur de l'étiquette (grise quand le fût est vide). */
  private drawTaps(labels: (Label | null)[], taps: number, lv: number): void {
    const g = this.g;
    const px = painter(g);
    const { top } = COUNTER;
    for (let i = 0; i < taps; i++) {
      const x = this.tapX(i, taps, lv);
      const label = labels[i];
      const metal = lv === 5 ? PAL.st : lv === 1 ? ['#c8c0b0', '#a89e8e', '#8a8070', '#6a6050', '#4a4038', '#2a2420'] : PAL.br;
      px(x - 2, top - 4, 5, 4, metal[3]!); px(x - 2, top - 4, 5, 1, metal[1]!);
      px(x - 1, top - 9, 3, 5, metal[2]!);
      px(x + 2, top - 7, 3, 2, metal[2]!);
      px(x - 1, top - 18, 3, 9, '#1b1424');
      px(x, top - 17, 1, 7, label ? label.bg : '#5c4a6e');
      if (label) drawMiniLabel(g, label, x - 2, top - 23, 5);
      else px(x - 1, top - 20, 3, 2, '#3e3a50');
    }
  }

  /** Gaston au comptoir, qui essuie un verre. */
  private drawBartender(game: Game, lv: number, t: number): void {
    // le barman en renfort, gilet sombre et nœud papillon, de l'autre côté des tireuses
    if (game.barmanOn) this.drawHelper(game, lv === 1 ? 26 : 16, t);
    const px = painter(this.g);
    const x = lv === 1 ? 106 : 128;
    const y = COUNTER.top - 26;
    px(x, y, 10, 4, '#e8e4dc');
    px(x + 1, y + 3, 8, 7, '#e0a77f');
    px(x + 2, y + 5, 1, 1, '#2b2135'); px(x + 6, y + 5, 1, 1, '#2b2135');
    px(x + 2, y + 8, 6, 2, '#f3efe6');
    px(x - 1, y + 10, 12, 16, '#4f7a5a');
    px(x + 2, y + 12, 6, 14, '#e8dcc0');
    if (game.barServing) {
      const k = Math.round(Math.sin(t * 4) * 2);
      px(x + 10 + k, y + 14, 4, 6, '#c8f0e8');
      px(x + 9 + k, y + 16, 2, 3, '#e0a77f');
    }
  }

  /** Barman embauché en renfort. */
  private drawHelper(game: Game, x: number, t: number): void {
    const px = painter(this.g);
    const y = COUNTER.top - 26;
    px(x + 1, y, 8, 3, '#4a2a14');
    px(x + 1, y + 3, 8, 7, '#c98563');
    px(x + 2, y + 5, 1, 1, '#2b2135'); px(x + 6, y + 5, 1, 1, '#2b2135');
    px(x - 1, y + 10, 12, 16, '#2c283a');
    px(x + 3, y + 10, 4, 16, '#f3efe6');
    px(x + 3, y + 10, 4, 2, '#b83a24');
    // il essuie un verre
    const k = Math.round(Math.sin(t * 3) * 1.5);
    px(x + 10, y + 13 + k, 4, 5, '#c8f0e8');
    px(x + 9, y + 15 + k, 2, 3, '#c98563');
  }

  /**
   * Les clients occupent les places selon l'affluence : rares au début (un client toutes les 10 minutes),
   * nombreux quand la marque est populaire. Chacun reste un moment puis laisse la place.
   */
  private drawGuests(game: Game, lv: number, t: number): void {
    const g = this.g;
    const px = painter(g);
    const seats = seatsFor(lv, game.bar.seats);
    const serving = game.barServing;
    // un client reste ~20 min : la salle compte en moyenne affluence × 20 personnes
    const busy = serving ? Math.min(0.95, (game.barRate * 20) / seats.length) : 0;
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i]!;
      if (s.kind === 'stool') {
        px(s.x - 4, s.y - 2, 9, 2, lv === 5 ? '#dce6f0' : lv === 1 ? '#6a5a4a' : '#8a5a2c');
        px(s.x, s.y, 1, 10, '#2c283a');
        px(s.x - 3, s.y + 9, 7, 1, '#2c283a');
      } else if (i % 2 === 1 || i === seats.length - 1) {
        const mate = seats[i - 1]?.kind === 'table' && i % 2 === 1 ? seats[i - 1]! : s;
        const tx = Math.round((s.x + mate.x) / 2);
        px(tx - 7, s.y - 8, 15, 2, lv === 5 ? '#ffffff' : '#a06830');
        px(tx, s.y - 6, 1, 12, '#2c283a');
      }
    }
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i]!;
      const period = 40 + hash(i, 11) * 40;
      const slot = Math.floor((t + hash(i, 12) * period) / period);
      const phase = ((t + hash(i, 12) * period) % period) / period;
      if (!(serving && hash(i, slot) < busy)) continue;
      const [skin, hair, shirt] = PEOPLE[Math.floor(hash(i, slot + 99) * PEOPLE.length)]!;
      if (s.kind === 'stool') {
        px(s.x - 4, s.y - 13, 9, 11, shirt);
        px(s.x - 4, s.y - 13, 1, 11, '#00000030');
        px(s.x - 3, s.y - 20, 7, 7, hair);
        px(s.x - 3, s.y - 15, 1, 2, skin);
        px(s.x + 3, s.y - 15, 1, 2, skin);
        px(s.x - 2, s.y - 3, 2, 3, '#2c283a'); px(s.x + 1, s.y - 3, 2, 3, '#2c283a');
      } else {
        const right = i % 2 === 0;
        px(s.x - 3, s.y - 12, 7, 10, shirt);
        px(s.x - 2, s.y - 18, 5, 6, skin);
        px(s.x - 2, s.y - 19, 5, 2, hair);
        px(right ? s.x + 2 : s.x - 2, s.y - 16, 1, 1, '#2b2135');
      }
      const gx = s.kind === 'stool' ? s.x - 1 : s.x + (i % 2 === 0 ? 5 : -7);
      const gy = s.kind === 'stool' ? COUNTER.top - 6 : s.y - 14;
      const level = Math.max(0, 1 - phase * 1.1);
      px(gx, gy, 3, 6, '#c8f0e880');
      const lh = Math.round(5 * level);
      if (lh > 0) { px(gx, gy + 6 - lh, 3, lh, '#e8a530'); px(gx, gy + 6 - lh, 3, 1, '#fff1c8'); }
    }
    if (!serving) {
      px(70, COUNTER.top - 9, 22, 9, '#1b1424');
      px(71, COUNTER.top - 8, 20, 7, '#e8dcc0');
      g.fillStyle = '#a8483a';
      g.font = '6px monospace';
      g.fillText('À SEC', 72, COUNTER.top - 2);
    }
  }
}
