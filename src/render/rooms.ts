/**
 * Les deux autres pièces de la brasserie, au même format que l'atelier (canvas 160 × 300 agrandi au pixel près) :
 * - le stockage : des rayonnages où s'empilent les caisses, et le bureau avec l'ordinateur des commandes ;
 * - le bar : le comptoir, ses tireuses aux couleurs des bières à la carte, et des clients qui vont et viennent.
 * Chaque pièce a 5 décors, selon son niveau.
 */
import type { Game } from '../core/game';
import type { Label } from '../core/label';
import { crateList, drawCrate } from './bottleArt';
import { drawMiniLabel } from './labelArt';
import { PAL } from './painter';
import type { Rect } from './sprites';

export const ROOM_W = 160;
export const ROOM_H = 300;
/** Ligne du sol (comme la salle d'embouteillage de l'atelier). */
const FLOOR = 210;

type Px = (x: number, y: number, w: number, h: number, c: string) => void;
const painter = (g: CanvasRenderingContext2D): Px => (x, y, w, h, c) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};

/** Chiffres de 3 × 5 px (écran de l'ordinateur). */
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function drawDigits(g: CanvasRenderingContext2D, text: string, x: number, y: number, col: string): void {
  g.fillStyle = col;
  for (let k = 0; k < text.length; k++) {
    const d = DIGITS[Number(text[k])]!;
    for (let i = 0; i < 15; i++) if (d[i] === '1') g.fillRect(x + k * 4 + (i % 3), y + Math.floor(i / 3), 1, 1);
  }
}

/** Hachage déterministe 0..1 (décor, clients). */
const hash = (a: number, b = 0) => {
  let x = Math.imul(a * 374761393 + b * 668265263, 1274126177);
  x ^= x >>> 13;
  x = Math.imul(x, 1103515245);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** Pièce commune : canvas, décors en cache par niveau, récupération après une purge mémoire d'iOS. */
export abstract class Room {
  readonly canvas = document.createElement('canvas');
  protected g: CanvasRenderingContext2D;
  protected bgs = new Map<number, HTMLCanvasElement>();
  private checkedAt = 0;
  /** Objet sélectionné (liseré clignotant). */
  selected: string | null = null;

  constructor() {
    this.canvas.width = ROOM_W;
    this.canvas.height = ROOM_H;
    this.g = this.canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
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
      c.width = ROOM_W;
      c.height = ROOM_H;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      this.paintBackground(g, level);
      this.bgs.set(level, c);
    }
    return c;
  }

  protected abstract paintBackground(g: CanvasRenderingContext2D, level: number): void;

  /** Niveau qui choisit le décor. */
  protected abstract levelOf(game: Game): number;

  /** Décor actuel (sans rien d'animé), une fois dessiné : sert à prolonger la pièce sur les côtés. */
  backdrop(game: Game): HTMLCanvasElement | undefined {
    return this.bgs.get(this.levelOf(game));
  }

  protected outline(r: Rect, t: number): void {
    if (Math.floor(t * 3) % 2) return;
    this.g.strokeStyle = '#f2c14e';
    this.g.lineWidth = 1;
    this.g.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
  }
}

/** Murs et sols communs aux deux pièces, du plus modeste au plus futuriste. */
function wall(g: CanvasRenderingContext2D, px: Px, style: 'brick' | 'stone' | 'cold' | 'metal' | 'future' | 'plank' | 'green', bottom: number): void {
  const W = ROOM_W;
  if (style === 'brick') {
    px(0, 0, W, bottom, '#7a3a2c');
    for (let y = 0; y < bottom; y += 6) {
      px(0, y + 5, W, 1, '#4a221a');
      for (let x = ((y / 6) % 2) * 6; x < W; x += 12) {
        px(x, y, 1, 5, '#4a221a');
        px(x + 1, y, 10, 1, '#9a4e3a');
        if (hash(x, y) < 0.12) px(x + 1, y + 1, 10, 4, '#6a3226');
      }
    }
  } else if (style === 'stone') {
    px(0, 0, W, bottom, '#4a4038');
    for (let y = 0, row = 0; y < bottom; y += 9, row++) {
      for (let x = -((row * 7) % 16); x < W; x += 16) {
        px(x + 1, y + 1, 14, 7, ['#5e5248', '#56493f', '#665a4e', '#4e4238'][(x * 3 + row * 5) & 3]!);
        px(x + 1, y + 1, 14, 1, '#76685a');
      }
    }
  } else if (style === 'cold') {
    // panneaux isothermes blancs, joints verticaux, givre en haut
    px(0, 0, W, bottom, '#dfe8ee');
    for (let x = 0; x < W; x += 20) { px(x, 0, 1, bottom, '#aebcc8'); px(x + 1, 0, 1, bottom, '#f4f8fc'); }
    for (let x = 0; x < W; x++) px(x, 0, 1, 2 + Math.round(hash(x) * 4), '#ffffff');
  } else if (style === 'metal') {
    for (let x = 0; x < W; x++) px(x, 0, 1, bottom, ['#5c6878', '#6c788a', '#7c889a', '#6c788a', '#56606e', '#4a5462'][x % 6]!);
  } else if (style === 'future') {
    px(0, 0, W, bottom, '#e8eef4');
    for (let y = 0; y < bottom; y += 22) px(0, y, W, 1, '#c4d0dc');
    for (let x = 0; x < W; x += 32) px(x, 0, 1, bottom, '#c4d0dc');
  } else if (style === 'plank') {
    // lambris de bois clair
    for (let x = 0; x < W; x += 8) {
      px(x, 0, 8, bottom, ['#a8743c', '#9a6a36', '#b07a40'][(x / 8) % 3]!);
      px(x, 0, 1, bottom, '#6a4422');
    }
  } else {
    // vert anglais en haut, lambris sombre en bas
    px(0, 0, W, bottom, '#2c4a3a');
    for (let y = 4; y < bottom; y += 14) for (let x = 6; x < W; x += 14) px(x, y, 1, 1, '#3c5e4a');
  }
}

// =================================================================== stockage

/** Zone des rayonnages (coordonnées de la pièce). */
const RACKS: Rect = { x: 6, y: 30, w: 148, h: 174 };
/** Bureau et ordinateur, au premier plan à gauche. */
const DESK: Rect = { x: 4, y: 224, w: 74, h: 70 };

export class StorageRoom extends Room {
  private crates?: { key: string; c: HTMLCanvasElement };

  /** Objets cliquables de la pièce. */
  hits(): { id: 'racks' | 'computer'; rect: Rect }[] {
    return [
      { id: 'racks', rect: RACKS },
      { id: 'computer', rect: DESK },
    ];
  }

  /** Position de la pastille des commandes (au-dessus de l'écran). */
  get badgePoint() {
    return { x: DESK.x + 30, y: DESK.y - 2 };
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
    g.drawImage(this.background(lv, t), 0, 0);
    g.drawImage(this.crateLayer(game), 0, 0);
    this.drawComputer(game, lv, t);
    this.drawPallet(game, lv);
    // lumière qui vacille dans le coin du garage et la cave
    if (lv <= 2) {
      const k = 0.06 + 0.02 * Math.sin(t * 7) * Math.sin(t * 2.3);
      g.fillStyle = `rgba(255,210,130,${k})`;
      g.fillRect(0, 0, ROOM_W, FLOOR);
    }
    // chambre froide : brume qui flotte au sol
    if (lv === 3) {
      for (let i = 0; i < 14; i++) {
        const x = ((i * 23 + t * 6) % (ROOM_W + 20)) - 10;
        g.fillStyle = 'rgba(230,245,255,0.18)';
        g.fillRect(Math.round(x), FLOOR + 2 + (i % 3) * 3, 14, 2);
      }
    }
    if (this.selected === 'racks') this.outline(RACKS, t);
    if (this.selected === 'computer') this.outline(DESK, t);
  }

  /** Les caisses, redessinées seulement quand le stock change. */
  private crateLayer(game: Game): HTMLCanvasElement {
    // Au-delà de 160 emplacements, chaque case est une palette de plusieurs caisses.
    const crateCap = game.storageCap / 12;
    const per = Math.max(1, Math.ceil(crateCap / 160));
    const cap = Math.ceil(crateCap / per);
    const key = `${game.storageLevel}|${game.beers.map((b) => `${b.id}:${b.stock}:${b.kegs.length}:${b.label.bg}`).join(',')}`;
    if (this.crates?.key === key) return this.crates.c;
    const c = this.crates?.c ?? document.createElement('canvas');
    c.width = ROOM_W;
    c.height = ROOM_H;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, ROOM_W, ROOM_H);
    g.imageSmoothingEnabled = false;
    const px = painter(g);
    const lv = game.storageLevel;
    // grille : la plus grande taille de caisse qui fait tout tenir
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
    const top = base - rows * rowH;
    // montants et planches des rayonnages
    const [post, postHi, plank, plankHi] =
      lv <= 2 ? ['#5a3a1c', '#7a5228', '#8a5a2c', '#c88a4a'] : lv === 3 ? ['#98a6b6', '#e8eef4', '#6c7a8c', '#c4d0dc'] : lv === 4 ? ['#2e5a9a', '#4e8ad0', '#e8742a', '#ffb070'] : ['#dce6f0', '#ffffff', '#8a9ab0', '#5ef0ff'];
    for (const x of [ox - 4, ox + gw + 2]) { px(x, top - 3, 2, base - top + 3, post); px(x, top - 3, 1, base - top + 3, postHi); }
    if (lv <= 2 && cell >= 10) {
      // parpaings sous les planches du garage
      px(ox - 6, base - 1, 6, 4, '#8a8a8a');
      px(ox + gw, base - 1, 6, 4, '#8a8a8a');
    }
    for (let r = 0; r < rows; r++) {
      const y = base - r * rowH - gap;
      px(ox - 3, y, gw + 6, gap, plank);
      px(ox - 3, y, gw + 6, 1, plankHi);
    }
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
      if (crate?.keg) drawKeg(g, x, y, cell - 1, crate.beer.label);
      else if (crate) {
        drawCrate(g, x, y, cell - 1 - (per > 1 ? 1 : 0), crate);
        if (per > 1) px(x, y + cell - 2, cell - 1, 1, '#a06830'); // palette
      }
      else {
        g.fillStyle = lv === 3 || lv === 5 ? '#00000018' : '#ffffff18';
        for (let k = 0; k < cell - 1; k += 2) g.fillRect(x + k, y + cell - 2, 1, 1);
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
    const W = ROOM_W;
    wall(g, px, lv === 1 ? 'brick' : lv === 2 ? 'stone' : lv === 3 ? 'cold' : lv === 4 ? 'metal' : 'future', FLOOR);
    if (lv === 1) {
      // ampoule nue au bout de son fil, toiles d'araignée
      px(80, 0, 1, 12, '#1b1424'); px(78, 12, 5, 5, '#fff4b0'); px(79, 13, 3, 3, '#ffffff');
      g.fillStyle = 'rgba(255,220,140,0.08)'; g.beginPath(); g.arc(80, 15, 40, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.2)';
      g.beginPath(); g.moveTo(0, 2); g.lineTo(14, 2); g.moveTo(0, 2); g.lineTo(0, 16); g.moveTo(0, 2); g.lineTo(11, 13); g.stroke();
      // outils accrochés
      px(130, 8, 18, 14, '#8a5a2c'); px(133, 10, 2, 10, '#98a6b6'); px(139, 10, 3, 8, '#c4d0dc'); px(144, 11, 2, 9, '#e85a3a');
    } else if (lv === 2) {
      // voûte en arc et lanternes
      px(0, 0, W, 8, '#3a3028');
      g.fillStyle = '#3a3028'; g.beginPath(); g.ellipse(80, 0, 90, 24, 0, 0, Math.PI); g.fill();
      for (const lx of [20, 140]) { px(lx - 2, 12, 5, 7, '#2a1a10'); px(lx - 1, 13, 3, 5, '#ffb050'); g.fillStyle = 'rgba(255,190,90,0.10)'; g.beginPath(); g.arc(lx, 15, 20, 0, Math.PI * 2); g.fill(); }
    } else if (lv === 3) {
      // groupe froid et thermomètre
      px(54, 4, 52, 14, '#98a6b6'); px(55, 5, 50, 12, '#c4d0dc');
      for (let x = 58; x < 102; x += 3) px(x, 7, 1, 8, '#6c7a8c');
      px(124, 6, 22, 12, '#1c2a3a'); px(126, 8, 18, 8, '#0c1420');
      g.fillStyle = '#5ef0ff'; g.font = '8px monospace'; g.fillText('2°C', 127, 15);
    } else if (lv === 4) {
      // verrière et poutre rouge
      px(0, 0, W, 6, '#3a4250');
      for (let wx = 10; wx < W - 10; wx += 48) { px(wx, 8, 40, 16, '#2a303a'); for (let i = 0; i < 4; i++) px(wx + 2 + i * 10, 10, 8, 12, '#7ab0d0'); }
      px(0, 26, W, 3, '#c85a2c'); px(0, 26, W, 1, '#e88a5a');
    } else {
      // néons et bras robotisé au plafond
      px(0, 4, W, 1, '#5ef0ff'); px(0, 5, W, 1, '#1c8ca8');
      px(20, 6, 120, 3, '#b8c6d6'); px(70, 9, 6, 12, '#8a9ab0'); px(66, 20, 14, 3, '#5a6a82'); px(72, 23, 2, 3, '#5ef0ff');
    }
    // sol
    const top = FLOOR;
    if (lv === 1) {
      px(0, top, W, ROOM_H - top, '#6a6e74');
      for (let i = 0; i < 70; i++) px(Math.floor(hash(i, 1) * W), top + Math.floor(hash(i, 2) * (ROOM_H - top)), 1, 1, '#585c62');
      g.fillStyle = 'rgba(20,16,24,0.35)'; g.beginPath(); g.ellipse(120, 270, 16, 5, 0, 0, Math.PI * 2); g.fill(); // tache d'huile
    } else if (lv === 2) {
      // terre battue et vieux pavés, plus sombres et plus chauds que les murs de pierre
      px(0, top, W, ROOM_H - top, '#4a3424');
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(hash(i, 31) * W);
        const y = top + 4 + Math.floor(hash(i, 32) * (ROOM_H - top - 6));
        const w = 6 + Math.floor(hash(i, 33) * 6);
        px(x, y, w, 3, '#5e4430'); px(x, y, w, 1, '#6e5038'); px(x, y + 3, w, 1, '#2e2016');
      }
      // plinthe au pied du mur
      px(0, top, W, 3, '#2e2622'); px(0, top + 3, W, 1, '#1e1814');
    } else if (lv === 3) {
      px(0, top, W, ROOM_H - top, '#b8c4ce');
      for (let x = 0; x < W; x += 6) px(x, top, 1, ROOM_H - top, '#a4b0bc');
    } else if (lv === 4) {
      px(0, top, W, ROOM_H - top, '#6a6e74');
      px(0, top + 6, W, 2, '#f2c14e'); px(0, ROOM_H - 10, W, 2, '#f2c14e');
    } else {
      px(0, top, W, ROOM_H - top, '#1c2230');
      for (let y = top; y < ROOM_H; y += 10) px(0, y, W, 1, '#2a3244');
      px(0, top + 4, W, 1, '#5ef0ff');
    }
    px(0, top, W, 2, '#00000040');
    // bureau
    const d = DESK;
    const deskTop = d.y + 26;
    if (lv <= 2) {
      // établi en bois
      px(d.x, deskTop, d.w, 5, '#8a5a2c'); px(d.x, deskTop, d.w, 1, '#c88a4a'); px(d.x, deskTop + 4, d.w, 1, '#4c2c14');
      for (const lx of [d.x + 3, d.x + d.w - 7]) { px(lx, deskTop + 5, 4, d.h - 31, '#744620'); px(lx, deskTop + 5, 1, d.h - 31, '#a06830'); }
      px(d.x + 3, deskTop + 24, d.w - 6, 3, '#744620');
    } else {
      const s = lv === 5 ? ['#ffffff', '#dce6f0', '#8a9ab0'] : ['#c4d0dc', '#98a6b6', '#465264'];
      px(d.x, deskTop, d.w, 4, s[1]!); px(d.x, deskTop, d.w, 1, s[0]!); px(d.x, deskTop + 3, d.w, 1, s[2]!);
      px(d.x + d.w - 26, deskTop + 4, 24, d.h - 30, s[1]!); px(d.x + d.w - 26, deskTop + 4, 1, d.h - 30, s[0]!);
      for (let k = 0; k < 3; k++) px(d.x + d.w - 22, deskTop + 10 + k * 12, 16, 1, s[2]!);
      px(d.x + 4, deskTop + 4, 3, d.h - 30, s[2]!);
    }
    // chaise
    const cx = d.x + 18;
    px(cx, deskTop + 10, 18, 3, lv === 5 ? '#f4f8fc' : '#3e3a50');
    px(cx + 8, deskTop + 13, 2, 16, '#2c283a');
    px(cx + 2, deskTop + 29, 14, 2, '#2c283a');
  }

  /** L'ordinateur des commandes : son écran clignote quand des commandes attendent. */
  private drawComputer(game: Game, lv: number, t: number): void {
    const g = this.g;
    const px = painter(g);
    const d = DESK;
    const deskTop = d.y + 26;
    const n = game.orders.length;
    const ready = game.readyOrders.length;
    const blink = Math.floor(t * 2) % 2 === 0;
    let sx: number, sy: number, sw: number, sh: number;
    if (lv <= 2) {
      // vieux moniteur cathodique beige
      px(d.x + 10, deskTop - 22, 34, 22, '#b8ac8c'); px(d.x + 10, deskTop - 22, 34, 1, '#e0d6b8'); px(d.x + 43, deskTop - 22, 1, 22, '#8a7e62');
      px(d.x + 18, deskTop - 2, 18, 2, '#8a7e62');
      [sx, sy, sw, sh] = [d.x + 13, deskTop - 19, 28, 15];
      px(d.x + 8, deskTop - 1, 38, 1, '#5a5040');
      // clavier
      px(d.x + 46, deskTop - 3, 22, 3, '#b8ac8c'); for (let i = 0; i < 9; i++) px(d.x + 47 + i * 2, deskTop - 2, 1, 1, '#6a604c');
    } else if (lv <= 4) {
      // écran plat sur pied
      px(d.x + 8, deskTop - 26, 40, 24, '#2c283a'); px(d.x + 8, deskTop - 26, 40, 1, '#545068');
      px(d.x + 26, deskTop - 2, 4, 2, '#2c283a'); px(d.x + 21, deskTop - 1, 14, 1, '#3e3a50');
      [sx, sy, sw, sh] = [d.x + 10, deskTop - 24, 36, 19];
      px(d.x + 50, deskTop - 2, 20, 2, '#3e3a50'); for (let i = 0; i < 9; i++) px(d.x + 51 + i * 2, deskTop - 2, 1, 1, '#8c88a0');
    } else {
      // terminal holographique
      px(d.x + 20, deskTop - 3, 20, 3, '#dce6f0'); px(d.x + 22, deskTop - 3, 16, 1, '#5ef0ff');
      [sx, sy, sw, sh] = [d.x + 8, deskTop - 32, 44, 26];
      g.fillStyle = 'rgba(94,240,255,0.10)';
      g.beginPath(); g.moveTo(d.x + 22, deskTop - 3); g.lineTo(sx, sy + sh); g.lineTo(sx + sw, sy + sh); g.lineTo(d.x + 38, deskTop - 3); g.fill();
    }
    const holo = lv === 5;
    const ink = holo ? 'rgba(12,30,48,0.55)' : lv <= 2 ? '#0c1a10' : '#0c1420';
    const fg = holo ? '#5ef0ff' : lv <= 2 ? '#7cff9c' : '#f2c14e';
    px(sx, sy, sw, sh, ink);
    if (!holo) for (let y = sy; y < sy + sh; y += 2) px(sx, y, sw, 1, '#ffffff08'); // lignes de balayage
    // au centre de l'écran : une enveloppe et le nombre de commandes ; elle scintille quand on peut en livrer
    const digits = String(Math.min(n, 99));
    const ew = 14;
    const eh = 9;
    const dw = digits.length * 4 - 1;
    const total = ew + 2 + dw;
    const ex = sx + Math.floor((sw - total) / 2);
    const ey = sy + Math.floor((sh - eh) / 2);
    const shine = ready > 0 ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
    const env = ready > 0 ? (shine > 0.5 ? '#ffffff' : '#f2c14e') : n > 0 ? fg : fg + '70';
    if (ready > 0) {
      g.fillStyle = `rgba(242,193,78,${0.15 + 0.25 * shine})`;
      g.fillRect(ex - 2, ey - 2, ew + 4, eh + 4);
    }
    px(ex, ey, ew, eh, env);
    g.fillStyle = ink;
    for (let i = 0; i < 7; i++) { g.fillRect(ex + i, ey + i, 1, 1); g.fillRect(ex + 13 - i, ey + i, 1, 1); }
    if (ready > 0 && shine > 0.7) { px(ex - 2, ey - 2, 1, 1, '#ffffff'); px(ex + ew + 1, ey + eh, 1, 1, '#ffffff'); }
    drawDigits(g, digits, ex + ew + 2, ey + 2, ready > 0 ? env : n > 0 ? fg : fg + '70');
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
    g.drawImage(this.background(lv, t), 0, 0);
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
      g.beginPath(); g.moveTo(x - 2, 0); g.lineTo(x + 2, 0); g.lineTo(x + sweep + 18, CELLAR_Y); g.lineTo(x + sweep - 18, CELLAR_Y); g.fill();
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
    const back = COUNTER.top;
    wall(g, px, lv <= 2 ? 'plank' : lv === 3 ? 'green' : lv === 4 ? 'brick' : 'future', COUNTER.front);
    if (lv === 1) {
      // bois grisé par la poussière, fissure, toiles d'araignée, une seule ampoule
      g.fillStyle = 'rgba(90,80,70,0.45)'; g.fillRect(0, 0, W, COUNTER.front);
      px(104, 26, 1, 10, '#3a2c20'); px(105, 35, 1, 8, '#3a2c20');
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      for (const [x0, dir] of [[0, 1], [W - 1, -1]] as const) {
        g.beginPath();
        g.moveTo(x0, 1); g.lineTo(x0 + dir * 18, 1); g.moveTo(x0, 1); g.lineTo(x0, 20); g.moveTo(x0, 1); g.lineTo(x0 + dir * 14, 14);
        g.moveTo(x0 + dir * 6, 1); g.lineTo(x0, 7); g.moveTo(x0 + dir * 11, 1); g.lineTo(x0, 12);
        g.stroke();
      }
      px(80, 0, 1, 14, '#1b1424'); px(78, 14, 5, 5, '#f0d890'); px(79, 15, 3, 3, '#fff4b0');
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
      px(0, 76, W, COUNTER.front - 76, '#4a2c14');
      for (let x = 0; x < W; x += 20) { px(x + 2, 80, 16, 26, '#5a3a1c'); px(x + 2, 80, 16, 1, '#744620'); }
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
      px(0, f, W, fh, '#5a4a3a');
      for (let y = f; y < CELLAR_Y; y += 6) { px(0, y, W, 1, '#3a2e24'); for (let x = (y * 7) % 30; x < W; x += 30) px(x, y, 1, 6, '#3a2e24'); }
      for (let i = 0; i < 25; i++) px(Math.floor(hash(i, 5) * W), f + Math.floor(hash(i, 6) * fh), 2, 1, '#6e5e4c');
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
      for (let j = 0; f + j * 8 < CELLAR_Y; j++) for (let i = 0; i * 8 < W; i++) px(i * 8, f + j * 8, 8, 8, (i + j) % 2 ? '#e8e4dc' : '#3e3a50');
    } else if (lv === 3) {
      px(0, f, W, fh, '#6a2a22');
      for (let y = f + 4; y < CELLAR_Y; y += 12) for (let x = (y % 24) ? 0 : 6; x < W; x += 12) px(x, y, 4, 4, '#8a3a2a');
    } else if (lv === 4) {
      px(0, f, W, fh, '#5a5e64');
      for (let i = 0; i < 40; i++) px(Math.floor(hash(i, 7) * W), f + Math.floor(hash(i, 8) * fh), 1, 1, '#4a4e54');
    } else {
      px(0, f, W, fh, '#1c2230');
      for (let y = f; y < CELLAR_Y; y += 10) px(0, y, W, 1, '#2a3244');
    }
    px(0, f, W, 2, '#00000060');
    // ---------------------------------------------------------------- la cave
    const c = CELLAR_Y;
    // dalle du plancher
    px(0, c, W, 6, lv === 5 ? '#b8c6d6' : lv === 4 ? '#6a6e74' : '#4a2e14');
    px(0, c, W, 1, lv === 5 ? '#ffffff' : lv === 4 ? '#8a8e94' : '#7a5228');
    for (let x = 6; x < W; x += 22) px(x, c + 6, 4, 6, lv >= 4 ? '#3e3a50' : '#3a240e'); // solives
    // mur de cave : pierre, brique ou béton selon le niveau
    const cw = c + 6;
    if (lv <= 3) {
      px(0, cw, W, ROOM_H - cw, '#2e2622');
      for (let y = cw, row = 0; y < ROOM_H; y += 8, row++)
        for (let x = -((row * 5) % 14); x < W; x += 14) { px(x + 1, y + 1, 12, 6, ['#3e342c', '#38302a', '#443a30'][(x + row) & 1 ? 0 : row % 3]!); px(x + 1, y + 1, 12, 1, '#4e4236'); }
    } else if (lv === 4) {
      px(0, cw, W, ROOM_H - cw, '#3a3e46');
      for (let y = cw; y < ROOM_H; y += 12) px(0, y, W, 1, '#2c3038');
    } else {
      px(0, cw, W, ROOM_H - cw, '#141a26');
      for (let y = cw + 10; y < ROOM_H; y += 20) px(0, y, W, 1, '#1c8ca8');
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, cw, W, 6); // ombre sous le plancher
    // sol de la cave
    px(0, KEG_FLOOR, W, ROOM_H - KEG_FLOOR, lv === 5 ? '#0c1018' : '#1e1814');
    px(0, KEG_FLOOR, W, 1, lv === 5 ? '#5ef0ff' : '#4a3e32');
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
