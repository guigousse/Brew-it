/**
 * Le magasin, en pixel art comme les autres pièces (160 × 300) : des étagères en bois, l'objet en vente sur la plus haute,
 * une caisse mystère pour le suivant, des objets « bientôt » sous des draps, et le comptoir du marchand avec sa caisse.
 */
import type { Game } from '../core/game';
import type { ShopItemId } from '../core/market';
import { paintIcon, type IconId } from './icons';
import { ROOM_H, ROOM_W, Room } from './rooms';
import type { Rect } from './sprites';

type Px = (x: number, y: number, w: number, h: number, c: string) => void;
const painter = (g: CanvasRenderingContext2D): Px => (x, y, w, h, c) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};

/** Dessus des trois étagères. */
const SHELVES = [92, 150, 204];
const FLOOR = 226;
/** L'objet en vente (icône ×2), la caisse mystère, les quatre objets sous leur drap. */
export const SHOP_SPOTS = {
  sale: { x: 30, y: SHELVES[0]! - 34, w: 36, h: 34 } as Rect,
  mystery: { x: 98, y: SHELVES[0]! - 20, w: 26, h: 20 } as Rect,
  soon: [
    { x: 18, y: SHELVES[1]! - 24, w: 50, h: 24 },
    { x: 92, y: SHELVES[1]! - 24, w: 50, h: 24 },
    { x: 18, y: SHELVES[2]! - 24, w: 50, h: 24 },
    { x: 92, y: SHELVES[2]! - 24, w: 50, h: 24 },
  ] as Rect[],
};
const ITEM_ICON: Record<ShopItemId, IconId> = { darts: 'darts', tv: 'tv', disco: 'disco' };

export class ShopRoom extends Room {
  protected levelOf(): number {
    return 1;
  }

  hits(): { id: string; rect: Rect }[] {
    return [{ id: 'sale', rect: SHOP_SPOTS.sale }, { id: 'mystery', rect: SHOP_SPOTS.mystery }, ...SHOP_SPOTS.soon.map((r, i) => ({ id: `soon${i}`, rect: r }))];
  }

  protected paintBackground(g: CanvasRenderingContext2D): void {
    const px = painter(g);
    const W = ROOM_W;
    // papier peint à rayures, plinthe en bois
    for (let x = 0; x < W; x += 8) { px(x, 0, 4, FLOOR, '#5a3a4a'); px(x + 4, 0, 4, FLOOR, '#64404f'); }
    for (let y = 6; y < FLOOR; y += 12) for (let x = 2; x < W; x += 8) px(x + ((y / 12) % 2) * 4, y, 1, 1, '#8a5a6a');
    px(0, FLOOR - 14, W, 14, '#6a4422'); px(0, FLOOR - 14, W, 1, '#a8743c'); px(0, FLOOR - 1, W, 1, '#3a2010');
    // enseigne
    px(34, 8, 92, 18, '#1b1424'); px(35, 9, 90, 16, '#3a2418'); px(35, 9, 90, 1, '#6a4422');
    g.fillStyle = '#f2c14e'; g.font = '9px monospace'; g.textBaseline = 'alphabetic'; g.fillText('MAGASIN', 61, 21);
    px(46, 0, 1, 8, '#1b1424'); px(113, 0, 1, 8, '#1b1424');
    // suspension
    px(80, 26, 1, 10, '#1b1424'); px(74, 36, 13, 4, '#2c5a3a'); px(76, 40, 9, 1, '#fff4b0');
    g.fillStyle = 'rgba(255,230,160,0.07)'; g.beginPath(); g.moveTo(75, 40); g.lineTo(86, 40); g.lineTo(118, FLOOR); g.lineTo(42, FLOOR); g.fill();
    // étagères : montants, planches, consoles
    px(8, 40, 3, FLOOR - 54, '#4a2c14'); px(149, 40, 3, FLOOR - 54, '#4a2c14');
    for (const y of SHELVES) {
      px(8, y, 144, 4, '#8a5a2c'); px(8, y, 144, 1, '#c88a4a'); px(8, y + 4, 144, 1, '#3a2010');
      for (const bx of [20, 80, 138]) { px(bx, y + 5, 2, 5, '#4a2c14'); px(bx - 2, y + 5, 6, 1, '#4a2c14'); }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(8, y + 5, 144, 3);
    }
    // sol en damier
    for (let y = FLOOR; y < ROOM_H; y += 10) for (let x = 0; x < W; x += 10) px(x, y, 10, 10, ((x + y) / 10) % 2 ? '#c8b89a' : '#8a7a62');
    px(0, FLOOR, W, 2, '#00000040');
    // comptoir du marchand, caisse enregistreuse
    const cy = 252;
    px(14, cy, 132, 6, '#a8743c'); px(14, cy, 132, 1, '#d8a868'); px(14, cy + 5, 132, 1, '#4a2c14');
    px(18, cy + 6, 124, 36, '#7a5228');
    for (let x = 24; x < 140; x += 14) px(x, cy + 10, 10, 28, '#6a4422');
    px(104, cy - 12, 24, 12, '#3e3a50'); px(104, cy - 12, 24, 1, '#8c88a0'); px(108, cy - 18, 16, 6, '#2c283a');
    px(110, cy - 16, 12, 2, '#7ee081'); for (let i = 0; i < 4; i++) px(107 + i * 5, cy - 8, 3, 2, '#c4d0dc');
  }

  draw(game: Game, t: number): void {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.background(1, t), 0, 0);
    const px = painter(g);
    // l'objet en vente, sur la plus haute étagère, qui brille un peu quand on peut se l'offrir
    const item = game.nextItem;
    const s = SHOP_SPOTS.sale;
    if (item) {
      const bob = Math.round(Math.sin(t * 2) * 1);
      paintIcon(g, ITEM_ICON[item.id], s.x + 2, s.y + bob, 2);
      if (game.money >= item.cost && Math.floor(t * 3) % 3 === 0) {
        px(s.x + 30, s.y + 2, 1, 3, '#ffffff'); px(s.x + 29, s.y + 3, 3, 1, '#ffffff');
        px(s.x + 2, s.y + 22, 1, 3, '#fff4b0'); px(s.x + 1, s.y + 23, 3, 1, '#fff4b0');
      }
    } else {
      // tout est vendu : une petite pancarte
      px(s.x, s.y + 14, 36, 16, '#1b1424'); px(s.x + 1, s.y + 15, 34, 14, '#e8dcc0');
      g.fillStyle = '#a8483a'; g.font = '7px monospace'; g.fillText('VENDU', s.x + 6, s.y + 25);
    }
    // caisse mystère : le prochain objet de la série
    const m = SHOP_SPOTS.mystery;
    if (item && item.id !== 'disco') {
      px(m.x, m.y, m.w, m.h, '#1b1424'); px(m.x + 1, m.y + 1, m.w - 2, m.h - 2, '#b8803e'); px(m.x + 1, m.y + 1, m.w - 2, 2, '#d8a868');
      px(m.x + 1, m.y + 9, m.w - 2, 1, '#8a5a28');
      // point d'interrogation
      const q = ['.kkk.', 'k...k', '...k.', '..k..', '.....', '..k..'];
      q.forEach((row, j) => [...row].forEach((c, i) => c === 'k' && px(m.x + 10 + i, m.y + 5 + j, 1, 1, '#1b1424')));
    }
    // objets « bientôt » sous leur drap
    for (const r of SHOP_SPOTS.soon) {
      g.fillStyle = '#1b1424';
      g.beginPath(); g.moveTo(r.x + 2, r.y + r.h); g.quadraticCurveTo(r.x + r.w / 2, r.y - 6, r.x + r.w - 2, r.y + r.h); g.fill();
      g.fillStyle = '#d8d0c0';
      g.beginPath(); g.moveTo(r.x + 4, r.y + r.h); g.quadraticCurveTo(r.x + r.w / 2, r.y - 3, r.x + r.w - 4, r.y + r.h); g.fill();
      for (let k = 1; k < 4; k++) px(r.x + (r.w * k) / 4, r.y + r.h - 8 + (k % 2) * 2, 1, 7 - (k % 2) * 2, '#a8a090');
    }
    // le marchand derrière son comptoir
    const kx = 52;
    const ky = 252 - 26;
    px(kx, ky, 10, 3, '#6a6458');
    px(kx + 1, ky + 3, 8, 7, '#e0a77f');
    px(kx + 2, ky + 5, 1, 1, '#2b2135'); px(kx + 6, ky + 5, 1, 1, '#2b2135');
    px(kx + 1, ky + 8, 8, 1, '#8a5a3c');
    px(kx - 1, ky + 10, 12, 16, '#3f6a8a'); px(kx + 2, ky + 11, 6, 15, '#c8b89a');
    const wave = Math.floor(t * 1.5) % 6 === 0 ? -3 : 0;
    px(kx + 11, ky + 11 + wave, 2, 6, '#e0a77f');
  }
}
