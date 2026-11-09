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
import { boxShadow, dropShadow, ellipseShadow, floor, floorLight, from, mix, rgb, seam, shade, dim, trap, wallLight, type Bounds } from './space';
import { BAR } from '../core/market';
import { barLayout } from './barLayout';
import { clearDecorCache, decorLights, drawDecor, paintDecor } from './decor';
import { drawBeltBand, drawBeltBottle, drawBeltKeg, LINE, lineArrived, lineItems, lineState, paintBelt } from './scene';
import type { RoomKey } from './decorLayout';

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
  /** La pièce, pour ses décors (decorLayout). */
  abstract readonly key: RoomKey;
  /** Aperçu (captures de contrôle) : le niveau affiché, et tout le mobilier. */
  preview: { level: number; event?: 'party' | 'foot' | 'darts' } | null = null;

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
    clearDecorCache();
  }

  /** Niveau affiché : celui de la pièce, ou celui de l'aperçu. */
  protected lv(game: Game): number {
    return this.preview?.level ?? this.levelOf(game);
  }

  /** Les décors redessinés à chaque image : derrière le reste (après begin) ou devant tout (à la fin). */
  protected decor(game: Game, lv: number, t: number, front: boolean): void {
    drawDecor(this.g, { room: this.key, lv, t, game, preview: !!this.preview, top: this.b.T }, front);
  }

  /** Lumières des lampes posées dans la pièce. */
  protected lights(lv: number): [number, number, number, number][] {
    return decorLights(this.key, lv);
  }

  protected background(level: number, t: number, key = level): HTMLCanvasElement {
    if (t - this.checkedAt > 1) {
      this.checkedAt = t;
      const bg = this.bgs.get(key);
      try {
        if (bg && bg.getContext('2d')!.getImageData(0, 0, 1, 1).data[3] === 0) this.invalidate();
      } catch {
        this.invalidate();
      }
    }
    let c = this.bgs.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = this.canvas.width;
      c.height = this.canvas.height;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.translate(this.b.ox, this.b.oy);
      this.paintBackground(g, level);
      paintDecor(g, { room: this.key, lv: level, t, game: null, preview: !!this.preview, top: this.b.T });
      this.bgs.set(key, c);
    }
    return c;
  }

  /** Début d'une image : le décor, puis on dessine dans le plan de la pièce. */
  /** key : la clé du décor en cache (le niveau, par défaut). */
  protected begin(level: number, t: number, key = level): void {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.background(level, t, key), 0, 0);
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
/** La palette des commandes, au premier plan au centre. */
const PALLET = { x: 64, y: 284 };
/** Point de fuite du stockage : au milieu, à hauteur des yeux. */
const EYE_STORE = 128;
const STORAGE_CRATES = STORAGE.map((s) => s.crates);

/** Taille minimum d'une caisse à l'écran : en dessous, on ne lit plus l'étiquette. */
const MIN_CELL = 13;

/**
 * La grille des rayonnages d'un niveau : la plus grande taille de caisse qui fait tout tenir, sans descendre
 * sous MIN_CELL. Quand ça ne tient plus, chaque case représente plusieurs caisses (per).
 */
function rackGrid(lv: number) {
  const crateCap = STORAGE_CRATES[lv - 1]!;
  const fit = (cell: number) => {
    const gap = Math.max(1, Math.round(cell / 6));
    const cols = Math.floor((RACKS.w - 6) / cell);
    return { gap, cols, maxRows: Math.floor((RACKS.h - 4) / (cell + gap)) };
  };
  let cell = 34;
  for (; cell > MIN_CELL; cell--) {
    const f = fit(cell);
    if (Math.ceil(crateCap / f.cols) <= f.maxRows) break;
  }
  const { gap, cols: maxCols, maxRows } = fit(cell);
  const per = Math.max(1, Math.ceil(crateCap / (maxCols * maxRows)));
  const cap = Math.ceil(crateCap / per);
  const rows = Math.ceil(cap / maxCols);
  const cols = Math.min(maxCols, Math.ceil(cap / rows));
  const rowH = cell + gap;
  const gw = cols * cell;
  const ox = RACKS.x + Math.floor((RACKS.w - gw) / 2);
  const base = RACKS.y + RACKS.h;
  return { per, cap, cell, cols, rows, gap, rowH, gw, ox, base, top: base - rows * rowH };
}

/** Taille de la caisse au bout du tapis, et durée de son trajet jusqu'à l'étagère (s). */
const CRATE_AT_END = 20;
const FLY = 0.9;

type BeerT = Game['beers'][number];
/** Où va chaque caisse et chaque fût sur les étagères : les fûts depuis le bas à droite, les caisses depuis le bas à gauche. */
function rackPlan(beers: BeerT[], lv: number) {
  const { per, cap, cell, cols, rows, rowH, ox, base } = rackGrid(lv);
  const cells = Math.min(cap, rows * cols);
  const kegs: BeerT[] = [];
  for (const beer of beers) for (let k = 0; k < Math.ceil(beer.kegs.length / per); k++) kegs.push(beer);
  kegs.splice(cells);
  const crates = (per === 1 ? crateList(beers) : beers.flatMap((beer) => {
    const out: { beer: BeerT; count: number }[] = [];
    for (let left = beer.stock; left > 0; left -= 12 * per) out.push({ beer, count: Math.max(1, Math.round(Math.min(left, 12 * per) / per)) });
    return out;
  })).slice(0, cells - kegs.length);
  const at = (i: number) => ({ x: ox + (i % cols) * cell, y: base - (Math.floor(i / cols) + 1) * rowH });
  const kegCells = kegs.map((_, k) => Math.floor(k / cols) * cols + (cols - 1 - (k % cols)));
  const used = new Set<number>(kegCells);
  const items: { x: number; y: number; keg: boolean; beer: BeerT; beerId: number; count: number }[] = [];
  let i = 0;
  for (const crate of crates) {
    while (used.has(i)) i++;
    if (i >= cells) break;
    used.add(i);
    items.push({ ...at(i), keg: false, beer: crate.beer, beerId: crate.beer.id, count: crate.count });
  }
  kegs.forEach((beer, k) => items.push({ ...at(kegCells[k]!), keg: true, beer, beerId: beer.id, count: 12 }));
  return { cell, items };
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
  readonly key = 'storage' as const;
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

  /** Niveau de la ligne d'embouteillage (le tapis qui arrive de l'atelier en prend le style). */
  private beltLv = 1;
  /** Lot en cours de mise en caisse : bouteilles (ou fûts) déjà arrivées, et caisses (ou fûts) en vol vers l'étagère. */
  private run: { id: number; arrived: number; flying: { t: number; keg: boolean }[] } | null = null;

  /** Bout du tapis, au quart de l'écran du stockage. */
  private get beltEnd(): number {
    return this.b.L + Math.round((this.b.R - this.b.L) / 4);
  }

  draw(game: Game, t: number): void {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    const lv = this.lv(game);
    const st = lineState(game);
    this.beltLv = st.lv;
    this.begin(lv, t, lv * 10 + st.lv);
    this.decor(game, lv, t, false);
    // ce qui arrive par le tapis : les caisses remplies (et les fûts) rejoignent l'étagère
    const span = this.b.R - this.b.L;
    const end = this.beltEnd;
    const drop = st.keg ? end : end + 10; // une bouteille est en caisse quand elle a fini de tomber
    const arrived = st.b && !st.trial ? lineArrived(st, drop + span) : 0;
    if (!st.b || st.trial || this.run?.id !== st.b.id) this.run = st.b && !st.trial ? { id: st.b.id, arrived, flying: [] } : null;
    const run = this.run;
    if (run) {
      const unit = st.keg ? 1 : 12;
      const before = Math.floor(run.arrived / unit);
      const now = Math.floor(arrived / unit);
      // une caisse vient d'être remplie (ou un fût d'arriver) : elle part vers l'étagère (quelques-unes à la fois au plus)
      for (let k = before; k < now; k++) if (run.flying.length < 4) run.flying.push({ t, keg: st.keg });
      run.arrived = arrived;
      run.flying = run.flying.filter((f) => t - f.t < FLY);
    }
    const flying = run?.flying.length ?? 0;
    const landed = run ? Math.floor(run.arrived / (st.keg ? 1 : 12)) - flying : 0;
    const extra = st.beer && landed > 0 ? { id: st.beer.id, bottles: st.keg ? 0 : landed * 12, kegs: st.keg ? landed : 0 } : null;
    g.drawImage(this.crateLayer(game, lv, extra), 0, 0);
    this.drawPallet(game, lv);
    // le tapis et ce qu'il porte, la caisse en cours de remplissage au bout
    drawBeltBand(g, st, this.b.L, end, span);
    if (st.b && !st.trial) {
      lineItems(st, this.b.R - 8, drop + span, (xw) => {
        const x = Math.round(xw - span);
        if (st.keg) drawBeltKeg(g, x, LINE.belt, 1, st.label);
        else if (x <= end + 4) drawBeltBottle(g, x, LINE.belt, 1, st.label, true);
        else {
          // la bouteille bascule dans la caisse : on ne la voit plus sous le bord de la caisse
          g.save();
          g.beginPath();
          g.rect(x - 8, this.b.T, 16, LINE.belt - 12 + 3 - this.b.T);
          g.clip();
          drawBeltBottle(g, x, LINE.belt + (x - end - 4) * 4, 1, st.label, true);
          g.restore();
        }
      });
    }
    if (!st.keg) this.drawFillCrate(st.beer ? { beer: st.beer, count: run ? run.arrived % 12 : 0 } : null, lv);
    // les caisses (ou fûts) en vol, du bout du tapis jusqu'à leur case
    if (run && st.beer) {
      const beers = this.stockWith(game, extra && { ...extra });
      run.flying.forEach((f, i) => {
        const k = landed + i + 1;
        const target = this.slotOf(beers, lv, st.beer!.id, f.keg, st.keg ? { kegs: k } : { bottles: k * 12 });
        if (!target) return;
        const u = Math.min(1, (t - f.t) / FLY);
        const e = u * u * (3 - 2 * u);
        const from = f.keg ? { x: end - 6, y: LINE.belt - 16, s: 11 } : { x: end - 1, y: LINE.belt - 12, s: CRATE_AT_END };
        const x = Math.round(from.x + (target.x - from.x) * e);
        const y = Math.round(from.y + (target.y - from.y) * e - Math.sin(Math.PI * u) * 18);
        const sz = Math.round(from.s + (target.s - from.s) * e);
        g.fillStyle = 'rgba(10,6,16,0.25)';
        g.fillRect(x + 2, y + 2, sz, sz);
        if (f.keg) drawKeg(g, x, y, sz, st.beer!.label, lv);
        else drawCrate(g, x, y, sz, { beer: st.beer!, count: 12 }, lv);
      });
    }
    // lumière qui vacille dans le coin du garage et la cave
    if (lv <= 2) {
      const k = 0.06 + 0.02 * Math.sin(t * 7) * Math.sin(t * 2.3);
      g.fillStyle = `rgba(255,210,130,${k})`;
      g.fillRect(this.b.L, this.b.T, this.b.R - this.b.L, FLOOR - this.b.T);
    }
    // chambre froide : brume qui flotte au sol
    if (lv === 3) {
      for (let i = 0; i < Math.round((14 * (this.b.R - this.b.L)) / ROOM_W); i++) {
        const span2 = this.b.R - this.b.L + 20;
        const x = this.b.L + ((i * 23 * span2 / ROOM_W + t * 6) % span2) - 10;
        g.fillStyle = 'rgba(230,245,255,0.18)';
        g.fillRect(Math.round(x), FLOOR + 2 + (i % 3) * 3, 14, 2);
      }
    }
    this.decor(game, lv, t, true);
    if (this.selected === 'racks') this.outline(RACKS, t);
  }

  /** La caisse ouverte au bout du tapis, où tombent les bouteilles (posée sur un petit chariot). */
  private drawFillCrate(crate: { beer: Game['beers'][number]; count: number } | null, lv: number): void {
    const g = this.g;
    const px = painter(g);
    const x = this.beltEnd - 1;
    const y = LINE.belt - 12;
    const s = CRATE_AT_END;
    // chariot à roulettes
    px(x - 1, y + s, s + 2, 2, '#2c283a'); px(x - 1, y + s, s + 2, 1, '#6c6884');
    for (const wx of [x, x + s - 4]) { px(wx, y + s + 2, 4, 3, '#1b1424'); px(wx + 1, y + s + 3, 2, 1, '#545068'); }
    if (crate) drawCrate(g, x, y, s, { ...crate, count: Math.max(0, crate.count) }, lv);
    else drawCrate(g, x, y, s, { beer: { label: { bg: '#00000000' } } as Game['beers'][number], count: 0 }, Math.min(lv, 1));
  }

  /** Le stock tel qu'on le voit : celui du jeu, plus ce qui est déjà arrivé du lot en cours de mise en caisse. */
  private stockWith(game: Game, extra: { id: number; bottles: number; kegs: number } | null): Game['beers'] {
    if (!extra) return game.beers;
    return game.beers.map((b) => (b.id === extra.id ? { ...b, stock: b.stock + extra.bottles, kegs: [...b.kegs, ...Array<number>(extra.kegs).fill(20)] } : b));
  }

  /** La case de la dernière caisse (ou du dernier fût) d'une bière, une fois ajouté ce qui arrive. */
  private slotOf(beers: Game['beers'], lv: number, id: number, keg: boolean, add: { bottles?: number; kegs?: number }): { x: number; y: number; s: number } | null {
    const base = beers.map((b) => (b.id === id ? { ...b, stock: b.stock + (add.bottles ?? 0), kegs: [...b.kegs, ...Array<number>(add.kegs ?? 0).fill(20)] } : b));
    const plan = rackPlan(base, lv);
    const mine = plan.items.filter((it) => it.beerId === id && it.keg === keg);
    const last = mine[mine.length - 1];
    return last ? { x: last.x, y: last.y, s: plan.cell - 1 } : null;
  }

  /**
   * Les caisses et les fûts, redessinés seulement quand le stock change (les rayonnages sont dans le décor).
   * Les caisses se rangent depuis le bas à gauche, les fûts depuis le bas à droite : chacun son coin.
   */
  private crateLayer(game: Game, lv: number, extra: { id: number; bottles: number; kegs: number } | null): HTMLCanvasElement {
    const beers = this.stockWith(game, extra);
    const { per, cell, ox, top, gw } = rackGrid(lv);
    const key = `${lv}|${game.storageCap}|${game.stored}|${beers.map((b) => `${b.id}:${b.stock}:${b.kegs.length}:${b.label.bg}`).join(',')}`;
    if (this.crates?.key === key) return this.crates.c;
    const c = this.crates?.c ?? document.createElement('canvas');
    c.width = ROOM_W;
    c.height = ROOM_H;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, ROOM_W, ROOM_H);
    g.imageSmoothingEnabled = false;
    const px = painter(g);
    for (const it of rackPlan(beers, lv).items) {
      // chaque objet fait de l'ombre sur le mur, en haut à droite, et sur la planche
      g.fillStyle = 'rgba(10,6,16,0.28)';
      g.fillRect(it.x + 2, it.y + 1, cell - 1, cell - 2);
      if (it.keg) drawKeg(g, it.x, it.y, cell - 1, it.beer.label, lv);
      else {
        drawCrate(g, it.x, it.y, cell - 1, { beer: it.beer, count: it.count }, lv);
        if (per > 1 && lv === 4) {
          // palette filmée : plusieurs cartons par case
          px(it.x, it.y + cell - 2, cell - 1, 1, '#a06830');
          g.fillStyle = 'rgba(255,255,255,0.14)';
          g.fillRect(it.x, it.y, cell - 1, cell - 2);
        }
      }
    }
    this.drawGauge(g, game, lv, ox + gw - 30, top - 15);
    this.crates = { key, c };
    return c;
  }

  /** Jauge de remplissage accrochée au-dessus du rayonnage (ardoise au garage, écran ensuite) ; rouge quand c'est plein. */
  private drawGauge(g: CanvasRenderingContext2D, game: Game, lv: number, x: number, y: number): void {
    const px = painter(g);
    const pct = Math.min(100, Math.floor((game.stored / Math.max(1, game.storageCap)) * 100));
    const full = game.storageFull;
    const W = 30;
    const H = 12;
    const [frame, face, ink] = lv === 1 ? ['#7a5228', '#2c3a30', '#e8e4dc'] : lv === 2 ? ['#3a2418', '#e8dcc0', '#3a2418'] : lv === 5 ? ['#c4d0dc', '#0c1420', '#5ef0ff'] : ['#2c283a', '#0c1420', '#7ee081'];
    g.fillStyle = 'rgba(10,6,16,0.3)';
    g.fillRect(x + 2, y + 2, W, H);
    px(x, y, W, H, frame);
    px(x + 1, y + 1, W - 2, H - 2, face);
    const col = full ? '#e8553a' : ink;
    // le pourcentage, puis la barre
    const text = String(pct);
    const tx = x + 3;
    drawDigits(g, text, tx, y + 2, col);
    const sx = tx + text.length * 4;
    px(sx, y + 2, 1, 1, col); px(sx + 2, y + 3, 1, 1, col); px(sx + 1, y + 4, 1, 1, col); px(sx, y + 5, 1, 1, col); px(sx + 2, y + 6, 1, 1, col);
    const bx = x + 18;
    const bw = W - 21;
    px(bx, y + 3, bw, 5, lv === 2 ? '#c4b090' : '#2a3244');
    px(bx, y + 3 + 5 - Math.round((5 * pct) / 100), bw, Math.round((5 * pct) / 100), full ? '#e8553a' : pct >= 80 ? '#f2c14e' : '#7ee081');
  }

  protected paintBackground(g: CanvasRenderingContext2D, lv: number): void {
    const px = painter(g);
    const b = this.b;
    const { L, R, T } = b;
    const WW = R - L;
    wall(g, px, lv === 1 ? 'brick' : lv === 2 ? 'stone' : lv === 3 ? 'cold' : lv === 4 ? 'metal' : 'future', FLOOR, b);
    // haut du mur (les objets, lampes comprises, sont des décors : voir decorLayout) ; l'éclairage ambiant des grands niveaux
    if (lv === 2) {
      // voûte en arc
      px(L, T, WW, 8 - T, '#3a3028');
      g.fillStyle = '#3a3028'; g.beginPath(); g.ellipse(80, 0, 90 + (WW - 160) / 2, 24, 0, 0, Math.PI); g.fill();
    } else if (lv === 4) {
      // verrière et poutre rouge
      px(L, T, WW, 6 - T, '#3a4250');
      for (let wx = from(10, 48, L - 40); wx < R; wx += 48) { px(wx, 8, 40, 16, '#2a303a'); for (let i = 0; i < 4; i++) px(wx + 2 + i * 10, 10, 8, 12, '#7ab0d0'); px(wx + 2, 10, 38, 2, '#b0d8f0'); }
      shade(g, b, { x: L, y: 29, w: WW, h: 4 }, (_, y) => 0.6 + (y - 29) * 0.1);
      px(L, 26, WW, 3, '#c85a2c'); px(L, 26, WW, 1, '#e88a5a');
    } else if (lv === 5) {
      // néons au plafond
      px(L, 4, WW, 1, '#5ef0ff'); px(L, 5, WW, 1, '#1c8ca8');
    }
    const ambient: [number, number, number, number][] = lv === 3 ? [[80, 0, 90, 0.12]] : lv === 4 ? [[34, 24, 50, 0.16], [126, 24, 50, 0.16]] : lv === 5 ? [[80, 5, 110, 0.1]] : [];
    const lamps = [...ambient, ...this.lights(lv)];
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
    // ---- le tapis de l'embouteillage, qui arrive de l'atelier, jusqu'au quart de l'écran
    paintBelt(g, b, L, this.beltEnd, this.beltLv);
    // ---- l'emplacement de la palette des commandes
    dropShadow(g, b, PALLET.x + 26, PALLET.y + 9, 32, 4, 0.45);
  }

  /**
   * La palette des commandes, au premier plan au centre : les caisses prêtes à partir quand une commande peut être
   * remplie, filmées, avec le bon de livraison agrafé.
   */
  private drawPallet(game: Game, lv: number): void {
    const g = this.g;
    const px = painter(g);
    const x = PALLET.x;
    const y = PALLET.y;
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
      drawCrate(g, cx, cy, 11, { beer, count: 12 }, lv);
    }
    const h = 12 * Math.ceil(n / 4);
    // film étirable, autour des caisses posées
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x + 1, y - h - 1, 12 * Math.min(4, n) + 2, h + 1);
    // le bon de livraison : feuille blanche, lignes, et la couleur de la bière
    const bx = x + 12 * Math.min(4, n) - 4;
    const by = y - h + 2;
    px(bx + 1, by + 1, 9, 11, 'rgba(10,6,16,0.35)');
    px(bx, by, 9, 11, '#f4f0e6');
    px(bx + 3, by - 1, 3, 2, '#98a6b6');
    for (let k = 0; k < 3; k++) px(bx + 2, by + 3 + k * 2, k === 2 ? 3 : 5, 1, '#8a8a9a');
    px(bx + 2, by + 9, 5, 1, beer.label.bg);
  }
}

/**
 * Un fût debout : tonneau cerclé au garage (style 1), fût inox ensuite, avec ses deux cerclages, son reflet,
 * la tête de soutirage et une pastille à la couleur de la bière.
 */
export function drawKeg(g: CanvasRenderingContext2D, x: number, y: number, s: number, label: Label, style = 3): void {
  const px = painter(g);
  const w = Math.max(5, Math.round(s * 0.76));
  const ox = x + Math.floor((s - w) / 2);
  const r1 = y + Math.round(s * 0.24);
  const r2 = y + s - 1 - Math.round(s * 0.24);
  const cx = ox + Math.floor(w / 2);
  if (style === 1) {
    px(ox + 1, y, w - 2, s, '#3a2410');
    px(ox, y + 1, w, s - 2, '#3a2410');
    px(ox + 1, y + 1, w - 2, s - 2, '#9a6430');
    for (let k = ox + 3; k < ox + w - 2; k += 3) px(k, y + 1, 1, s - 2, '#7a4a20'); // douelles
    px(ox + 1, y + 1, 1, s - 2, '#c88a4a');
    for (const ry of [y + 2, r1 + 1, r2 - 1, y + s - 3]) px(ox, ry, w, 1, '#3a3a40');
    px(cx - 1, y + Math.floor(s / 2) - 1, 3, 3, '#2a1608');
    px(cx, y + Math.floor(s / 2), 1, 1, label.bg);
    return;
  }
  const lux = style >= 5;
  px(ox, y + 1, w, s - 1, '#4a5668');
  px(ox + 1, y + 1, w - 2, s - 2, lux ? '#d4dee8' : '#a8b6c6');
  px(ox + w - 3, y + 1, 2, s - 2, lux ? '#a8b6c6' : '#7a8898'); // côté dans l'ombre
  px(ox + 2, y + 1, Math.max(1, Math.round(w / 6)), s - 2, '#f4f8fc'); // reflet
  // la jupe du haut, ajourée pour les poignées, et la tête de soutirage
  px(ox, y, w, 1, '#6c7a8c');
  if (s >= 12) { px(ox + 2, y + 2, 2, 1, '#2c283a'); px(ox + w - 4, y + 2, 2, 1, '#2c283a'); }
  px(cx - 1, y, 3, 2, '#2c283a'); px(cx, y, 1, 1, '#c4d0dc');
  // cerclages
  for (const ry of [r1, r2]) { px(ox, ry, w, 1, '#6c7a8c'); px(ox, ry - 1, w, 1, '#ffffff80'); }
  // pastille de la bière, entre les cerclages
  const ph = Math.max(1, r2 - r1 - 3);
  px(cx - 1, r1 + 2, Math.max(2, Math.round(w / 3)), ph, label.bg);
  if (lux) px(ox, y + s - 1, w, 1, label.bg); // liseré lumineux
}

// =================================================================== bar

/** Le bar occupe les 2/3 du haut, la cave et ses fûts le tiers du bas. */
export const CELLAR_Y = 200;
/** Durée de la descente (ou de la remontée) de l'objet d'événement, en secondes. */
const EV_DROP = 1.2;
/** Comptoir : dessus et façade (sa place est dans barLayout : la moitié gauche de la salle). */
const CT = () => {
  const c = barLayout.counter;
  return { top: c.y, front: c.y + c.h, x0: c.x, x1: c.x + c.w };
};
const BAR_HIT: Rect = { x: 0, y: 24, w: ROOM_W, h: CELLAR_Y - 24 };
/** Sol de la cave, où reposent les fûts. */
const KEG_FLOOR = 290;
/**
 * Coin du bar, en haut à droite, où s'installe l'objet de l'événement en cours (télé, cible, boule à facettes).
 * Le décor de chaque niveau laisse cette place libre.
 */
/** Point de fuite du bar : au milieu, à hauteur des yeux d'un client debout. */
const VX = 80;
/** Le mur rejoint le sol derrière le comptoir ; les yeux sont à la même hauteur au-dessus du sol que dans les autres pièces. */
const BAR_FLOOR = 118;
const EYE_BAR = BAR_FLOOR - 84;

/** Sol de la salle, en perspective : vieux plancher, damier, tomettes, béton ciré, dalles sombres. */
function paintBarFloor(g: CanvasRenderingContext2D, b: Bounds, top: number, bottom: number, lv: number): void {
  const mod = (a: number) => a - Math.floor(a);
  if (lv === 1) {
    const woods = ['#5a4a3a', '#544436', '#60503e'].map(rgb);
    const joint = rgb('#3a2e24');
    const dust = rgb('#6e5e4c');
    floor(g, b, top, VX, EYE_BAR, 34, (u, v, du, dv) => {
      const bi = Math.floor(u * 2);
      if (seam(u * 2, du * 2)) return joint;
      const ve = v + hash(bi, 3) * 5;
      if (seam(ve / 5, dv / 5)) return joint;
      return hash(Math.floor(u * 20), Math.floor(v * 10)) < 0.05 ? dust : woods[Math.floor(hash(bi, Math.floor(ve / 5)) * 3)]!;
    }, bottom);
  } else if (lv === 2) {
    const a = rgb('#e8e4dc');
    const c = rgb('#3e3a50');
    floor(g, b, top, VX, EYE_BAR, 26, (u, v) => ((Math.floor(u) + Math.floor(v)) & 1 ? a : c), bottom);
  } else if (lv === 3) {
    const base = rgb('#6a2a22');
    const insert = rgb('#8a3a2a');
    const joint = rgb('#4a1c16');
    floor(g, b, top, VX, EYE_BAR, 28, (u, v, du, dv) => {
      if (seam(u, du) || seam(v, dv)) return joint;
      const fu = mod(u) - 0.5;
      const fv = mod(v) - 0.5;
      return Math.abs(fu) + Math.abs(fv) < 0.22 ? insert : base;
    }, bottom);
  } else if (lv === 4) {
    const base = rgb('#5a5e64');
    const speck = rgb('#4a4e54');
    const shine = rgb('#6e737a');
    floor(g, b, top, VX, EYE_BAR, 60, (u, v, du, dv) => {
      if (seam(u, du) || seam(v / 1.5, dv / 1.5)) return speck;
      const n = hash(Math.floor(u * 40), Math.floor(v * 40));
      return n < 0.12 ? speck : n > 0.95 ? shine : base;
    }, bottom);
  } else {
    const base = rgb('#1c2230');
    const joint = rgb('#2a3244');
    floor(g, b, top, VX, EYE_BAR, 30, (u, v, du, dv) => (seam(u, du) || seam(v, dv) ? joint : base), bottom);
  }
}


interface Seat { x: number; y: number; kind: 'stool' | 'table' }

/** Les places : tabourets au comptoir d'abord, puis des tables devant (les places des banquettes sont toujours à table). */
function seatsFor(level: number, n: number, bench = 0): Seat[] {
  const out: Seat[] = [];
  const { x0, x1, front } = CT();
  const stools = Math.min(n - bench, level === 1 ? 2 : 6);
  const span = level === 1 ? 50 : x1 - x0 - 24;
  const start = level === 1 ? 48 : x0 + 12;
  for (let i = 0; i < stools; i++) out.push({ x: Math.round(start + (stools === 1 ? span / 2 : (span * i) / (stools - 1))), y: front + 14, kind: 'stool' });
  const rest = n - stools;
  for (let i = 0; i < rest; i++) {
    const c = tableSpot(Math.floor(i / 2));
    out.push({ x: c.x + (i % 2 ? 9 : -9), y: c.y, kind: 'table' });
  }
  return out;
}

/**
 * Centre (et pied) de la table n, dans la zone des tables de barLayout : deux colonnes, le premier rang devant
 * (en bas), les suivants de plus en plus au fond.
 */
function tableSpot(n: number): { x: number; y: number } {
  return { x: 28 + (n % 3) * 52, y: 186 };
}

/** Couleurs des clients : peau, cheveux, haut. */
const PEOPLE = [
  ['#e0a77f', '#3a2418', '#4ea8f0'], ['#c98563', '#1b1424', '#e85a3a'], ['#f0c8a0', '#e8b030', '#6cc040'],
  ['#8a5a3c', '#1b1424', '#f2c14e'], ['#e0a77f', '#a8483a', '#8a5cc8'], ['#f0c8a0', '#6a4422', '#40c0a8'],
  ['#b07850', '#e8e4dc', '#d4823a'], ['#e0a77f', '#2c283a', '#e8eef4'],
] as const;

/** Temps que met un client pour rejoindre sa place, ou pour repartir (s). */
const WALK_S = 3.5;

export class BarRoom extends Room {
  readonly key = 'bar' as const;
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
    const { x0, x1 } = CT();
    // les tireuses à gauche, le barman à droite du comptoir
    const span = lv === 1 ? 30 : x1 - x0 - 30;
    const start = lv === 1 ? 58 : x0 + 15;
    return Math.round(start + (taps === 1 ? span / 2 : (span * i) / (taps - 1)));
  }

  hits(taps: number, eventOn = false): { id: string; rect: Rect }[] {
    const out = [{ id: 'counter', rect: BAR_HIT }];
    for (let i = 0; i < taps; i++) {
      const r = this.kegRect(i, taps);
      out.push({ id: `keg${i}`, rect: { x: r.x - 3, y: CELLAR_Y + 18, w: r.w + 6, h: KEG_FLOOR - CELLAR_Y - 14 } });
    }
    if (eventOn) out.push({ id: 'event', rect: barLayout.event });
    return out;
  }

  /** L'objet de l'événement en cours, dans le coin en haut à droite : il n'est là que le temps de l'événement. */
  private drawEventItem(game: Game, lv: number, t: number): void {
    // il descend du plafond quand l'événement commence, et remonte quand il se termine
    const on = game.partying || !!this.preview;
    if (on !== this.evOn) {
      this.evOn = on;
      this.evAt = this.evAt < 0 && on ? t - EV_DROP : t; // déjà en cours à l'ouverture : pas d'animation
    }
    if (on) this.evId = this.preview?.event ?? game.eventId; // en remontant, il garde l'objet de l'événement fini
    if (this.evAt < 0) this.evAt = t - EV_DROP;
    const u = Math.min(1, (t - this.evAt) / EV_DROP);
    const k = on ? 1 - (1 - u) ** 3 : 1 - u * u; // arrivée qui ralentit, départ qui accélère
    if (k <= 0) return;
    const e = barLayout.event;
    const dy = -Math.round((1 - k) * (e.y + e.h - this.b.T + 4));
    const g = this.g;
    g.save();
    g.translate(0, dy);
    const ev = this.evId ?? game.eventId;
    if (ev === 'foot') this.drawTv(lv, t);
    else if (ev === 'darts') this.drawDarts(lv, t);
    else this.drawDisco(t);
    g.restore();
  }
  private evOn = false;
  private evAt = -1;
  private evId: string | null = null;

  /** Grande télé suspendue : cathodique en bois au début, écran plat ensuite, verre et néon au dernier niveau. Le match défile. */
  private drawTv(lv: number, t: number): void {
    const g = this.g;
    const px = painter(g);
    const W = 60;
    const H = 42;
    const x = barLayout.event.x + Math.floor((barLayout.event.w - W) / 2);
    const y = barLayout.event.y + 20;
    // suspentes
    px(x + 6, this.b.T, 1, y - this.b.T, '#1b1424'); px(x + W - 7, this.b.T, 1, y - this.b.T, '#1b1424');
    let sx: number, sy: number, sw: number, sh: number;
    if (lv <= 2) {
      px(x, y, W, H, '#1b1424');
      px(x + 1, y + 1, W - 2, H - 2, '#7a5228'); px(x + 1, y + 1, W - 2, 1, '#a8743c');
      [sx, sy, sw, sh] = [x + 3, y + 3, W - 12, H - 6];
      px(sx - 1, sy - 1, sw + 2, sh + 2, '#3a2c20');
      px(x + W - 7, y + 6, 4, 4, '#c4b090'); px(x + W - 6, y + 7, 2, 2, '#5a4a3a');
      px(x + W - 7, y + 14, 4, 4, '#c4b090'); px(x + W - 6, y + 15, 2, 2, '#5a4a3a');
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
    g.strokeRect(mid - 3.5, sy + sh / 2 - 3.5, 7, 7);
    const bx = mid + Math.round(Math.sin(t * 1.3) * (sw / 2 - 3));
    const by = sy + Math.round(sh / 2 + Math.sin(t * 2.1) * (sh / 2 - 2));
    for (let i = 0; i < 3; i++) {
      px(bx - 5 + Math.round(Math.sin(t * 1.7 + i * 2) * 4) - i * 4, sy + 3 + i * 7, 1, 3, '#e8553a');
      px(bx + 4 + Math.round(Math.cos(t * 1.5 + i) * 4) + i * 3, sy + 5 + i * 7, 1, 3, '#3f88d4');
    }
    px(bx, by, 2, 2, '#ffffff');
    // reflet
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(sx, sy, sw, 2);
  }

  /** Cible de fléchettes sur son panneau (liège, puis bois sombre, puis blanc laqué) ; les fléchettes se plantent. */
  private drawDarts(lv: number, t: number): void {
    const g = this.g;
    const px = painter(g);
    const S = 46;
    const x = barLayout.event.x + Math.floor((barLayout.event.w - S) / 2);
    const y = barLayout.event.y + 18;
    // suspente : la cible descend du plafond avec son panneau
    px(x + Math.floor(S / 2), this.b.T, 1, y - this.b.T, '#1b1424');
    const panel = lv <= 2 ? ['#a8743c', '#7a5228'] : lv <= 4 ? ['#3a2418', '#241410'] : ['#f4f8fc', '#c4d0dc'];
    px(x, y, S, S, '#1b1424'); px(x + 1, y + 1, S - 2, S - 2, panel[0]!); px(x + 1, y + S - 3, S - 2, 2, panel[1]!);
    const cx = x + S / 2;
    const cy = y + S / 2;
    for (const [r, c] of [[19, '#1b1424'], [18, '#b83a24'], [15, '#1b1424'], [14, '#e8dcc0'], [10, '#2c8a4a'], [9, '#e8dcc0'], [5, '#b83a24'], [2.5, '#2c8a4a']] as const) {
      g.fillStyle = c; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
    // secteurs
    g.strokeStyle = 'rgba(27,20,36,0.5)';
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15); g.stroke(); }
    // trois fléchettes, relancées à tour de rôle
    for (let i = 0; i < 3; i++) {
      const round = Math.floor(t * 0.7 + i / 3);
      const a = hash(round, i) * Math.PI * 2;
      const d = hash(round, i + 7) * 14;
      const fx = Math.round(cx + Math.cos(a) * d);
      const fy = Math.round(cy + Math.sin(a) * d);
      px(fx, fy, 1, 1, '#1b1424'); px(fx + 1, fy - 1, 1, 1, '#c4d0dc'); px(fx + 2, fy - 2, 1, 1, '#c4d0dc'); px(fx + 3, fy - 3, 2, 2, '#f2c14e'); px(fx + 5, fy - 5, 1, 1, '#e8553a'); px(fx + 4, fy - 5, 1, 1, '#e8553a');
    }
  }

  /** Boule à facettes de la fête : elle tourne, ses facettes scintillent. */
  private drawDisco(t: number): void {
    const g = this.g;
    const px = painter(g);
    const cx = barLayout.event.x + Math.floor(barLayout.event.w / 2);
    const cy = barLayout.event.y + 40;
    const r = 17;
    px(cx, this.b.T, 1, cy - r - this.b.T, '#c4d0dc');
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
      const sx = Math.round(cx + Math.cos(a) * (r + 5));
      const sy = Math.round(cy + Math.sin(a) * (r + 5));
      px(sx, sy - 1, 1, 3, '#ffffff'); px(sx - 1, sy, 3, 1, '#ffffff');
    }
  }

  protected levelOf(game: Game): number {
    return game.barLevel;
  }

  private has(game: Game, id: Parameters<Game['hasFurniture']>[0]): boolean {
    return !!this.preview || game.hasFurniture(id);
  }

  draw(game: Game, t: number): void {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    const lv = this.lv(game);
    this.begin(lv, t);
    this.decor(game, lv, t, false);
    this.drawEventItem(game, lv, t);
    const labels = game.taps.map((tp) => (tp.glasses > 0 ? game.beer(tp.beerId)?.label ?? null : null));
    this.drawTaps(labels, this.preview ? BAR[lv - 1]!.taps : game.taps.length, lv);
    this.drawBartender(game, lv, t);
    this.drawGuests(game, lv, t);
    if (lv === 1) this.dust(t);
    if (lv === 5) {
      const k = 0.5 + 0.5 * Math.sin(t * 2);
      g.fillStyle = `rgba(94,240,255,${0.25 + 0.2 * k})`;
      g.fillRect(CT().x0, CT().front - 1, CT().x1 - CT().x0, 1);
    }
    if (game.partying && game.eventId === 'party') this.party(t); // projecteurs et confettis : seulement pour la fête
    this.drawCellar(game, lv, t);
    this.decor(game, lv, t, true);
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
      const { x0, x1 } = CT();
      const x = (x0 + x1) / 2 - 16 + hash(i, 4) * 40 + Math.sin(t * 0.7 + i) * 4 + k * 12;
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
    const back = CT().top;
    wall(g, px, lv <= 2 ? 'plank' : lv === 3 ? 'green' : lv === 4 ? 'brick' : 'future', BAR_FLOOR, this.b);
    // les objets du mur (lampes, enseignes, étagères, ardoise…) sont des décors : voir decorLayout
    if (lv === 1) {
      g.fillStyle = 'rgba(90,80,70,0.45)'; g.fillRect(L, T, WW, BAR_FLOOR - T); // bois grisé par la poussière
    } else if (lv === 3) {
      px(L, 76, WW, BAR_FLOOR - 76, '#4a2c14');
      for (let x = from(0, 20, L); x < R; x += 20) { px(x + 2, 80, 16, 26, '#5a3a1c'); px(x + 2, 80, 16, 1, '#744620'); }
    }
    // ombrage du mur : coins, plafond, pied ; halo des lampes
    const lamps = this.lights(lv);
    const barLamps: [number, number, number, number][] = lv === 5 || !lamps.length ? [[80, 14, 70, 0.1], ...lamps] : lamps;
    wallLight(g, this.b, T, BAR_FLOOR, barLamps, lv === 5 ? 0.84 : 0.66);
    // ---- le sol de la salle, en perspective : il passe sous le comptoir, qui y est posé
    const f = CT().front;
    paintBarFloor(g, this.b, BAR_FLOOR, CELLAR_Y, lv);
    floorLight(g, this.b, BAR_FLOOR, barLamps.map(([x, , r, k]) => [x, f + 20, r * 1.3, k * 0.6] as const), 0.55);
    px(L, BAR_FLOOR - 3, WW, 3, lv === 5 ? '#dce6f0' : '#2a1a10'); // plinthe
    px(L, BAR_FLOOR - 3, WW, 1, lv === 5 ? '#ffffff' : '#5a3a1c');
    // comptoir : le dessus (sous les yeux, on le voit d'en haut), la façade, son ombre au sol
    const { top, front, x0, x1 } = CT();
    const kk = 6 / (top - EYE_BAR + 6);
    trap(g, top - 6, top, x0 - 2 + (VX - x0) * kk, x1 + 2 - (x1 - VX) * kk, x0 - 2, x1 + 2, lv === 1 ? '#7a6c5c' : lv === 5 ? '#f4f8fc' : lv === 4 ? '#dce4ec' : '#b07a40');
    shade(g, this.b, { x: x0 - 2, y: top - 6, w: x1 - x0 + 4, h: 6 }, (_, y) => 0.85 + ((y - top + 6) / 6) * 0.2);
    const wood = lv === 1 ? ['#8a7a68', '#6a5a4a', '#4a3e32'] : lv === 5 ? ['#ffffff', '#dce6f0', '#8a9ab0'] : lv === 4 ? ['#c4d0dc', '#98a6b6', '#465264'] : ['#c88a4a', '#8a5a2c', '#5a3a1c'];
    px(x0 - 2, top, x1 - x0 + 4, 4, wood[0]!); px(x0 - 2, top + 3, x1 - x0 + 4, 1, wood[2]!);
    px(x0, top + 4, x1 - x0, front - top - 4, wood[1]!);
    for (let x = x0 + 4; x < x1; x += lv === 4 ? 6 : 12) px(x, top + 6, 1, front - top - 8, wood[2]!);
    if (lv === 3) px(x0, front - 4, x1 - x0, 2, '#e8b030');
    if (lv === 1) for (let i = 0; i < 10; i++) px(x0 + Math.floor(hash(i, 9) * (x1 - x0)), top - 4 + Math.floor(hash(i, 10) * 5), 3, 1, '#a89e8e');
    shade(g, this.b, { x: x0, y: top + 4, w: x1 - x0, h: front - top - 4 }, (_, y) => 0.7 + ((y - top - 4) / (front - top - 4)) * 0.25 - (y < top + 7 ? 0.2 : 0));
    // l'ombre du comptoir, et celle des tabourets et des tables
    shade(g, this.b, { x: x0 - 6, y: f, w: x1 - x0 + 12, h: 6 }, (x, y) => {
      const side = x < x0 ? (x0 - x) / 6 : x > x1 ? (x - x1) / 6 : 0;
      return Math.min(1, 0.5 + 0.5 * Math.max(side, (y - f) / 6));
    });
    for (const st of seatsFor(lv, BAR[lv - 1]!.seats)) {
      if (st.kind === 'stool') dropShadow(g, this.b, st.x + 1, st.y + 10, 6, 2, 0.5);
    }
    for (let i = 0; i < Math.ceil(Math.max(0, BAR[lv - 1]!.seats - (lv === 1 ? 2 : 6)) / 2); i++) { const c = tableSpot(i); dropShadow(g, this.b, c.x + 1, c.y + 6, 10, 2, 0.5); }
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
    wallLight(g, this.b, cw, KEG_FLOOR, lv <= 2 ? [[80, cw + 8, 40, 0.18]] : [[80, cw, 90, 0.08]], 0.55);
    // sol de la cave
    {
      const c0 = rgb(lv === 5 ? '#0c1018' : '#2a221c');
      const c1 = rgb(lv === 5 ? '#1c8ca8' : '#1a1410');
      floor(g, this.b, KEG_FLOOR, VX, EYE_BAR, 30, (u, v, du, dv) => (seam(u, du) || seam(v, dv) ? c1 : c0));
      floorLight(g, this.b, KEG_FLOOR, [], 0.6);
      px(L, KEG_FLOOR, WW, 1, lv === 5 ? '#5ef0ff' : '#4a3e32');
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
      // son ombre sur le mur de la cave et au sol
      g.fillStyle = 'rgba(16,10,24,0.35)';
      g.fillRect(r.x + 3, r.y + 2, r.w, r.h - 2);
      const ks = ellipseShadow(Math.round(r.w / 2) + 2, 2, 0.8);
      g.drawImage(ks, r.x - 1, r.y + r.h - 2);
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

  /** Une tireuse par fût ; sa poignée prend la couleur de l'étiquette (grise quand le fût est vide). */
  private drawTaps(labels: (Label | null)[], taps: number, lv: number): void {
    const g = this.g;
    const px = painter(g);
    const { top } = CT();
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
    const { x0, x1 } = CT();
    if (game.barmanOn) this.drawHelper(game, lv === 1 ? 26 : 16, t);
    const px = painter(this.g);
    const x = lv === 1 ? 92 : x1 - 24;
    const y = CT().top - 26;
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
    const y = CT().top - 26;
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
    // en aperçu : toutes les places du niveau, banquettes comprises, et la salle pleine
    const seats = this.preview ? seatsFor(lv, BAR[lv - 1]!.seats + 2, 2) : seatsFor(lv, game.barSeats, game.barSeats - game.bar.seats);
    const serving = game.barServing || !!this.preview;
    // un client reste ~20 min : la salle compte en moyenne affluence × 20 personnes
    const busy = this.preview ? 1 : serving ? Math.min(0.95, (game.barRate * 20) / seats.length) : 0;
    if (this.has(game, 'benches')) {
      // banquettes capitonnées derrière chaque table
      const tone = lv === 5 ? ['#f4f8fc', '#dce6f0', '#8a9ab0'] : lv === 4 ? ['#3a6aa8', '#2e5a9a', '#1c3a6a'] : ['#8a2a32', '#a8343c', '#5a1a20'];
      const xs = [...new Set(seats.filter((st) => st.kind === 'table').map((st, i, all) => Math.round((st.x + (all[i % 2 ? i - 1 : i + 1] ?? st).x) / 2)))];
      const ys = new Map(seats.filter((st) => st.kind === 'table').map((st, i, all) => [Math.round((st.x + (all[i % 2 ? i - 1 : i + 1] ?? st).x) / 2), st.y]));
      for (const tx of xs) {
        const y = ys.get(tx) ?? 186;
        g.fillStyle = 'rgba(16,10,24,0.35)'; g.fillRect(tx - 16, y - 1, 34, 2);
        px(tx - 17, y - 17, 34, 13, tone[2]!); px(tx - 16, y - 16, 32, 11, tone[0]!);
        for (let k = 0; k < 4; k++) px(tx - 13 + k * 8, y - 13, 1, 1, tone[2]!); // capitons
        px(tx - 17, y - 5, 34, 4, tone[1]!); px(tx - 17, y - 5, 34, 1, tone[0]!);
        px(tx - 17, y - 1, 2, 2, '#2c283a'); px(tx + 15, y - 1, 2, 2, '#2c283a');
      }
    }
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
      // il arrive par la droite et rejoint sa place ; son verre fini, il repart par où il est venu
      const walk = WALK_S / period;
      if (!this.preview && (phase < walk || phase > 1 - walk)) {
        const u = phase < walk ? phase / walk : (1 - phase) / walk;
        const ex = this.b.R + 6;
        const x = Math.round(ex + (s.x - ex) * u);
        const foot = s.y + (s.kind === 'stool' ? 10 : 5);
        const step = Math.sin(t * 10 + i) > 0 ? 1 : 0;
        px(x - 2, foot - 6, 2, 6 - step, '#2c283a'); px(x + 1, foot - 6, 2, 5 + step, '#2c283a');
        px(x - 3, foot - 15, 7, 9, shirt);
        px(x - 3, foot - 15, 1, 9, '#00000030');
        px(x - 2, foot - 21, 5, 6, skin);
        px(x - 2, foot - 22, 5, 2, hair);
        px(x + (phase < walk ? -2 : 2), foot - 19, 1, 1, '#2b2135');
        continue;
      }
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
      const gy = s.kind === 'stool' ? CT().top - 6 : s.y - 14;
      const level = Math.max(0, 1 - phase * 1.1);
      px(gx, gy, 3, 6, '#c8f0e880');
      const lh = Math.round(5 * level);
      if (lh > 0) { px(gx, gy + 6 - lh, 3, lh, '#e8a530'); px(gx, gy + 6 - lh, 3, 1, '#fff1c8'); }
    }
    if (!serving) {
      const sx = Math.round((CT().x0 + CT().x1) / 2) - 11;
      px(sx, CT().top - 9, 22, 9, '#1b1424');
      px(sx + 1, CT().top - 8, 20, 7, '#e8dcc0');
      g.fillStyle = '#a8483a';
      g.font = '6px monospace';
      g.fillText('À SEC', sx + 2, CT().top - 2);
    }
  }
}
