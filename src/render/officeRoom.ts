/**
 * Le bureau, au même format que les autres pièces (160 × 300) : une grande fenêtre donne sur l'atelier (on y voit
 * les machines tourner en direct), le panneau de liège où s'épinglent les commandes, l'horloge, le présentoir de la gamme,
 * et le bureau avec l'ordinateur. Son décor suit le niveau de l'ordinateur (5 décors).
 */
import type { Game } from '../core/game';
import type { Label } from '../core/label';
import { MAX_RANGE } from '../core/warehouse';
import { drawMiniLabel } from './labelArt';
import { drawDigits, hash, painter, Room, ROOM_H, ROOM_W, wall, type Px } from './rooms';
import type { Rect } from './sprites';

const FLOOR = 206;
/** Fenêtre sur l'atelier (cadre extérieur), et la vitre dedans. */
const WIN: Rect = { x: 8, y: 14, w: 144, h: 92 };
const GLASS: Rect = { x: WIN.x + 5, y: WIN.y + 5, w: WIN.w - 10, h: WIN.h - 10 };
/** Partie de l'atelier (en pixels de l'atelier) vue par la fenêtre, à l'échelle 1. */
const VIEW = { x: 13, y: 58 };
/** Panneau de liège : une feuille épinglée par commande. */
const BOARD: Rect = { x: 8, y: 118, w: 58, h: 42 };
const CLOCK = { x: 82, y: 132, r: 9 };
/** Présentoir de la gamme : 2 étagères de 4 bouteilles. */
const DISPLAY: Rect = { x: 100, y: 114, w: 54, h: 92 };
/** Bureau et ordinateur, au premier plan. */
const DESK: Rect = { x: 6, y: 212, w: 104, h: 84 };
const DESK_TOP = 250;

export type OfficeHit = 'window' | 'board' | 'display' | 'computer';

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

  /** `workshop` : le canvas de l'atelier, qu'on aperçoit par la fenêtre. */
  draw(game: Game, t: number, workshop: HTMLCanvasElement): void {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    const lv = this.levelOf(game);
    g.drawImage(this.background(lv, t), 0, 0);
    this.drawWindow(lv, t, workshop);
    this.drawBoard(game);
    this.drawClock(game, lv);
    this.drawDisplay(game, lv);
    this.drawComputer(game, lv, t);
    for (const { id, rect } of this.hits()) if (this.selected === id) this.outline(rect, t);
  }

  // ---------------------------------------------------------------- fenêtre

  private drawWindow(lv: number, t: number, workshop: HTMLCanvasElement): void {
    const g = this.g;
    const px = painter(g);
    const { x, y, w, h } = GLASS;
    g.drawImage(workshop, VIEW.x, VIEW.y, w, h, x, y, w, h);
    // la vitre : un voile bleuté, deux reflets en biais qui glissent lentement
    g.fillStyle = 'rgba(170,210,240,0.14)';
    g.fillRect(x, y, w, h);
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
    // petits bois : 3 carreaux sur 2
    const bar = lv === 5 ? '#dce6f0' : lv === 4 ? '#3a4250' : lv === 3 ? '#e8e4dc' : '#5a3a1c';
    const hi = lv === 5 ? '#ffffff' : lv === 4 ? '#5c6878' : lv === 3 ? '#ffffff' : '#8a5a2c';
    for (const k of [1, 2]) {
      const bx = x + Math.round((w * k) / 3) - 1;
      px(bx, y, 2, h, bar);
      px(bx, y, 1, h, hi);
    }
    if (lv < 5) {
      const by = y + Math.round(h * 0.48) - 1;
      px(x, by, w, 2, bar);
      px(x, by, w, 1, hi);
    }
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

  // ---------------------------------------------------------------- présentoir de la gamme

  private drawDisplay(game: Game, lv: number): void {
    const g = this.g;
    const px = painter(g);
    const d = DISPLAY;
    const [wood, woodHi, woodLo] = lv === 5 ? ['#dce6f0', '#ffffff', '#8a9ab0'] : lv === 4 ? ['#2c283a', '#545068', '#1b1424'] : ['#6a4422', '#a8743c', '#3a2010'];
    // le meuble
    px(d.x, d.y, d.w, d.h, wood);
    px(d.x, d.y, d.w, 1, woodHi);
    px(d.x, d.y, 1, d.h, woodHi);
    px(d.x + d.w - 1, d.y, 1, d.h, woodLo);
    // enseigne en haut
    px(d.x + 3, d.y + 3, d.w - 6, 9, '#1b1424');
    g.fillStyle = lv === 5 ? '#5ef0ff' : '#f2c14e';
    g.font = '8px monospace';
    g.textBaseline = 'alphabetic';
    g.fillText('GAMME', d.x + 12, d.y + 10);
    // fond éclairé de la vitrine
    const inX = d.x + 3;
    const inW = d.w - 6;
    const inY = d.y + 14;
    const inH = d.h - 22;
    px(inX, inY, inW, inH, lv === 5 ? '#e8f8ff' : '#3a2a34');
    g.fillStyle = lv === 5 ? 'rgba(94,240,255,0.15)' : 'rgba(255,220,150,0.16)';
    g.fillRect(inX, inY, inW, 6);
    // deux étagères de verre, 4 bouteilles chacune
    const shelfY = [inY + Math.floor(inH / 2) - 1, inY + inH - 2];
    for (const sy of shelfY) {
      px(inX, sy, inW, 2, '#c4e4f0');
      px(inX, sy + 1, inW, 1, '#6c8a9a');
    }
    const slots = Math.min(MAX_RANGE, 8);
    for (let i = 0; i < slots; i++) {
      const bx = inX + 3 + (i % 4) * 12;
      const base = shelfY[Math.floor(i / 4)]!;
      const beer = game.beers[i];
      if (beer) drawMiniBottle(px, g, bx, base - 22, beer.label);
      else if (i < game.rangeSlots) drawBottleGhost(px, bx, base - 22, '#ffffff30'); // place libre
    }
    // la vitre et son reflet
    g.fillStyle = 'rgba(200,230,255,0.10)';
    g.fillRect(inX, inY, inW, inH);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    for (let k = 0; k < 18; k++) g.fillRect(inX + 30 + k - Math.floor(k / 2), inY + k * 2, 2, 2);
    // socle
    px(d.x - 1, d.y + d.h - 6, d.w + 2, 6, woodLo);
    px(d.x - 1, d.y + d.h - 6, d.w + 2, 1, woodHi);
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
    const W = ROOM_W;
    wall(g, px, lv === 1 ? 'plank' : lv === 2 ? 'brick' : lv === 3 ? 'green' : lv === 4 ? 'metal' : 'future', FLOOR);
    if (lv === 3) {
      // lambris sombre sous la cimaise
      px(0, 168, W, FLOOR - 168, '#3a2416');
      for (let x = 0; x < W; x += 20) { px(x, 172, 18, FLOOR - 178, '#4a2e1c'); px(x, 172, 18, 1, '#5e3c24'); }
      px(0, 166, W, 3, '#8a5a2c'); px(0, 166, W, 1, '#c88a4a');
    }
    // fenêtre : cadre et appui
    const f = WIN;
    const [frame, frameHi, frameLo] = lv === 5 ? ['#b8c6d6', '#ffffff', '#8a9ab0'] : lv === 4 ? ['#2a303a', '#4a5462', '#1b1424'] : lv === 3 ? ['#e8e4dc', '#ffffff', '#a8a49c'] : ['#6a4422', '#a8743c', '#3a2010'];
    px(f.x - 1, f.y - 1, f.w + 2, f.h + 2, '#1b1424');
    px(f.x, f.y, f.w, f.h, frame);
    px(f.x, f.y, f.w, 1, frameHi);
    px(f.x, f.y, 1, f.h, frameHi);
    px(f.x + f.w - 1, f.y, 1, f.h, frameLo);
    px(f.x, f.y + f.h - 1, f.w, 1, frameLo);
    px(GLASS.x - 1, GLASS.y - 1, GLASS.w + 2, GLASS.h + 2, frameLo);
    px(f.x - 4, f.y + f.h, f.w + 8, 4, frame);
    px(f.x - 4, f.y + f.h, f.w + 8, 1, frameHi);
    px(f.x - 4, f.y + f.h + 4, f.w + 8, 1, '#00000060');
    if (lv === 4) {
      // store vénitien relevé
      px(f.x + 2, f.y + 2, f.w - 4, 3, '#c4d0dc');
      px(f.x + 2, f.y + 4, f.w - 4, 1, '#98a6b6');
    }
    // panneau de liège
    const b = BOARD;
    px(b.x - 1, b.y - 1, b.w + 2, b.h + 2, '#1b1424');
    px(b.x, b.y, b.w, b.h, lv === 5 ? '#e8eef4' : '#8a5a2c');
    px(b.x + 2, b.y + 2, b.w - 4, b.h - 4, lv === 5 ? '#c4d0dc' : '#c48a50');
    if (lv !== 5) for (let i = 0; i < 60; i++) px(b.x + 2 + Math.floor(hash(i, 41) * (b.w - 4)), b.y + 2 + Math.floor(hash(i, 42) * (b.h - 4)), 1, 1, '#a8703c');
    // sol
    const top = FLOOR;
    if (lv === 1) {
      for (let y = top; y < ROOM_H; y += 7) {
        px(0, y, W, 7, (y / 7) % 2 ? '#7a5228' : '#84582c');
        px(0, y, W, 1, '#4a2e14');
        for (let x = Math.floor(hash(y) * 40); x < W; x += 40) px(x, y, 1, 7, '#4a2e14');
      }
    } else if (lv === 2) {
      // parquet à bâtons rompus
      px(0, top, W, ROOM_H - top, '#9a6a36');
      for (let y = top; y < ROOM_H; y += 6) for (let x = ((y - top) / 6) % 2 ? 0 : 6; x < W; x += 12) { px(x, y, 12, 1, '#6a4422'); px(x, y, 1, 6, '#6a4422'); px(x + 1, y + 1, 10, 1, '#b07a40'); }
    } else if (lv === 3) {
      // moquette bordeaux
      px(0, top, W, ROOM_H - top, '#6a2a32');
      for (let i = 0; i < 160; i++) px(Math.floor(hash(i, 51) * W), top + Math.floor(hash(i, 52) * (ROOM_H - top)), 1, 1, i % 2 ? '#7a343c' : '#5a222a');
    } else if (lv === 4) {
      // dalles de moquette grises
      for (let y = top; y < ROOM_H; y += 16) for (let x = 0; x < W; x += 16) {
        px(x, y, 16, 16, ((x + y) / 16) % 2 ? '#5a5e66' : '#62666e');
        for (let k = 0; k < 16; k += 3) px(x + (((x + y) / 16) % 2 ? k : 0), y + (((x + y) / 16) % 2 ? 0 : k), 1, 16 - k > 0 ? 1 : 0, '#6e727a');
      }
    } else {
      px(0, top, W, ROOM_H - top, '#1c2230');
      for (let y = top; y < ROOM_H; y += 10) px(0, y, W, 1, '#2a3244');
      px(0, top + 4, W, 1, '#5ef0ff');
    }
    px(0, top, W, 2, '#00000040');
    // plinthe
    px(0, top - 3, W, 3, lv === 5 ? '#dce6f0' : '#3a2010');
    // la plante verte, à droite
    const pxp = 126;
    px(pxp, 270, 22, 22, lv === 5 ? '#dce6f0' : '#b05a32'); px(pxp, 270, 22, 2, lv === 5 ? '#ffffff' : '#d8843a'); px(pxp + 2, 292, 18, 2, '#00000040');
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (hash(i, 61) - 0.5) * 2.4;
      const len = 14 + hash(i, 62) * 16;
      for (let s = 0; s < len; s++) {
        const lx = Math.round(pxp + 11 + Math.cos(a) * s);
        const ly = Math.round(270 + Math.sin(a) * s);
        px(lx, ly, 2, 2, s > len - 6 ? '#7ee081' : i % 2 ? '#2c8a4a' : '#3a9a52');
      }
    }
    // le bureau
    const d = DESK;
    const dt = DESK_TOP;
    if (lv <= 2) {
      px(d.x, dt, d.w, 6, '#8a5a2c'); px(d.x, dt, d.w, 1, '#c88a4a'); px(d.x, dt + 5, d.w, 1, '#4c2c14');
      px(d.x + 2, dt + 6, d.w - 4, 30, '#744620'); px(d.x + 2, dt + 6, d.w - 4, 1, '#4c2c14');
      for (let k = 0; k < 3; k++) { px(d.x + 6, dt + 9 + k * 9, 30, 7, '#8a5a2c'); px(d.x + 19, dt + 12 + k * 9, 4, 1, '#c88a4a'); }
      px(d.x + 2, dt + 36, 4, d.h - 42, '#744620'); px(d.x + d.w - 6, dt + 36, 4, d.h - 42, '#744620');
    } else {
      const s = lv === 5 ? ['#ffffff', '#dce6f0', '#8a9ab0'] : lv === 4 ? ['#c4d0dc', '#98a6b6', '#465264'] : ['#c88a4a', '#8a5a2c', '#4c2c14'];
      px(d.x, dt, d.w, 5, s[1]!); px(d.x, dt, d.w, 1, s[0]!); px(d.x, dt + 4, d.w, 1, s[2]!);
      px(d.x + 3, dt + 5, 30, d.h - 11, s[1]!); px(d.x + 3, dt + 5, 1, d.h - 11, s[0]!);
      for (let k = 0; k < 3; k++) px(d.x + 8, dt + 12 + k * 12, 20, 1, s[2]!);
      px(d.x + d.w - 6, dt + 5, 3, d.h - 11, s[2]!);
    }
    // lampe de bureau
    const lx = d.x + d.w - 18;
    px(lx, dt - 2, 10, 2, '#2c283a'); px(lx + 4, dt - 16, 2, 14, '#2c283a'); px(lx, dt - 20, 10, 5, lv === 5 ? '#5ef0ff' : '#2c8a4a'); px(lx + 1, dt - 15, 8, 1, '#fff4b0');
    g.fillStyle = 'rgba(255,240,180,0.10)'; g.beginPath(); g.moveTo(lx + 1, dt - 15); g.lineTo(lx + 9, dt - 15); g.lineTo(lx + 16, dt); g.lineTo(lx - 6, dt); g.fill();
    // une tasse et des papiers
    px(d.x + 4, dt - 6, 6, 6, '#f6ecd6'); px(d.x + 10, dt - 5, 2, 3, '#f6ecd6'); px(d.x + 5, dt - 6, 4, 1, '#6a4422');
    // chaise, de dos, devant le bureau
    const cx = d.x + 34;
    const back = lv === 5 ? '#f4f8fc' : lv >= 3 ? '#2c283a' : '#3e3a50';
    px(cx, dt + 8, 26, 22, back); px(cx, dt + 8, 26, 1, '#ffffff30'); px(cx + 2, dt + 10, 22, 18, lv === 5 ? '#dce6f0' : '#4a4660');
    px(cx + 12, dt + 30, 2, 10, '#2c283a'); px(cx + 4, dt + 40, 18, 2, '#2c283a');
    px(cx + 3, dt + 42, 2, 2, '#1b1424'); px(cx + 21, dt + 42, 2, 2, '#1b1424');
  }
}

/** Petite bouteille brune (7 × 22) avec son étiquette, sur le présentoir. */
function drawMiniBottle(px: Px, g: CanvasRenderingContext2D, x: number, y: number, label: Label): void {
  px(x + 2, y, 3, 2, '#f2c14e'); // capsule
  px(x + 2, y + 2, 3, 5, '#5a3418');
  px(x + 1, y + 7, 5, 2, '#6a3c1c');
  px(x, y + 9, 7, 13, '#7a4a24');
  px(x + 1, y + 9, 1, 12, '#b07a40');
  px(x, y + 12, 7, 7, label.bg);
  drawMiniLabel(g, label, x + 1, y + 13, 5);
  px(x, y + 21, 7, 1, '#4a2a14');
}

function drawBottleGhost(px: Px, x: number, y: number, c: string): void {
  px(x + 2, y + 2, 3, 1, c);
  for (let k = 3; k < 9; k += 2) { px(x + 2, y + k, 1, 1, c); px(x + 4, y + k, 1, 1, c); }
  for (let k = 9; k < 22; k += 2) { px(x, y + k, 1, 1, c); px(x + 6, y + k, 1, 1, c); }
  for (let k = 0; k < 7; k += 2) px(x + k, y + 21, 1, 1, c);
}
