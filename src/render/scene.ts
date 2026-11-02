/**
 * La brasserie à l'écran, en portrait : le procédé descend en zigzag du moulin (en haut) à l'embouteillage (en bas).
 * Rendu sur un canvas à résolution native (200 px de large), agrandi au pixel près.
 */
import type { Game } from '../core/game';
import { STATION_ORDER, type StationId } from '../core/stations';
import { PAL } from './painter';
import { SPRITES, stationCanvas, type Pt, type Rect } from './sprites';
import { drawMiniLabel } from './labelArt';

export const SCENE_W = 160;
export const SCENE_H = 300;

/** Emplacement de chaque appareil : centre horizontal et niveau du sol de sa passerelle. */
const SLOTS: Record<Exclude<StationId, 'bottling'>, { cx: number; floor: number }> = {
  mill: { cx: 36, floor: 64 },
  mash: { cx: 116, floor: 64 },
  boil: { cx: 40, floor: 134 },
  cooler: { cx: 120, floor: 134 },
  fermenter: { cx: 40, floor: 206 },
  conditioning: { cx: 118, floor: 206 },
};
const FLOORS = [64, 134, 206];

/**
 * Cadencement d'une bouteille selon sa phase f (bouteilles remplies − son rang) :
 * en file d'attente (f < 0), elle avance sous le bec (0 → 0,2), se remplit (0,2 → 1),
 * puis repart d'un cran (1 → 1,2) et défile vers l'étiqueteuse et le carton.
 */
function bottlePos(f: number): { x: number; fill: number } {
  const { fillX, spacing } = LINE;
  if (f < 0) return { x: fillX - Math.ceil(-f) * spacing, fill: 0 };
  if (f < 0.2) return { x: fillX - spacing + (f / 0.2) * spacing, fill: 0 };
  if (f < 1) return { x: fillX, fill: (f - 0.2) / 0.8 };
  if (f < 1.2) return { x: fillX + ((f - 1) / 0.2) * spacing, fill: 1 };
  return { x: fillX + spacing * (1 + (f - 1.2) * 1.25), fill: 1 };
}

/** Ligne d'embouteillage au premier plan. */
export const LINE = {
  top: 214,
  belt: 286, // dessus du tapis (pied des bouteilles)
  fillX: 60, // bec de remplissage
  labelX: 100, // étiqueteuse
  cartonX: 124, // le carton commence ici
  spacing: 13,
};

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

  /** Rectangle occupé par un appareil (coordonnées de la scène). L'embouteillage = la remplisseuse au premier plan. */
  rect(id: StationId, level: number): Rect {
    if (id === 'bottling') return { x: LINE.fillX - 24, y: LINE.top, w: 70, h: LINE.belt - LINE.top };
    const def = SPRITES[id][level - 1]!;
    const s = SLOTS[id];
    return { x: Math.round(s.cx - def.w / 2), y: s.floor - def.h, w: def.w, h: def.h };
  }

  private anchor(id: StationId, level: number, which: 'inlet' | 'outlet'): Pt {
    if (id === 'bottling') return { x: LINE.fillX - 14, y: LINE.top + 4 };
    const r = this.rect(id, level);
    const p = SPRITES[id][level - 1]![which];
    return { x: r.x + p.x, y: r.y + p.y };
  }

  /** Position (scène) du bouton « Goûter » : au-dessus du bec de remplissage. */
  get tastePoint(): Pt {
    return { x: LINE.fillX, y: LINE.top - 6 };
  }

  draw(game: Game, t: number): void {
    const g = this.g;
    g.drawImage(this.background(), 0, 0);
    this.drawPipes(game, t);
    for (const id of STATION_ORDER) if (id !== 'bottling') this.drawStation(game, id, t);
    this.drawLine(game, t);
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
    for (const wx of [62, 84]) {
      px(wx - 1, 3, 16, 24, '#2a1a20');
      px(wx, 4, 14, 22, '#6cc0f0');
      px(wx, 4, 14, 8, '#a8e0ff');
      px(wx + 6, 4, 2, 22, '#2a1a20');
      px(wx, 14, 14, 1, '#2a1a20');
      g.fillStyle = 'rgba(255,240,200,0.07)';
      g.beginPath();
      g.moveTo(wx, 26); g.lineTo(wx + 14, 26); g.lineTo(wx + 30, 64); g.lineTo(wx - 16, 64);
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
    for (const [lx, ly] of [[80, 68], [80, 138]] as const) {
      px(lx, ly, 1, 6, '#2c283a');
      px(lx - 4, ly + 6, 9, 3, '#465264');
      px(lx - 3, ly + 9, 7, 1, '#fff4b0');
      g.fillStyle = 'rgba(255,230,160,0.06)';
      g.beginPath();
      g.moveTo(lx - 3, ly + 10); g.lineTo(lx + 4, ly + 10); g.lineTo(lx + 22, ly + 60); g.lineTo(lx - 21, ly + 60);
      g.fill();
    }
    // Premier plan : sol de la salle d'embouteillage (carrelage en perspective)
    const top = LINE.top - 4;
    px(0, top, SCENE_W, SCENE_H - top, '#3a2c2c');
    for (let y = top; y < SCENE_H; y += 8) px(0, y, SCENE_W, 1, '#2a1e20');
    for (let x = -60; x < SCENE_W + 60; x += 14) {
      g.fillStyle = '#2a1e20';
      for (let y = top; y < SCENE_H; y++) g.fillRect(Math.round(x + ((x - SCENE_W / 2) * (y - top)) / 160), y, 1, 1);
    }
    px(0, top, SCENE_W, 2, '#5c4848');
    // tapis roulant (châssis, la bande est animée)
    px(0, LINE.belt, SCENE_W, 6, '#2c283a');
    px(0, LINE.belt, SCENE_W, 1, '#8c88a0');
    px(0, LINE.belt + 6, SCENE_W, 2, '#1c1828');
    for (const x of [8, 56, 104, 150]) {
      px(x, LINE.belt + 8, 3, SCENE_H - LINE.belt - 8, '#3e3a50');
      px(x, LINE.belt + 8, 1, SCENE_H - LINE.belt - 8, '#6c6884');
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
    g.fillRect(r.x + 3, SLOTS[id as Exclude<StationId, 'bottling'>].floor, r.w - 4, 2);
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

  // ------------------------------------------------------------------ embouteillage au premier plan

  /**
   * Les bouteilles arrivent vides, se remplissent sous le bec, avancent, sont étiquetées puis rangées en carton.
   * Le défilement suit l'avancement du lot : chaque bouteille k a une phase f = (bouteilles remplies) − k.
   */
  private drawLine(game: Game, t: number): void {
    const g = this.g;
    const lv = game.level('bottling');
    const b = game.batchAt('bottling');
    const n = b?.bottles ?? 0;
    const p = b ? (b.waiting ? 1 : Math.min(1, b.elapsed / Math.max(0.01, b.duration))) : 0;
    const done = p * n;
    const beer = b?.beerId != null ? game.beers.find((x) => x.id === b.beerId) : undefined;
    const label = beer?.label ?? null;
    const { fillX, labelX, cartonX, belt, spacing } = LINE;

    // bande du tapis qui défile
    const shift = Math.floor((done * spacing) % 4);
    g.fillStyle = '#4a4458';
    for (let x = -4 + shift; x < SCENE_W; x += 4) g.fillRect(x, belt + 2, 2, 1);

    this.drawPallet(game);
    this.drawFiller(lv, !!b && !b.waiting, t);
    this.drawLabeler(lv, !!b && !b.waiting, t);

    // bouteilles sur le tapis
    if (!b) {
      for (let i = 1; i <= 3; i++) this.bottle(fillX - i * spacing, belt, 0, null, false);
    } else {
      const kMin = Math.max(0, Math.floor(done) - 8);
      const kMax = Math.min(n - 1, Math.floor(done) + 3);
      for (let k = kMin; k <= kMax; k++) {
        const f = done - k;
        const { x, fill } = bottlePos(f);
        if (x >= cartonX + 2 || x < -8) continue;
        this.bottle(Math.round(x), belt, fill, x >= labelX && label ? label : null, f >= 1);
        if (f >= 0.2 && f < 1) this.pour(fillX, belt, t);
      }
    }
    // carton en bout de ligne
    // bouteilles arrivées au carton : celles dont la position a dépassé son bord
    let inCarton = 0;
    if (b) for (let k = 0; k < Math.min(n, Math.ceil(done)); k++) if (bottlePos(done - k).x >= cartonX + 2) inCarton++;
    this.drawCarton(inCarton, label);
  }

  /** Une bouteille de 33 cl (9 × 26 px), pied posé sur le tapis. */
  private bottle(cx: number, base: number, fill: number, label: import('../core/label').Label | null, capped: boolean): void {
    const g = this.g;
    const x = cx - 4;
    const y = base - 26;
    g.fillStyle = '#1a0c06';
    g.fillRect(x - 1, y + 10, 11, 17); // contour du corps
    g.fillRect(x + 2, y + 1, 5, 10); // contour du col
    g.fillRect(x, y + 9, 9, 2); // épaule
    // verre brun
    g.fillStyle = '#5a3a20';
    g.fillRect(x, y + 11, 9, 15);
    g.fillRect(x + 3, y + 2, 3, 9);
    g.fillRect(x + 1, y + 10, 7, 1);
    // bière qui monte (corps puis col)
    if (fill > 0) {
      const h = Math.round(24 * fill);
      const body = Math.min(15, h);
      g.fillStyle = '#c47a1c';
      g.fillRect(x, y + 26 - body, 9, body);
      g.fillStyle = '#e8a530';
      g.fillRect(x + 1, y + 26 - body, 2, body);
      if (h > 15) {
        g.fillStyle = '#c47a1c';
        g.fillRect(x + 3, y + 11 - (h - 15), 3, h - 15);
      }
      g.fillStyle = '#fff1c8'; // mousse
      if (h > 15) g.fillRect(x + 3, y + 11 - (h - 15), 3, 1);
      else g.fillRect(x, y + 26 - body, 9, 1);
    }
    // reflets du verre
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(x + 1, y + 12, 1, 12);
    g.fillRect(x + 3, y + 3, 1, 6);
    if (capped) {
      g.fillStyle = '#f2c14e';
      g.fillRect(x + 2, y, 5, 2);
      g.fillStyle = '#a8742a';
      g.fillRect(x + 2, y + 1, 5, 1);
    }
    if (label) drawMiniLabel(g, label, x + 1, y + 14, 7);
  }

  /** Filet de bière qui coule du bec dans le goulot. */
  private pour(cx: number, base: number, t: number): void {
    const g = this.g;
    g.fillStyle = Math.floor(t * 12) % 2 ? '#e8a530' : '#f2c14e';
    g.fillRect(cx, base - 32, 1, 8);
  }

  private drawFiller(lv: number, active: boolean, t: number): void {
    const g = this.g;
    const x = LINE.fillX;
    const top = LINE.top;
    const P = PAL;
    if (lv === 1) {
      // seau sur étagère + tuyau + canne
      g.fillStyle = P.wd[4]!; g.fillRect(x - 28, top + 26, 24, 3);
      g.fillStyle = P.pl[2]!; g.fillRect(x - 25, top + 10, 16, 16);
      g.fillStyle = P.pl[0]!; g.fillRect(x - 25, top + 10, 4, 16);
      g.fillStyle = P.pl[4]!; g.fillRect(x - 13, top + 10, 4, 16);
      g.fillStyle = P.pl[1]!; g.fillRect(x - 26, top + 8, 18, 3);
      g.fillStyle = P.st[3]!;
      g.fillRect(x - 9, top + 22, 9, 2);
      g.fillRect(x, top + 22, 2, 18);
    } else {
      const w = lv === 2 ? 34 : 44;
      const body = lv === 2 ? P.st : P.tl;
      g.fillStyle = '#1b1424'; g.fillRect(x - w / 2 - 1, top - 1, w + 2, 36);
      for (let i = 0; i < w; i++) {
        const k = i / w;
        g.fillStyle = body[k < 0.15 ? 2 : k < 0.3 ? 1 : k < 0.75 ? 2 : 4]!;
        g.fillRect(x - w / 2 + i, top, 1, 34);
      }
      g.fillStyle = body[0]!; g.fillRect(x - w / 2, top, w, 1);
      // panneau de commande
      g.fillStyle = '#2c283a'; g.fillRect(x + w / 2 - 12, top + 6, 9, 9);
      g.fillStyle = '#7cff9c'; g.fillRect(x + w / 2 - 10, top + 8, 5, 2);
      g.fillStyle = active && Math.floor(t * 4) % 2 ? '#6cc040' : '#3e9028'; g.fillRect(x + w / 2 - 10, top + 12, 1, 1);
      g.fillStyle = '#e85a3a'; g.fillRect(x + w / 2 - 6, top + 12, 1, 1);
      // becs
      const nozzles = lv === 2 ? [-12, -4, 4, 12] : [-16, -8, 0, 8, 16];
      for (const dx of nozzles) {
        g.fillStyle = P.st[4]!; g.fillRect(x + dx - 1, top + 34, 3, dx === 0 ? 6 : 4);
        g.fillStyle = P.st[1]!; g.fillRect(x + dx - 1, top + 34, 1, dx === 0 ? 6 : 4);
      }
      if (lv === 2) { g.fillStyle = P.st[4]!; g.fillRect(x - 1, top + 34, 3, 6); }
    }
  }

  private drawLabeler(lv: number, active: boolean, t: number): void {
    const g = this.g;
    const x = LINE.labelX;
    const top = LINE.top + 16;
    // rouleau d'étiquettes et bras
    g.fillStyle = '#1b1424'; g.fillRect(x - 9, top - 1, 18, 26);
    g.fillStyle = lv === 3 ? PAL.br[2]! : PAL.ir[2]!; g.fillRect(x - 8, top, 16, 24);
    g.fillStyle = lv === 3 ? PAL.br[0]! : PAL.ir[0]!; g.fillRect(x - 8, top, 16, 1);
    const a = active ? t * 6 : 0;
    g.fillStyle = '#f6ecd6';
    g.beginPath(); g.arc(x, top + 9, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#bdb59e';
    g.fillRect(Math.round(x + Math.cos(a) * 3), Math.round(top + 9 + Math.sin(a) * 3), 1, 1);
    g.fillStyle = '#6c6884'; g.fillRect(x - 1, top + 24, 3, 22);
    g.fillStyle = '#f6ecd6'; g.fillRect(x - 3, top + 40, 2, 6);
  }

  private drawCarton(count: number, label: import('../core/label').Label | null): void {
    const g = this.g;
    const x = LINE.cartonX + 2;
    const base = LINE.belt;
    const inBox = count % 12;
    const closed = count > 0 && inBox === 0;
    g.fillStyle = '#5c3a1c'; g.fillRect(x - 1, base - 19, 32, 20);
    g.fillStyle = '#c8945a'; g.fillRect(x, base - 18, 30, 18);
    g.fillStyle = '#a87440'; g.fillRect(x, base - 18, 30, 2);
    g.fillStyle = '#e0b07a'; g.fillRect(x, base - 16, 3, 16);
    g.fillStyle = '#9a6a3a'; g.fillRect(x + 27, base - 16, 3, 16);
    // goulots et capsules des bouteilles rangées (2 rangées de 6)
    for (let i = 0; i < (closed ? 0 : inBox); i++) {
      const bx = x + 3 + (i % 6) * 4;
      const by = base - 23 + Math.floor(i / 6) * 3;
      g.fillStyle = '#5a3a20'; g.fillRect(bx, by + 1, 3, 4);
      g.fillStyle = '#f2c14e'; g.fillRect(bx, by, 3, 1);
    }
    if (closed) {
      g.fillStyle = '#b07c48'; g.fillRect(x, base - 23, 30, 5); // rabats fermés
      g.fillStyle = '#d8b078'; g.fillRect(x + 14, base - 23, 2, 23); // scotch
    }
    if (label) drawMiniLabel(g, label, x + 19, base - 12, 7);
  }

  /** Palette de cartons pleins à gauche : le stock de bouteilles de la gamme. */
  private drawPallet(game: Game): void {
    const g = this.g;
    const stock = game.beers.reduce((s, b) => s + b.stock, 0);
    const cartons = Math.min(6, Math.ceil(stock / 12));
    const base = LINE.belt - 2;
    g.fillStyle = '#6e4220'; g.fillRect(2, base - 3, 28, 3);
    g.fillStyle = '#a06830'; g.fillRect(2, base - 3, 28, 1);
    for (let i = 0; i < cartons; i++) {
      const cx = 3 + (i % 2) * 13;
      const cy = base - 3 - 10 - Math.floor(i / 2) * 10;
      g.fillStyle = '#5c3a1c'; g.fillRect(cx, cy, 13, 10);
      g.fillStyle = '#c8945a'; g.fillRect(cx + 1, cy + 1, 11, 8);
      g.fillStyle = '#d8b078'; g.fillRect(cx + 6, cy + 1, 1, 8);
    }
  }
}
