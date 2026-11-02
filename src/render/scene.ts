/**
 * La brasserie à l'écran, en portrait : le procédé descend en zigzag du moulin (en haut) à l'embouteillage (en bas).
 * Rendu sur un canvas à résolution native (200 px de large), agrandi au pixel près.
 */
import type { Game } from '../core/game';
import { STATION_ORDER, type StationId } from '../core/stations';
import { PAL } from './painter';
import { SPRITES, stationCanvas, type Pt, type Rect } from './sprites';

export const SCENE_W = 200;
export const SCENE_H = 304;

/** Emplacement de chaque appareil : centre horizontal et niveau du sol de sa passerelle. */
const SLOTS: Record<StationId, { cx: number; floor: number; left?: number }> = {
  mill: { cx: 44, floor: 72 },
  mash: { cx: 146, floor: 72 },
  boil: { cx: 48, floor: 150 },
  cooler: { cx: 146, floor: 150 },
  fermenter: { cx: 50, floor: 230 },
  conditioning: { cx: 148, floor: 230 },
  bottling: { cx: 0, floor: 294, left: 6 },
};
const FLOORS = [72, 150, 230, 294];

/** Couleur du liquide selon l'étape. */
const LIQUID: Record<StationId, readonly string[]> = {
  mill: PAL.malt, mash: PAL.wort, boil: PAL.wort, cooler: PAL.wort, fermenter: PAL.beer, conditioning: PAL.beer, bottling: PAL.beer,
};

export class Scene {
  readonly canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  /** Instant (s) du dernier transfert vers chaque étape, pour animer le liquide dans les tuyaux. */
  private flows = new Map<number, number>();
  selected: StationId | null = null;

  constructor() {
    this.canvas.width = SCENE_W;
    this.canvas.height = SCENE_H;
    this.g = this.canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
  }

  onStage(stage: number, t: number): void {
    this.flows.set(stage, t);
  }

  /** Rectangle occupé par un appareil (coordonnées de la scène). */
  rect(id: StationId, level: number): Rect {
    const def = SPRITES[id][level - 1]!;
    const s = SLOTS[id];
    const x = s.left ?? Math.round(s.cx - def.w / 2);
    return { x, y: s.floor - def.h, w: def.w, h: def.h };
  }

  private anchor(id: StationId, level: number, which: 'inlet' | 'outlet'): Pt {
    const r = this.rect(id, level);
    const p = SPRITES[id][level - 1]![which];
    return { x: r.x + p.x, y: r.y + p.y };
  }

  draw(game: Game, t: number): void {
    const g = this.g;
    g.drawImage(this.background(), 0, 0);
    this.drawPipes(game, t);
    for (const id of STATION_ORDER) this.drawStation(game, id, t);
    this.drawCrates(game);
  }

  // ------------------------------------------------------------------ décor

  private background(): HTMLCanvasElement {
    if (this.bg) return this.bg;
    const c = document.createElement('canvas');
    c.width = SCENE_W;
    c.height = SCENE_H;
    const g = c.getContext('2d')!;
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
    };
    // Mur de briques avec un dégradé de lumière (tramé)
    const bricks = ['#9a4a3a', '#8a4232', '#7a3a2c', '#6a3226', '#5a2a20'];
    for (let y = 0; y < SCENE_H; y++) {
      const shade = Math.min(4, Math.floor((y / SCENE_H) * 3 + ((y * 7) % 3 === 0 ? 0.5 : 0)));
      px(0, y, SCENE_W, 1, bricks[shade]!);
    }
    for (let y = 0; y < SCENE_H; y += 6) {
      px(0, y + 5, SCENE_W, 1, '#4a221a');
      for (let x = ((y / 6) % 2) * 6; x < SCENE_W; x += 12) {
        px(x, y, 1, 5, '#4a221a');
        px(x + 1, y, 10, 1, '#b2604a');
      }
    }
    // Fenêtres hautes avec lumière du jour
    for (const wx of [70, 112]) {
      px(wx - 1, 3, 20, 28, '#2a1a20');
      px(wx, 4, 18, 26, '#6cc0f0');
      px(wx, 4, 18, 9, '#a8e0ff');
      px(wx + 8, 4, 2, 26, '#2a1a20');
      px(wx, 16, 18, 1, '#2a1a20');
      g.fillStyle = 'rgba(255,240,200,0.07)';
      g.beginPath();
      g.moveTo(wx, 30); g.lineTo(wx + 18, 30); g.lineTo(wx + 40, 72); g.lineTo(wx - 22, 72);
      g.fill();
    }
    // Passerelles en caillebotis, avec rambarde
    for (const f of FLOORS) {
      px(0, f, SCENE_W, 5, '#3e3a50');
      px(0, f, SCENE_W, 1, '#8c88a0');
      for (let x = 0; x < SCENE_W; x += 3) px(x, f + 2, 1, 2, '#2c283a');
      px(0, f + 5, SCENE_W, 1, '#1c1828');
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, f + 6, SCENE_W, 3);
    }
    // Lampes industrielles
    for (const [lx, ly] of [[100, 76], [30, 154], [170, 154], [100, 234]] as const) {
      px(lx, ly, 1, 6, '#2c283a');
      px(lx - 4, ly + 6, 9, 3, '#465264');
      px(lx - 3, ly + 9, 7, 1, '#fff4b0');
      g.fillStyle = 'rgba(255,230,160,0.06)';
      g.beginPath();
      g.moveTo(lx - 3, ly + 10); g.lineTo(lx + 4, ly + 10); g.lineTo(lx + 22, ly + 60); g.lineTo(lx - 21, ly + 60);
      g.fill();
    }
    this.bg = c;
    return c;
  }

  // ------------------------------------------------------------------ tuyaux

  private drawPipes(game: Game, t: number): void {
    for (let i = 1; i < STATION_ORDER.length; i++) {
      const from = STATION_ORDER[i - 1]!;
      const to = STATION_ORDER[i]!;
      const a = this.anchor(from, game.level(from), 'outlet');
      const b = this.anchor(to, game.level(to), 'inlet');
      const top = ['mash', 'boil', 'fermenter', 'bottling'].includes(to);
      const path: Pt[] = top
        ? [a, { x: a.x + 5, y: a.y }, { x: a.x + 5, y: b.y - 6 }, { x: b.x, y: b.y - 6 }, b]
        : (() => {
            const mx = Math.round((a.x + b.x) / 2);
            return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
          })();
      const grain = from === 'mill';
      this.pipe(path, grain);
      const since = t - (this.flows.get(i) ?? -99);
      if (since < 2.5) this.flow(path, t, grain ? PAL.malt : LIQUID[to]);
    }
  }

  private pipe(path: Pt[], grain: boolean): void {
    const g = this.g;
    const s = grain ? PAL.wd : PAL.st;
    for (let k = 0; k < path.length - 1; k++) {
      const a = path[k]!;
      const b = path[k + 1]!;
      const x0 = Math.min(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      if (a.y === b.y) {
        const w = Math.abs(b.x - a.x) + 3;
        g.fillStyle = s[5]!; g.fillRect(x0 - 1, y0 - 2, w, 5);
        g.fillStyle = s[2]!; g.fillRect(x0 - 1, y0 - 1, w, 3);
        g.fillStyle = s[0]!; g.fillRect(x0 - 1, y0 - 1, w, 1);
        g.fillStyle = s[4]!; g.fillRect(x0 - 1, y0 + 1, w, 1);
      } else {
        const h = Math.abs(b.y - a.y) + 3;
        g.fillStyle = s[5]!; g.fillRect(x0 - 2, y0 - 1, 5, h);
        g.fillStyle = s[2]!; g.fillRect(x0 - 1, y0 - 1, 3, h);
        g.fillStyle = s[0]!; g.fillRect(x0 - 1, y0 - 1, 1, h);
        g.fillStyle = s[4]!; g.fillRect(x0 + 1, y0 - 1, 1, h);
      }
    }
    // brides aux coudes
    for (const p of path.slice(1, -1)) {
      g.fillStyle = s[4]!; g.fillRect(p.x - 2, p.y - 2, 5, 5);
      g.fillStyle = s[1]!; g.fillRect(p.x - 1, p.y - 1, 3, 3);
    }
    // vanne au milieu
    const m = path[Math.floor(path.length / 2)]!;
    g.fillStyle = PAL.rd[3]!; g.fillRect(m.x - 2, m.y - 5, 5, 1);
    g.fillStyle = PAL.rd[2]!; g.fillRect(m.x, m.y - 5, 1, 3);
  }

  /** Liquide (ou grain) qui circule pendant un transfert. */
  private flow(path: Pt[], t: number, col: readonly string[]): void {
    const g = this.g;
    let total = 0;
    const segs = path.slice(1).map((b, k) => {
      const a = path[k]!;
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      total += len;
      return { a, b, len };
    });
    for (let d = (t * 40) % 6; d < total; d += 6) {
      let rest = d;
      for (const s of segs) {
        if (rest > s.len) {
          rest -= s.len;
          continue;
        }
        const k = s.len ? rest / s.len : 0;
        const x = Math.round(s.a.x + (s.b.x - s.a.x) * k);
        const y = Math.round(s.a.y + (s.b.y - s.a.y) * k);
        g.fillStyle = col[1]!;
        g.fillRect(x, y, 2, 1);
        g.fillStyle = col[3]!;
        g.fillRect(x, y + 1, 2, 1);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ appareils

  private drawStation(game: Game, id: StationId, t: number): void {
    const g = this.g;
    const lv = game.level(id);
    const def = SPRITES[id][lv - 1]!;
    const r = this.rect(id, lv);
    const batch = game.batchAt(id);
    const active = !!batch && !batch.waiting;
    const progress = batch ? Math.min(1, batch.elapsed / Math.max(0.01, batch.duration)) : 0;
    // ombre portée sur la passerelle
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(r.x + 3, SLOTS[id].floor, r.w - 4, 2);
    if (def.flame && active && id === 'boil') this.flames(r.x + def.flame.x, r.y + def.flame.y, def.flame.w, t);
    g.drawImage(stationCanvas(id, lv), r.x, r.y);

    // liquide visible dans le hublot
    if (def.window && batch) {
      const w = def.window;
      const level = id === 'mash' || id === 'boil' || id === 'fermenter' || id === 'conditioning' ? Math.min(1, 0.35 + progress * 2) : 1;
      const col = LIQUID[id];
      const h = Math.round(w.h * level);
      const dark = id === 'boil' ? 3 : id === 'mash' ? 2 : 2;
      g.fillStyle = col[dark + 1]!;
      g.fillRect(r.x + w.x, r.y + w.y + w.h - h, w.w, h);
      g.fillStyle = col[dark]!;
      g.fillRect(r.x + w.x, r.y + w.y + w.h - h, Math.max(1, w.w - 1), h);
      g.fillStyle = col[0]!;
      g.fillRect(r.x + w.x, r.y + w.y + w.h - h, w.w, 1);
      if (id === 'fermenter' && active) {
        for (let i = 0; i < 3; i++) {
          const yy = r.y + w.y + w.h - 1 - ((t * 6 + i * 5) % Math.max(1, h));
          g.fillStyle = '#fff8d8';
          g.fillRect(r.x + w.x + (i % w.w), Math.round(yy), 1, 1);
        }
      }
    }
    // vapeur / bulles du barboteur
    if (def.steam && active && (id === 'boil' || id === 'mash')) {
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.6 + i / 4) % 1;
        const size = 1 + Math.round(k * 3);
        g.fillStyle = `rgba(255,255,255,${0.55 * (1 - k)})`;
        g.fillRect(Math.round(r.x + def.steam.x - 2 + Math.sin(t * 2 + i) * 3), Math.round(r.y + def.steam.y - k * 16), size, size);
      }
    }
    if (def.steam && active && id === 'fermenter') {
      const k = (t * 1.2) % 1;
      g.fillStyle = `rgba(255,255,255,${1 - k})`;
      g.fillRect(r.x + def.steam.x, Math.round(r.y + def.steam.y - k * 5), 1, 1);
    }
    if (id === 'mill' && active) {
      for (let i = 0; i < 5; i++) {
        const k = (t * 1.5 + i / 5) % 1;
        g.fillStyle = PAL.malt[i % 2 ? 1 : 3]!;
        g.fillRect(r.x + def.outlet.x - 2 + (i % 3), Math.round(r.y + def.outlet.y - 10 + k * 8), 1, 1);
      }
    }
    if (id === 'cooler' && active) {
      for (let i = 0; i < 3; i++) {
        if (Math.floor(t * 3 + i) % 3) continue;
        g.fillStyle = '#e0f6ff';
        g.fillRect(r.x + 6 + i * 7, r.y + 8 + ((i * 5) % 12), 1, 1);
      }
    }
    if (id === 'bottling') this.bottles(r, def.outlet, active, progress, t, lv);
    // appareil sélectionné : liseré clignotant
    if (this.selected === id && Math.floor(t * 3) % 2 === 0) {
      g.strokeStyle = '#f2c14e';
      g.lineWidth = 1;
      g.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
    }
  }

  private flames(x: number, y: number, w: number, t: number): void {
    const g = this.g;
    for (let i = 0; i < w; i += 3) {
      const h = 2 + Math.round(2 * Math.abs(Math.sin(t * 11 + i * 1.3)));
      g.fillStyle = '#4ea8f0';
      g.fillRect(x + i, y + 2, 2, 2);
      g.fillStyle = '#ff9a2e';
      g.fillRect(x + i, y + 2 - h, 2, h);
      g.fillStyle = '#fff4b0';
      g.fillRect(x + i, y + 3 - h, 1, Math.max(1, h - 2));
    }
  }

  /** Bouteilles qui défilent sur le convoyeur pendant l'embouteillage. */
  private bottles(r: Rect, out: Pt, active: boolean, progress: number, t: number, lv: number): void {
    const g = this.g;
    const beltY = r.y + out.y - 1;
    const from = r.x + 10;
    const to = r.x + out.x;
    const n = lv === 1 ? 3 : lv === 2 ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const k = active ? (t * 0.25 * lv + i / n) % 1 : i / n;
      if (!active && i > 1) break;
      const x = Math.round(from + (to - from) * k);
      const filled = k > 0.35;
      g.fillStyle = '#2a1408';
      g.fillRect(x - 1, beltY - 9, 4, 9);
      g.fillStyle = filled ? '#7a3e12' : '#8fc8d8';
      g.fillRect(x, beltY - 6, 2, 6);
      g.fillRect(x, beltY - 8, 1, 2);
      if (filled) {
        g.fillStyle = '#fff4dc';
        g.fillRect(x, beltY - 4, 2, 1);
      }
      if (k > 0.55) {
        g.fillStyle = '#f2c14e';
        g.fillRect(x, beltY - 9, 2, 1);
      }
    }
    void progress;
  }

  /** Caisses pleines empilées en bout de ligne (stock de la gamme). */
  private drawCrates(game: Game): void {
    const g = this.g;
    const stock = game.beers.reduce((s, b) => s + b.stock, 0);
    const crates = Math.min(8, Math.ceil(stock / 12));
    const baseX = 150;
    const floor = SLOTS.bottling.floor;
    for (let i = 0; i < crates; i++) {
      const x = baseX + (i % 4) * 11;
      const y = floor - 9 - Math.floor(i / 4) * 9;
      g.fillStyle = '#4c2c14'; g.fillRect(x, y, 11, 9);
      g.fillStyle = '#a06830'; g.fillRect(x + 1, y + 1, 9, 7);
      g.fillStyle = '#c88a4a'; g.fillRect(x + 1, y + 1, 9, 1);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = '#f2c14e';
        g.fillRect(x + 2 + k * 2, y - 1, 1, 1);
      }
    }
  }
}
