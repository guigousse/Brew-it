/**
 * Le bureau, au format des autres pièces (plan de 160 × 300, décor peint jusqu'aux bords de l'écran) :
 * une grande fenêtre, creusée dans le mur, donne sur l'atelier (on y voit les machines tourner en direct) ;
 * le panneau de liège où s'épinglent les commandes, l'horloge, le présentoir de la gamme, et le bureau avec l'ordinateur.
 * Le sol fuit vers un point à hauteur des yeux ; murs, meubles et sol sont ombrés (coins, pied des murs, ombres portées).
 * Son décor suit le niveau de l'ordinateur (5 décors), et ses murs ne ressemblent jamais à ceux de l'atelier
 * (pierre, brique, carreaux blancs, tôle, panneaux blancs) : lambris de bois, papier peint, vert anglais, plâtre bleu, panneaux sombres.
 */
import type { Game } from '../core/game';
import type { Label } from '../core/label';
import { MAX_RANGE } from '../core/warehouse';
import { drawMiniLabel } from './labelArt';
import { drawDigits, hash, painter, Room, type Px } from './rooms';
import { boxShadow, dim, dropShadow, floor, floorLight, from, mix, rgb, seam, shade, skew, trap, wallLight, type Bounds } from './space';
import type { Rect } from './sprites';

const FLOOR = 206;
/** Point de fuite : au milieu, à hauteur des yeux. */
const VX = 80;
const EYE = 122;
/** Fenêtre : l'ouverture dans le mur (nu du mur), et la vitre au fond de l'embrasure. */
const WIN: Rect = { x: 8, y: 14, w: 144, h: 92 };
const GLASS: Rect = { x: 13, y: 22, w: 134, h: 84 };
/** Partie de l'atelier (dans le plan de l'atelier) vue par la fenêtre, à l'échelle 1. */
const VIEW = { x: 13, y: 58 };
/** Panneau de liège : une feuille épinglée par commande. */
const BOARD: Rect = { x: 8, y: 120, w: 58, h: 42 };
const CLOCK = { x: 82, y: 136, r: 9 };
/** Présentoir de la gamme, contre le mur : 2 étagères de 4 bouteilles. */
const DISPLAY: Rect = { x: 100, y: 114, w: 54, h: 98 };
const SHOWCASE = { x: DISPLAY.x + 3, y: DISPLAY.y + 14, w: DISPLAY.w - 6, h: DISPLAY.h - 22 };
const SHELF_Y = [SHOWCASE.y + Math.floor(SHOWCASE.h / 2) - 1, SHOWCASE.y + SHOWCASE.h - 2];
/** Bureau et ordinateur, au premier plan ; DESK_TOP : là où se posent les objets (milieu du plateau). */
const DESK: Rect = { x: 6, y: 212, w: 104, h: 84 };
const DESK_TOP = 248;

export type OfficeHit = 'window' | 'board' | 'display' | 'computer';

/** Ce que le bureau voit de l'atelier par sa fenêtre : son canvas, et où se trouve son plan dedans. */
export interface WorkshopView { canvas: HTMLCanvasElement; b: Bounds }

export class OfficeRoom extends Room {
  hits(): { id: OfficeHit; rect: Rect }[] {
    return [
      { id: 'window', rect: WIN },
      { id: 'board', rect: BOARD },
      { id: 'display', rect: DISPLAY },
      { id: 'computer', rect: DESK },
    ];
  }

  protected levelOf(game: Game): number {
    return Math.max(1, Math.min(5, game.computerLevel));
  }

  draw(game: Game, t: number, workshop: WorkshopView): void {
    const lv = this.levelOf(game);
    this.begin(lv, t);
    this.drawWindow(lv, t, workshop);
    this.drawBoard(game);
    this.drawClock(game, lv);
    this.drawDisplay(game, lv);
    this.drawComputer(game, lv, t);
    for (const { id, rect } of this.hits()) if (this.selected === id) this.outline(rect, t);
  }

  // ---------------------------------------------------------------- fenêtre

  private drawWindow(lv: number, t: number, workshop: WorkshopView): void {
    const g = this.g;
    const px = painter(g);
    const { x, y, w, h } = GLASS;
    g.drawImage(workshop.canvas, VIEW.x + workshop.b.ox, VIEW.y + workshop.b.oy, w, h, x, y, w, h);
    // la vitre : un voile bleuté, plus sombre en haut (l'embrasure y fait de l'ombre), deux reflets qui glissent
    g.fillStyle = 'rgba(150,190,225,0.16)';
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(10,8,20,0.22)';
    g.fillRect(x, y, w, 3);
    g.fillStyle = 'rgba(10,8,20,0.12)';
    g.fillRect(x, y + 3, w, 3);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    const off = ((t * 4) % (w + 60)) - 30;
    g.fillStyle = 'rgba(255,255,255,0.10)';
    for (const [dx, bw] of [[0, 10], [16, 4]] as const) {
      g.beginPath();
      g.moveTo(x + off + dx, y);
      g.lineTo(x + off + dx + bw, y);
      g.lineTo(x + off + dx + bw - 24, y + h);
      g.lineTo(x + off + dx - 24, y + h);
      g.fill();
    }
    g.restore();
    // petits bois : 3 carreaux sur 2, avec leur ombre sur la vitre
    const [bar, hi] = WINDOW_WOOD[lv - 1]!;
    for (const k of [1, 2]) {
      const bx = x + Math.round((w * k) / 3) - 1;
      px(bx + 2, y, 1, h, 'rgba(0,0,0,0.25)');
      px(bx, y, 2, h, bar);
      px(bx, y, 1, h, hi);
    }
    if (lv < 5) {
      const by = y + Math.round(h * 0.48) - 1;
      px(x, by + 2, w, 1, 'rgba(0,0,0,0.25)');
      px(x, by, w, 2, bar);
      px(x, by, w, 1, hi);
    }
  }

  // ---------------------------------------------------------------- présentoir : les bouteilles de la gamme

  private drawDisplay(game: Game, lv: number): void {
    const g = this.g;
    const px = painter(g);
    const s = SHOWCASE;
    for (let i = 0; i < Math.min(MAX_RANGE, 8); i++) {
      const bx = s.x + 3 + (i % 4) * 12;
      const base = SHELF_Y[Math.floor(i / 4)]!;
      const beer = game.beers[i];
      if (beer) {
        px(bx + 1, base - 1, 8, 1, 'rgba(0,0,0,0.35)'); // ombre sur l'étagère
        drawMiniBottle(px, g, bx, base - 22, beer.label);
      } else if (i < game.rangeSlots) drawBottleGhost(px, bx, base - 22, lv === 5 ? '#1b142440' : '#ffffff30'); // place libre
    }
    // étagères de verre (dessus visible : elles sont sous les yeux) et la vitre
    for (const sy of SHELF_Y) {
      px(s.x, sy - 1, s.w, 1, 'rgba(220,240,255,0.45)');
      px(s.x, sy, s.w, 2, '#c4e4f0');
      px(s.x, sy + 2, s.w, 1, '#6c8a9a');
    }
    g.fillStyle = 'rgba(200,230,255,0.10)';
    g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    for (let k = 0; k < 18; k++) g.fillRect(s.x + 30 + k - Math.floor(k / 2), s.y + k * 2, 2, 2);
  }

  // ---------------------------------------------------------------- panneau de liège et horloge

  private drawBoard(game: Game): void {
    const g = this.g;
    const px = painter(g);
    const b = BOARD;
    const slots = game.boardSlots;
    const ready = new Set(game.readyOrders.map((o) => o.id));
    // une feuille par place du tableau ; les commandes en attente y sont écrites
    const cols = 3;
    const pw = 14;
    const ph = 15;
    const gx = Math.floor((b.w - 8 - cols * pw) / (cols - 1));
    for (let i = 0; i < Math.min(6, slots); i++) {
      const o = game.orders[i];
      const cx = b.x + 4 + (i % cols) * (pw + gx);
      const cy = b.y + 4 + Math.floor(i / cols) * (ph + 4);
      if (!o) {
        // place libre : la trace d'une ancienne feuille
        px(cx, cy, pw, ph, '#00000018');
        continue;
      }
      const tilt = hash(o.id, 3) < 0.5 ? 0 : 1;
      px(cx + 1, cy + 1 + tilt, pw, ph, '#00000040');
      px(cx, cy + tilt, pw, ph, o.kind === 'urgent' ? '#ffe0a0' : '#f6ecd6');
      for (let l = 0; l < 4; l++) px(cx + 2, cy + tilt + 4 + l * 3, l === 3 ? 6 : pw - 4, 1, '#8a7e62');
      px(cx + pw / 2 - 1, cy + tilt - 1, 2, 2, o.kind === 'urgent' ? '#e8553a' : '#4ea8f0'); // punaise
      if (ready.has(o.id)) {
        // prête à partir : coche verte
        px(cx + pw - 6, cy + tilt + ph - 5, 1, 2, '#2c8a4a');
        px(cx + pw - 5, cy + tilt + ph - 4, 1, 2, '#2c8a4a');
        for (let k = 0; k < 4; k++) px(cx + pw - 4 + k, cy + tilt + ph - 5 - k, 1, 2, '#2c8a4a');
      }
    }
  }

  private drawClock(game: Game, lv: number): void {
    const g = this.g;
    const { x, y, r } = CLOCK;
    // l'heure du jeu : une journée de jeu démarre à 8 h
    const day = (game.time + 8 * 3600) % 86400;
    const hAng = ((day / 3600) % 12) / 12 * Math.PI * 2 - Math.PI / 2;
    const mAng = ((day / 60) % 60) / 60 * Math.PI * 2 - Math.PI / 2;
    g.fillStyle = '#1b1424';
    for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) if (dx * dx + dy * dy <= (r + 1) * (r + 1)) g.fillRect(x + dx, y + dy, 1, 1);
    g.fillStyle = lv === 5 ? '#1c2230' : '#f6ecd6';
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r - 2) g.fillRect(x + dx, y + dy, 1, 1);
    const ink = lv === 5 ? '#5ef0ff' : '#1b1424';
    g.fillStyle = ink;
    for (let k = 0; k < 12; k += 3) g.fillRect(x + Math.round(Math.cos((k / 12) * Math.PI * 2) * (r - 2)), y + Math.round(Math.sin((k / 12) * Math.PI * 2) * (r - 2)), 1, 1);
    const hand = (a: number, len: number, col: string) => {
      g.fillStyle = col;
      for (let s = 0; s <= len; s += 0.5) g.fillRect(x + Math.round(Math.cos(a) * s), y + Math.round(Math.sin(a) * s), 1, 1);
    };
    hand(mAng, r - 2, ink);
    hand(hAng, r - 4, lv === 5 ? '#ffffff' : '#e8553a');
  }

  // ---------------------------------------------------------------- ordinateur

  /** L'ordinateur : son écran montre l'enveloppe et le nombre de commandes ; elle scintille quand on peut en livrer. */
  private drawComputer(game: Game, lv: number, t: number): void {
    const g = this.g;
    const px = painter(g);
    const d = DESK;
    const top = DESK_TOP;
    const n = game.orders.length;
    const ready = game.readyOrders.length;
    const mx = d.x + 18;
    let sx: number, sy: number, sw: number, sh: number;
    if (lv === 1) {
      // minitel beige : écran et clavier rabattable
      px(mx, top - 26, 40, 26, '#b8ac8c'); px(mx, top - 26, 40, 1, '#e0d6b8'); px(mx + 39, top - 26, 1, 26, '#8a7e62');
      px(mx + 2, top - 3, 36, 3, '#8a7e62');
      [sx, sy, sw, sh] = [mx + 5, top - 23, 30, 17];
      px(mx + 44, top - 4, 26, 4, '#b8ac8c'); for (let i = 0; i < 11; i++) px(mx + 45 + i * 2, top - 3, 1, 1, '#6a604c');
    } else if (lv === 2) {
      // PC d'occasion : moniteur cathodique et tour
      px(mx, top - 28, 42, 26, '#c8c0a8'); px(mx, top - 28, 42, 1, '#ece4cc'); px(mx + 41, top - 28, 1, 26, '#8a826a');
      px(mx + 14, top - 2, 14, 2, '#8a826a');
      [sx, sy, sw, sh] = [mx + 4, top - 25, 34, 19];
      px(mx + 46, top - 3, 26, 3, '#c8c0a8'); for (let i = 0; i < 12; i++) px(mx + 47 + i * 2, top - 2, 1, 1, '#6a604c');
      px(d.x + d.w - 14, top + 6, 12, 30, '#c8c0a8'); px(d.x + d.w - 12, top + 10, 8, 2, '#6a604c'); px(d.x + d.w - 8, top + 30, 2, 2, '#7cff9c');
    } else if (lv <= 4) {
      // écran plat sur pied (deux écrans pour le logiciel de gestion)
      const ww = lv === 4 ? 44 : 46;
      px(mx, top - 30, ww, 26, '#2c283a'); px(mx, top - 30, ww, 1, '#545068');
      px(mx + ww / 2 - 2, top - 4, 4, 4, '#2c283a'); px(mx + ww / 2 - 7, top - 1, 14, 1, '#3e3a50');
      [sx, sy, sw, sh] = [mx + 2, top - 28, ww - 4, 21];
      if (lv === 4) {
        px(mx + ww + 3, top - 26, 26, 22, '#2c283a'); px(mx + ww + 5, top - 24, 22, 17, '#0c1420');
        for (let k = 0; k < 5; k++) px(mx + ww + 7, top - 21 + k * 3, 6 + Math.round(hash(k, 9) * 12), 1, ['#4ea8f0', '#7ee081', '#f2c14e'][k % 3]!);
        px(mx + ww + 15, top - 4, 2, 4, '#2c283a');
      }
      px(mx + 6, top - 2, 30, 2, '#3e3a50'); for (let i = 0; i < 14; i++) px(mx + 7 + i * 2, top - 2, 1, 1, '#8c88a0');
    } else {
      // terminal holographique
      px(mx + 12, top - 3, 26, 3, '#dce6f0'); px(mx + 14, top - 3, 22, 1, '#5ef0ff');
      [sx, sy, sw, sh] = [mx - 2, top - 36, 54, 28];
      g.fillStyle = 'rgba(94,240,255,0.10)';
      g.beginPath(); g.moveTo(mx + 14, top - 3); g.lineTo(sx, sy + sh); g.lineTo(sx + sw, sy + sh); g.lineTo(mx + 36, top - 3); g.fill();
    }
    const holo = lv === 5;
    const ink = holo ? 'rgba(12,30,48,0.55)' : lv <= 2 ? '#0c1a10' : '#0c1420';
    const fg = holo ? '#5ef0ff' : lv <= 2 ? '#7cff9c' : '#f2c14e';
    px(sx, sy, sw, sh, ink);
    if (!holo) for (let y = sy; y < sy + sh; y += 2) px(sx, y, sw, 1, '#ffffff08'); // lignes de balayage
    const digits = String(Math.min(n, 99));
    const ew = 14;
    const eh = 9;
    const total = ew + 2 + digits.length * 4 - 1;
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

  // ---------------------------------------------------------------- décor

  protected paintBackground(g: CanvasRenderingContext2D, lv: number): void {
    const px = painter(g);
    const b = this.b;
    const { L, R, T } = b;
    const WW = R - L;
    // ---- le mur
    paintWall(g, px, b, lv);
    const lamp: [number, number, number, number] = [DESK.x + DESK.w - 13, DESK_TOP - 18, 34, 0.12];
    wallLight(g, b, T, FLOOR, [[VX, WIN.y + WIN.h + 8, 70, 0.1], lamp], lv === 5 ? 0.6 : 0.7);
    // ---- le sol, qui fuit vers le point de fuite
    paintFloor(g, b, lv);
    floorLight(g, b, FLOOR, [[VX, FLOOR + 6, 80, lv === 5 ? 0.35 : 0.16]], lv === 5 ? 0.45 : 0.55);
    // plinthe : un dessus éclairé, une face, une ombre au sol
    const [base, baseHi] = lv === 5 ? ['#0c1020', '#5ef0ff'] : lv === 4 ? ['#4a5462', '#8a96a6'] : lv === 2 ? ['#3a2010', '#7a5030'] : ['#3a2010', '#6a4422'];
    px(L, FLOOR - 4, WW, 4, base);
    px(L, FLOOR - 4, WW, 1, baseHi);
    shade(g, b, { x: L, y: FLOOR, w: WW, h: 3 }, (_, y) => 0.6 + (y - FLOOR) * 0.13);

    // ---- la fenêtre, creusée dans le mur
    const [wood, woodHi, woodLo] = CASING[lv - 1]!;
    const f = WIN;
    const gl = GLASS;
    // chambranle autour de l'ouverture, avec son ombre sur le mur
    boxShadow(g, b, { x: f.x - 3, y: f.y - 2, w: f.w + 6, h: f.h + 6 }, 5, 0.7);
    px(f.x - 5, f.y - 5, f.w + 10, f.h + 5, '#1b1424');
    px(f.x - 4, f.y - 4, f.w + 8, f.h + 4, wood);
    px(f.x - 4, f.y - 4, f.w + 8, 1, woodHi);
    px(f.x - 4, f.y - 4, 1, f.h + 4, woodHi);
    px(f.x + f.w + 3, f.y - 4, 1, f.h + 4, woodLo);
    // embrasure : le dessous du linteau (dans l'ombre), les côtés, qui fuient vers le point de fuite
    const reveal = REVEAL[lv - 1]!;
    trap(g, f.y, gl.y, f.x, f.x + f.w, gl.x, gl.x + gl.w, reveal[0]);
    skew(g, f.x, gl.x, f.y, f.y + f.h, gl.y, gl.y + gl.h, reveal[1]);
    skew(g, f.x + f.w, gl.x + gl.w, f.y, f.y + f.h, gl.y, gl.y + gl.h, reveal[1]);
    shade(g, b, { x: f.x, y: f.y, w: f.w, h: gl.y - f.y + 4 }, (x, y) => (x < gl.x || x > gl.x + gl.w || y < gl.y ? 0.75 + 0.25 * ((y - f.y) / (gl.y - f.y + 4)) : 1));
    // appui : son dessus (on le voit d'en haut), sa face, son ombre
    const sy = f.y + f.h;
    trap(g, sy - 1, sy + 3, f.x - 4, f.x + f.w + 4, f.x - 7, f.x + f.w + 7, woodHi);
    px(f.x - 7, sy + 3, f.w + 14, 3, wood);
    px(f.x - 7, sy + 6, f.w + 14, 1, woodLo);
    shade(g, b, { x: f.x - 7, y: sy + 7, w: f.w + 14, h: 5 }, (_, y) => 0.55 + (y - sy - 7) * 0.09);

    // ---- panneau de liège et horloge, accrochés au mur (ombre portée en bas à droite)
    const bd = BOARD;
    boxShadow(g, b, { x: bd.x + 2, y: bd.y + 3, w: bd.w, h: bd.h }, 3, 0.55);
    px(bd.x - 1, bd.y - 1, bd.w + 2, bd.h + 2, '#1b1424');
    px(bd.x, bd.y, bd.w, bd.h, lv === 5 ? '#e8eef4' : '#8a5a2c');
    px(bd.x, bd.y, bd.w, 1, lv === 5 ? '#ffffff' : '#b07a40');
    px(bd.x + 2, bd.y + 2, bd.w - 4, bd.h - 4, lv === 5 ? '#c4d0dc' : '#c48a50');
    px(bd.x + 2, bd.y + 2, bd.w - 4, 1, lv === 5 ? '#98a6b6' : '#8a5a2c'); // ombre du cadre sur le liège
    if (lv !== 5) for (let i = 0; i < 70; i++) px(bd.x + 2 + Math.floor(hash(i, 41) * (bd.w - 4)), bd.y + 3 + Math.floor(hash(i, 42) * (bd.h - 5)), 1, 1, i % 3 ? '#a8703c' : '#d89c60');
    dropShadow(g, b, CLOCK.x + 2, CLOCK.y + 3, CLOCK.r + 2, CLOCK.r + 2, 0.55);

    // ---- le présentoir, posé au sol contre le mur
    const d = DISPLAY;
    const [cab, cabHi, cabLo] = lv === 5 ? ['#dce6f0', '#ffffff', '#8a9ab0'] : lv === 4 ? ['#2c283a', '#545068', '#1b1424'] : lv === 3 ? ['#4a2c18', '#7a5030', '#24140a'] : ['#6a4422', '#a8743c', '#3a2010'];
    boxShadow(g, b, { x: d.x + 3, y: d.y + 2, w: d.w, h: FLOOR - d.y }, 5, 0.6);
    shade(g, b, { x: d.x - 6, y: FLOOR, w: d.w + 12, h: d.y + d.h - FLOOR + 5 }, (x, y) => {
      const k = Math.min(1, Math.max(0, (y - FLOOR) / (d.y + d.h - FLOOR + 5)));
      const side = x < d.x ? (d.x - x) / 6 : x > d.x + d.w ? (x - d.x - d.w) / 6 : 0;
      return 0.5 + 0.5 * Math.max(k ** 0.5, side);
    });
    // face latérale gauche (on la voit : le meuble est à droite du point de fuite)
    skew(g, d.x - 3, d.x, d.y + 1, FLOOR, d.y, d.y + d.h, cabLo);
    px(d.x, d.y, d.w, d.h, cab);
    px(d.x, d.y, d.w, 1, cabHi);
    px(d.x, d.y, 1, d.h, cabHi);
    px(d.x + d.w - 1, d.y, 1, d.h, cabLo);
    // enseigne
    px(d.x + 3, d.y + 3, d.w - 6, 9, '#1b1424');
    g.fillStyle = lv === 5 ? '#5ef0ff' : '#f2c14e';
    g.font = '8px monospace';
    g.textBaseline = 'alphabetic';
    g.fillText('GAMME', d.x + 12, d.y + 10);
    // le fond de la vitrine, éclairé d'en haut
    const s = SHOWCASE;
    px(s.x - 1, s.y - 1, s.w + 2, s.h + 2, '#1b1424');
    px(s.x, s.y, s.w, s.h, lv === 5 ? '#e8f8ff' : '#3a2a34');
    shade(g, b, s, (_, y) => 1.35 - ((y - s.y) / s.h) * 0.45);
    // socle
    px(d.x - 1, d.y + d.h - 6, d.w + 2, 6, cabLo);
    px(d.x - 1, d.y + d.h - 6, d.w + 2, 1, cabHi);

    // ---- la plante verte, à droite
    const pxp = 126;
    dropShadow(g, b, pxp + 13, 295, 16, 4, 0.5);
    const pot = lv === 5 ? ['#dce6f0', '#ffffff', '#8a9ab0'] : ['#b05a32', '#d8843a', '#6e3418'];
    trap(g, 273, 294, pxp, pxp + 24, pxp + 3, pxp + 21, pot[0]!);
    skew(g, pxp + 21, pxp + 24, 294, 294, 273, 273, pot[2]!); // flanc dans l'ombre
    shade(g, b, { x: pxp, y: 273, w: 24, h: 21 }, (x) => 1.12 - ((x - pxp) / 24) * 0.35);
    trap(g, 270, 274, pxp - 1, pxp + 25, pxp - 1, pxp + 25, pot[1]!); // bord du pot
    trap(g, 271, 273, pxp + 1, pxp + 23, pxp + 1, pxp + 23, '#2a1a10'); // terreau
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (hash(i, 61) - 0.5) * 2.5;
      const len = 14 + hash(i, 62) * 18;
      for (let k = 0; k < len; k++) {
        const lx = Math.round(pxp + 12 + Math.cos(a) * k);
        const ly = Math.round(272 + Math.sin(a) * k + (k / len) ** 2 * 4);
        const tip = k > len - 6;
        px(lx, ly, 2, 2, tip ? '#7ee081' : a > -Math.PI / 2 ? '#2c8a4a' : '#3aa05a');
        if (!tip && a > -Math.PI / 2) px(lx, ly + 2, 2, 1, '#1c5a30');
      }
    }

    // ---- le bureau : plateau vu d'en haut, face avant, pieds ; ombres dessous
    const dk = DESK;
    const front = DESK_TOP + 2;
    const back = DESK_TOP - 6;
    const kk = (back - front) / (EYE - front); // fuite du plateau vers le point de fuite
    const bl = dk.x + (VX - dk.x) * kk;
    const br = dk.x + dk.w + (VX - dk.x - dk.w) * kk;
    const [top, face, edge, hi] = DESK_WOOD[lv - 1]!;
    // l'ombre sous le bureau, et son ombre portée au sol
    shade(g, b, { x: dk.x - 4, y: front + 4, w: dk.w + 10, h: 300 - front - 2 }, (x, y) => {
      const inside = x >= dk.x && x <= dk.x + dk.w;
      const k = (y - front - 4) / (300 - front - 2);
      return inside ? 0.42 + 0.3 * k : 0.8 + 0.2 * Math.min(1, Math.abs(x < dk.x ? dk.x - x : x - dk.x - dk.w) / 4);
    });
    trap(g, back, front, bl, br, dk.x, dk.x + dk.w, top);
    px(Math.round(bl), back, Math.round(br - bl), 1, hi);
    shade(g, b, { x: dk.x, y: back, w: dk.w, h: front - back }, (_, y) => 0.88 + ((y - back) / (front - back)) * 0.2);
    px(dk.x, front, dk.w, 5, face);
    px(dk.x, front, dk.w, 1, hi);
    px(dk.x, front + 4, dk.w, 1, edge);
    if (lv <= 2) {
      // caisson à tiroirs à gauche, pied à droite
      px(dk.x + 2, front + 5, 36, 296 - front - 5, face);
      px(dk.x + 2, front + 5, 1, 296 - front - 5, hi);
      for (let k = 0; k < 3; k++) {
        const ty = front + 8 + k * 12;
        px(dk.x + 5, ty, 30, 10, top); px(dk.x + 5, ty, 30, 1, hi); px(dk.x + 5, ty + 9, 30, 1, edge);
        px(dk.x + 17, ty + 4, 6, 2, '#c8a860');
      }
      px(dk.x + dk.w - 7, front + 5, 5, 296 - front - 5, face);
      px(dk.x + dk.w - 7, front + 5, 1, 296 - front - 5, hi);
    } else {
      // piétement : un caisson fin et un pied
      px(dk.x + 3, front + 5, 32, 296 - front - 5, top);
      px(dk.x + 3, front + 5, 1, 296 - front - 5, hi);
      for (let k = 0; k < 3; k++) px(dk.x + 8, front + 12 + k * 12, 22, 1, edge);
      px(dk.x + dk.w - 6, front + 5, 3, 296 - front - 5, edge);
    }
    shade(g, b, { x: dk.x, y: front + 5, w: dk.w, h: 296 - front - 5 }, (_, y) => 1 - ((y - front - 5) / (296 - front - 5)) * 0.3);
    dropShadow(g, b, dk.x + 20, 297, 22, 3, 0.45);
    // lampe de bureau, et sa lumière sur le plateau
    const lx = dk.x + dk.w - 18;
    shade(g, b, { x: lx - 16, y: back, w: 40, h: front - back }, (x) => 1.25 - Math.min(1, Math.abs(x - lx - 5) / 18) * 0.25);
    px(lx - 1, DESK_TOP - 1, 12, 2, 'rgba(0,0,0,0.35)');
    px(lx, DESK_TOP - 3, 10, 2, '#2c283a'); px(lx + 4, DESK_TOP - 17, 2, 14, '#2c283a'); px(lx, DESK_TOP - 21, 10, 5, lv === 5 ? '#5ef0ff' : '#2c8a4a');
    px(lx, DESK_TOP - 21, 10, 1, lv === 5 ? '#ffffff' : '#5ec07a'); px(lx + 1, DESK_TOP - 16, 8, 1, '#fff4b0');
    g.fillStyle = 'rgba(255,240,180,0.10)'; g.beginPath(); g.moveTo(lx + 1, DESK_TOP - 16); g.lineTo(lx + 9, DESK_TOP - 16); g.lineTo(lx + 16, DESK_TOP + 1); g.lineTo(lx - 6, DESK_TOP + 1); g.fill();
    // une tasse
    px(dk.x + 4, DESK_TOP - 1, 8, 1, 'rgba(0,0,0,0.35)');
    px(dk.x + 4, DESK_TOP - 7, 6, 6, '#f6ecd6'); px(dk.x + 10, DESK_TOP - 6, 2, 3, '#f6ecd6'); px(dk.x + 5, DESK_TOP - 7, 4, 1, '#6a4422'); px(dk.x + 8, DESK_TOP - 6, 2, 5, '#c8bca4');
    // chaise, de dos, devant le bureau
    const cx = dk.x + 34;
    const seat = front + 8;
    dropShadow(g, b, cx + 13, 296, 15, 3, 0.4);
    const backc = lv === 5 ? '#f4f8fc' : lv >= 3 ? '#2c283a' : '#3e3a50';
    const cushion = lv === 5 ? '#dce6f0' : lv >= 3 ? '#3a3650' : '#4a4660';
    px(cx + 12, seat + 22, 3, 12, '#2c283a'); px(cx + 12, seat + 22, 1, 12, '#545068');
    px(cx + 3, seat + 33, 21, 2, '#2c283a');
    for (const wx of [cx + 2, cx + 12, cx + 22]) px(wx, seat + 35, 3, 2, '#1b1424');
    px(cx - 1, seat, 28, 23, '#1b1424');
    px(cx, seat, 26, 22, backc);
    px(cx + 2, seat + 2, 22, 18, cushion);
    px(cx + 2, seat + 2, 22, 1, '#ffffff30');
    shade(g, b, { x: cx, y: seat, w: 26, h: 22 }, (x, y) => 1.08 - ((x - cx) / 26) * 0.2 - ((y - seat) / 22) * 0.12);
  }
}

// ==================================================================== matières

const WINDOW_WOOD: readonly (readonly [string, string])[] = [
  ['#5a3a1c', '#8a5a2c'], ['#e8e0cc', '#ffffff'], ['#3a2010', '#6a4422'], ['#4a5462', '#8a96a6'], ['#2a3248', '#5ef0ff'],
];
/** Chambranle de la fenêtre : teinte, lumière, ombre. */
const CASING: readonly (readonly [string, string, string])[] = [
  ['#6a4422', '#a8743c', '#3a2010'], ['#e8e0cc', '#ffffff', '#a89e88'], ['#4a2c18', '#7a5030', '#24140a'], ['#8a96a6', '#c4d0dc', '#4a5462'], ['#2a3248', '#4a5878', '#0c1020'],
];
/** Embrasure : dessous du linteau, côtés. */
const REVEAL: readonly (readonly [string, string])[] = [
  ['#5a3a1c', '#7a5228'], ['#b8ac90', '#d4c8ac'], ['#1c3226', '#24402e'], ['#7a8a9c', '#8e9eb0'], ['#141a2c', '#1c2438'],
];
/** Bureau : dessus, face, arête sombre, lumière. */
const DESK_WOOD: readonly (readonly [string, string, string, string])[] = [
  ['#a06830', '#7a4a22', '#3a2010', '#c88a4a'], ['#b07a40', '#8a5a2c', '#4c2c14', '#d8a060'], ['#6a3c20', '#4a2a14', '#24140a', '#8a5a30'],
  ['#d8e0ea', '#a4b2c2', '#5a6878', '#ffffff'], ['#f4f8fc', '#c8d4e0', '#8a9ab0', '#ffffff'],
];

/**
 * Le mur du bureau, selon le niveau : 1 lambris de bois clair, 2 papier peint à rayures sur soubassement de noyer,
 * 3 vert anglais et boiseries sombres, 4 plâtre bleu-gris et bandeau orange, 5 panneaux bleu nuit à tasseaux de noyer.
 */
function paintWall(g: CanvasRenderingContext2D, px: Px, b: Bounds, lv: number): void {
  const { L, R, T } = b;
  const WW = R - L;
  const H = FLOOR - T;
  if (lv === 1) {
    for (let x = from(0, 8, L); x < R; x += 8) {
      const k = Math.floor(x / 8);
      px(x, T, 8, H, ['#b8844a', '#ac7a42', '#c08c50'][((k % 3) + 3) % 3]!);
      px(x, T, 1, H, '#6a4422');
      px(x + 1, T, 1, H, '#d8a468');
      for (let y = T; y < FLOOR; y += 4) if (hash(k, y) < 0.12) px(x + 2 + Math.floor(hash(k, y + 1) * 4), y, 2, 3, '#9a6a36');
    }
    // cimaise et soubassement à panneaux
    px(L, 166, WW, 4, '#7a4a22'); px(L, 166, WW, 1, '#d8a468'); px(L, 169, WW, 1, '#3a2010');
    px(L, 170, WW, FLOOR - 170, '#8a5a2c');
    for (let x = from(2, 30, L); x < R; x += 30) {
      px(x, 174, 26, FLOOR - 182, '#9a6a36');
      px(x, 174, 26, 1, '#5a3a1c'); px(x, 174, 1, FLOOR - 182, '#5a3a1c');
      px(x + 25, 174, 1, FLOOR - 182, '#c08c50'); px(x, FLOOR - 9, 26, 1, '#c08c50');
    }
  } else if (lv === 2) {
    // papier peint crème à rayures vert sauge et petits fleurons
    px(L, T, WW, H, '#e4d6b2');
    for (let x = from(0, 16, L); x < R; x += 16) {
      px(x, T, 6, H, '#a4b890'); px(x, T, 1, H, '#7e9470'); px(x + 5, T, 1, H, '#7e9470');
      for (let y = from(4, 12, T); y < 160; y += 12) {
        const fx = x + 11;
        const fy = y + ((Math.floor(y / 12) & 1) ? 6 : 0);
        px(fx, fy, 1, 3, '#a8483a'); px(fx - 1, fy + 1, 3, 1, '#a8483a'); px(fx, fy + 3, 1, 1, '#7e9470');
      }
    }
    // soubassement en noyer, cimaise
    px(L, 160, WW, 5, '#3a2010'); px(L, 160, WW, 1, '#8a5a2c'); px(L, 163, WW, 1, '#6a4422');
    px(L, 165, WW, FLOOR - 165, '#5a3420');
    for (let x = from(3, 26, L); x < R; x += 26) {
      px(x, 169, 22, FLOOR - 177, '#6a4028');
      px(x, 169, 22, 1, '#2a1408'); px(x, 169, 1, FLOOR - 177, '#2a1408');
      px(x + 21, 169, 1, FLOOR - 177, '#8a5a38'); px(x, FLOOR - 9, 22, 1, '#8a5a38');
    }
  } else if (lv === 3) {
    // vert anglais à motif damassé, frise dorée, boiseries sombres
    px(L, T, WW, H, '#2c4a3a');
    for (let y = from(4, 14, T); y < 164; y += 14) for (let x = from(6 + ((Math.floor(y / 14) & 1) ? 7 : 0), 14, L); x < R; x += 14) {
      px(x, y, 1, 3, '#3c5e4a'); px(x - 1, y + 1, 3, 1, '#3c5e4a');
    }
    px(L, 6, WW, 2, '#a8843c'); px(L, 6, WW, 1, '#e0c070');
    px(L, 164, WW, FLOOR - 164, '#3a2416');
    for (let x = from(0, 20, L); x < R; x += 20) { px(x + 1, 170, 18, FLOOR - 178, '#4a2e1c'); px(x + 1, 170, 18, 1, '#24140a'); px(x + 18, 170, 1, FLOOR - 178, '#6a4428'); }
    px(L, 162, WW, 3, '#8a5a2c'); px(L, 162, WW, 1, '#c88a4a');
  } else if (lv === 4) {
    // plâtre bleu-gris, légèrement nuancé, bandeau orange, soubassement plus sombre
    for (let y = T; y < FLOOR; y++) for (let x = L; x < R; x += 4) px(x, y, 4, 1, hash(Math.floor(x / 4), y) < 0.3 ? '#a2b2c2' : '#a8b8c8');
    px(L, 170, WW, 4, '#e8742a'); px(L, 170, WW, 1, '#ffb070'); px(L, 173, WW, 1, '#a84a14');
    px(L, 174, WW, FLOOR - 174, '#7a8a9c');
    for (let x = from(0, 40, L); x < R; x += 40) px(x, 174, 1, FLOOR - 174, '#6a7a8c');
  } else {
    // panneaux bleu nuit, tasseaux de noyer, bandeau lumineux
    px(L, T, WW, H, '#161c30');
    for (let x = from(0, 6, L); x < R; x += 6) { px(x, 44, 3, FLOOR - 44, '#5a3a24'); px(x, 44, 1, FLOOR - 44, '#7a5234'); }
    px(L, 40, WW, 4, '#0c1020'); px(L, 41, WW, 1, '#5ef0ff'); px(L, 42, WW, 1, '#1c8ca8');
    for (let x = from(0, 40, L); x < R; x += 40) px(x, T, 1, 40 - T, '#222a44');
  }
}

/** Le sol du bureau, en perspective : planches, parquet, moquette et tapis, dalles de moquette, résine. */
function paintFloor(g: CanvasRenderingContext2D, b: Bounds, lv: number): void {
  if (lv === 1) {
    const woods = ['#8a5a2c', '#7e5228', '#946232'].map(rgb);
    const seamC = rgb('#3a2010');
    floor(g, b, FLOOR, VX, EYE, 24, (u, v, du, dv) => {
      const bi = Math.floor(u * 2);
      if (seam(u * 2, du * 2)) return seamC;
      const ve = v + hash(bi, 7) * 4;
      if (seam(ve / 4, dv / 4)) return seamC;
      let c = woods[Math.floor(hash(bi, Math.floor(ve / 4)) * 3)]!;
      if (hash(Math.floor(u * 18), Math.floor(v * 3)) < 0.18) c = dim(c, 0.9);
      return c;
    });
  } else if (lv === 2) {
    // parquet en vannerie : des carrés de trois lames, alternés
    const oak = ['#b8864a', '#ac7c42', '#c29052', '#a47440'].map(rgb);
    const seamC = rgb('#5a3418');
    floor(g, b, FLOOR, VX, EYE, 18, (u, v, du, dv) => {
      if (seam(u, du) || seam(v, dv)) return seamC;
      const ci = Math.floor(u);
      const cj = Math.floor(v);
      const along = ((ci + cj) & 1) === 0;
      const w = along ? u : v;
      const dw = along ? du : dv;
      if (seam(w * 3, dw * 3)) return mix(seamC, oak[0]!, 0.5);
      return oak[Math.floor(hash(ci * 7 + Math.floor(w * 3), cj) * 4)]!;
    });
  } else if (lv === 3) {
    // moquette bordeaux et grand tapis à bordure dorée sous le bureau
    const carpet = [rgb('#6a2a32'), rgb('#74323a'), rgb('#5e242c')];
    const navy = rgb('#24305a');
    const navy2 = rgb('#2c3a6a');
    const gold = rgb('#c8963c');
    const red = rgb('#8a2a32');
    floor(g, b, FLOOR, VX, EYE, 20, (u, v) => {
      const n = hash(Math.floor(u * 10), Math.floor(v * 10));
      const inRug = u > -4.2 && u < 2.4 && v > 5.8 && v < 9.4;
      if (!inRug) return carpet[n < 0.25 ? 1 : n > 0.8 ? 2 : 0]!;
      const e = Math.min(u + 4.2, 2.4 - u, v - 5.8, 9.4 - v);
      if (e < 0.12) return rgb('#e8d8a8'); // frange
      if (e < 0.45) return (Math.floor((u + v) * 6) & 1) ? gold : dim(gold, 0.8);
      if (e < 0.55) return red;
      const m = ((u + 0.9) / 2.2) ** 2 + ((v - 7.6) / 1.1) ** 2; // médaillon
      if (m < 0.5) return n < 0.5 ? red : dim(red, 0.85);
      if (m < 0.62) return gold;
      return n < 0.5 ? navy : navy2;
    });
  } else if (lv === 4) {
    // dalles de moquette grises, posées en alternance
    const a = rgb('#5c626c');
    const c = rgb('#686e78');
    const seamC = rgb('#4a5058');
    floor(g, b, FLOOR, VX, EYE, 14, (u, v, du, dv) => {
      if (seam(u, du) || seam(v, dv)) return seamC;
      const ci = Math.floor(u);
      const cj = Math.floor(v);
      const w = ((ci + cj) & 1) ? u : v;
      let col = Math.floor(w * 6) & 1 ? a : c;
      if (hash(ci, cj) < 0.3) col = dim(col, 0.95);
      return col;
    });
  } else {
    // résine noire brillante, quadrillage lumineux
    const base = rgb('#141a28');
    const line = rgb('#1c8ca8');
    floor(g, b, FLOOR, VX, EYE, 16, (u, v, du, dv) => {
      if (seam(u / 2, du / 2) || seam(v / 2, dv / 2)) return line;
      return hash(Math.floor(u * 8), Math.floor(v * 8)) < 0.04 ? rgb('#222a3c') : base;
    });
  }
}

/** Petite bouteille brune (7 × 22) avec son étiquette, sur le présentoir, dans la forme choisie pour la bière. */
function drawMiniBottle(px: Px, g: CanvasRenderingContext2D, x: number, y: number, label: Label): void {
  const shape = label.bottle ?? 'classic';
  const top = shape === 'stubby' ? y + 6 : y;
  const neckEnd = shape === 'longneck' ? y + 9 : shape === 'stubby' ? y + 9 : y + 7;
  const neckW = shape === 'stubby' ? 5 : 3;
  const nx = x + Math.floor((7 - neckW) / 2);
  // goulot et capsule (ou bouchon mécanique, ou feuille d'or)
  if (shape === 'champagne') px(nx, top, neckW, 6, '#f2c14e');
  else if (shape === 'swing') { px(nx, top, neckW, 2, '#f6ecd6'); px(nx - 1, top + 2, 1, 3, '#98a6b6'); px(nx + neckW, top + 2, 1, 3, '#98a6b6'); }
  else px(nx, top, neckW, 2, '#f2c14e');
  if (shape !== 'champagne') px(nx, top + 2, neckW, neckEnd - top - 2, '#5a3418');
  else px(nx, top + 6, neckW, Math.max(0, neckEnd - top - 6), '#5a3418');
  px(x + 1, neckEnd, 5, 2, '#6a3c1c');
  px(x, neckEnd + 2, 7, y + 22 - neckEnd - 2, '#7a4a24');
  px(x + 1, neckEnd + 2, 1, y + 21 - neckEnd - 2, '#b07a40');
  px(x + 6, neckEnd + 2, 1, y + 21 - neckEnd - 2, '#4a2a14');
  const ly = shape === 'classic' || shape === 'swing' ? y + 12 : y + 13;
  px(x, ly, 7, 7, label.bg);
  drawMiniLabel(g, label, x + 1, ly + 1, 5);
  px(x, y + 21, 7, 1, '#4a2a14');
}

function drawBottleGhost(px: Px, x: number, y: number, c: string): void {
  px(x + 2, y + 2, 3, 1, c);
  for (let k = 3; k < 9; k += 2) { px(x + 2, y + k, 1, 1, c); px(x + 4, y + k, 1, 1, c); }
  for (let k = 9; k < 22; k += 2) { px(x, y + k, 1, 1, c); px(x + 6, y + k, 1, 1, c); }
  for (let k = 0; k < 7; k += 2) px(x + k, y + 21, 1, 1, c);
}
