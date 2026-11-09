/**
 * La brasserie à l'écran, en portrait : le procédé descend en zigzag du moulin (en haut) à l'embouteillage (en bas).
 * Rendu sur un canvas à résolution native (200 px de large), agrandi au pixel près.
 */
import type { Game } from '../core/game';
import { STATION_ORDER, type StationId } from '../core/stations';
import { PAL } from './painter';
import { clearSpriteCache, SPRITES, stationCanvas, type Pt, type Rect, type SpriteDef } from './sprites';
import { drawMiniLabel } from './labelArt';
import { clearDecorCache, drawDecor, paintDecor } from './decor';
import { dim, ellipseShadow, floor, floorLight, from, mix, rgb, seam, shade, silhouette, wallLight, type Bounds, type RGB } from './space';

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
/** Point de fuite de l'atelier : au milieu, à hauteur des yeux (entre le 2e et le 3e étage). */
const VX = 80;
const EYE = 150;

/**
 * Cadencement d'une bouteille selon sa phase f (bouteilles remplies − son rang) :
 * en file d'attente (f < 0), elle avance sous le bec (0 → 0,2), se remplit (0,2 → 1),
 * puis repart d'un cran (1 → 1,2) et défile vers l'étiqueteuse et le carton.
 */
/**
 * Position du centre d'une tournée de bouteilles (autant que de becs, sur une largeur g) selon son avancement f :
 * elle attend, arrive sous les becs (0 à 0,2), se remplit (0,2 à 1), repart (1 à 1,2) puis file vers le carton.
 */
function groupPos(f: number, g: number): { x: number; fill: number } {
  const { fillX } = LINE;
  if (f < 0) return { x: fillX - Math.ceil(-f) * g, fill: 0 };
  if (f < 0.2) return { x: fillX - g + (f / 0.2) * g, fill: 0 };
  if (f < 1) return { x: fillX, fill: (f - 0.2) / 0.8 };
  if (f < 1.2) return { x: fillX + ((f - 1) / 0.2) * g, fill: 1 };
  return { x: fillX + g * (1 + (f - 1.2) * 1.25), fill: 1 };
}

/** Becs de la remplisseuse selon son niveau : 1 (entonnoir, canne), puis 4, puis 5 ; décalage de chacun. */
export function nozzles(lv: number): number[] {
  const n = lv <= 2 ? 1 : lv === 3 ? 4 : 5;
  return Array.from({ length: n }, (_, j) => (j - (n - 1) / 2) * NOZZLE_GAP);
}
/**
 * Écart voulu entre deux cuves en parallèle : 40 % de leur largeur, et jamais moins que ce qu'il faut pour voir
 * la jauge de liquide d'une cuve de derrière (à gauche de chaque cuve).
 */
function tankGap(def: SpriteDef, tanks: number): number {
  if (tanks <= 1) return 0;
  const win = def.window;
  const gauge = win ? win.x + Math.min(win.w, 4) + 1 : 6;
  return Math.max(6, gauge, Math.round(def.w * 0.4));
}

/** Écart minimal entre la rangée de fermentation et celle de garde (elles ne se chevauchent jamais). */
const ROWS_MARGIN = 3;

/**
 * Place les rangées de fermentation (à gauche) et de garde (à droite) sur leur étage, entre lo et hi :
 * chacune garde sa place habituelle tant que possible, puis elles s'écartent l'une de l'autre ; si la largeur
 * manque, les cuves de chaque rangée se resserrent. Rend le coin gauche de la cuve de devant et l'écart de chaque rangée.
 */
export function layoutTankRows(
  fd: SpriteDef, n: number, cd: SpriteDef, m: number, lo: number, hi: number,
): { fx: number; gf: number; cx: number; gc: number } {
  let gf = tankGap(fd, n);
  let gc = tankGap(cd, m);
  const fixed = fd.w + cd.w + ROWS_MARGIN;
  const gaps = (n - 1) * gf + (m - 1) * gc;
  if (fixed + gaps > hi - lo && gaps > 0) {
    const k = Math.max(0, hi - lo - fixed) / gaps;
    gf = Math.max(4, Math.floor(gf * k));
    gc = Math.max(4, Math.floor(gc * k));
  }
  // places habituelles, puis dans les limites de l'étage
  let fx = Math.max(Math.round(SLOTS.fermenter.cx - fd.w / 2), lo + (n - 1) * gf);
  let cx = Math.min(Math.round(SLOTS.conditioning.cx - cd.w / 2), hi - cd.w);
  // chevauchement : la garde s'écarte vers la droite, puis la fermentation vers la gauche
  let over = fx + fd.w + ROWS_MARGIN - (cx - (m - 1) * gc);
  if (over > 0) {
    const d = Math.min(over, hi - cd.w - cx);
    cx += Math.max(0, d);
    over -= Math.max(0, d);
  }
  if (over > 0) fx -= Math.min(over, fx - (lo + (n - 1) * gf));
  return { fx, gf, cx, gc };
}

/** Écart entre deux becs : une bouteille (11 px avec son contour) et un peu de jeu. */
const NOZZLE_GAP = 12;

/** Ligne d'embouteillage au premier plan. */
export const LINE = {
  top: 214,
  belt: 286, // dessus du tapis (pied des bouteilles)
  fillX: 60, // bec de remplissage
  labelX: 100, // étiqueteuse
  spacing: 13,
};

/**
 * Le tapis roulant (châssis, avec son ombre au sol ; la bande défile, voir drawBeltBand) de x0 à x1.
 * Il traverse l'atelier et se prolonge dans le stockage.
 */
export function paintBelt(g: CanvasRenderingContext2D, b: Bounds, x0: number, x1: number, lv: number): void {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  shade(g, b, { x: x0, y: LINE.belt - 6, w: x1 - x0, h: 6 }, (_, y) => 0.6 + (LINE.belt - y) * 0.065);
  px(x0, LINE.belt, x1 - x0, 6, lv === 1 ? '#5a3a1c' : '#2c283a');
  px(x0, LINE.belt, x1 - x0, 1, lv === 1 ? '#a87a48' : '#8c88a0');
  px(x0, LINE.belt + 6, x1 - x0, 2, '#1c1828');
  for (let x = from(8, 48, b.L - 3); x < x1 - 2; x += 48) {
    if (x < x0) continue;
    px(x, LINE.belt + 8, 3, b.B - LINE.belt - 8, '#3e3a50');
    px(x, LINE.belt + 8, 1, b.B - LINE.belt - 8, '#6c6884');
  }
}

/** Le lot à l'embouteillage et l'avancement de ses tournées (de quoi dessiner la ligne, dans l'atelier ou au stockage). */
export function lineState(game: Game) {
  const lv = game.level('bottling');
  const b = game.batchAt('bottling');
  const keg = b?.format === 'keg';
  const trial = !!b && b.beerId == null;
  const offs = nozzles(lv);
  const N = offs.length;
  const step = trial || N === 1 ? LINE.spacing : N * NOZZLE_GAP; // largeur d'une tournée
  const total = (keg ? b?.kegs : b?.bottles) ?? 0;
  const p = b ? (b.waiting ? 1 : Math.min(1, b.elapsed / Math.max(0.01, b.duration))) : 0;
  // un essai : une seule bouteille, sous le bec du milieu (on la goûte)
  const n = trial ? 1 : total;
  const done = trial ? Math.min(1, (b!.elapsed * Math.max(1, total)) / Math.max(0.01, b!.duration)) : p * n;
  const per = trial ? 1 : N; // bouteilles par tournée
  const slots = trial ? [offs[Math.floor((N - 1) / 2)]!] : offs;
  const beer = b?.beerId != null ? game.beers.find((x) => x.id === b.beerId) : undefined;
  return { lv, b, keg, trial, offs, step, n, per, slots, groupsDone: done / per, beer, label: beer?.label ?? null };
}
export type LineState = ReturnType<typeof lineState>;

/** Combien de tournées en arrière il faut remonter pour trouver celles qui ont dépassé x. */
const groupsBack = (st: LineState, x: number) => Math.max(2, Math.ceil(((x + 20 - LINE.fillX) / st.step - 1) / 1.25 + 2));

/** Chaque bouteille (ou fût) de la ligne dont le centre est entre x0 et x1 (repère de l'atelier) ; f : sa phase. */
export function lineItems(st: LineState, x0: number, x1: number, cb: (x: number, fill: number, f: number) => void): void {
  if (!st.b) return;
  const { step, groupsDone, slots, per, n } = st;
  const gNow = Math.floor(groupsDone);
  for (let gi = Math.max(0, gNow - groupsBack(st, x1)); gi <= gNow + 1; gi++) {
    const { x: gx, fill } = groupPos(groupsDone - gi, step);
    slots.forEach((dx, j) => {
      if (gi * per + j >= n) return;
      const x = gx + dx;
      if (x >= x0 && x < x1) cb(x, fill, groupsDone - gi);
    });
  }
}

/** Nombre de bouteilles (ou de fûts) du lot déjà arrivées au-delà de x (repère de l'atelier). */
export function lineArrived(st: LineState, x: number): number {
  if (!st.b || st.trial) return 0;
  const gNow = Math.floor(st.groupsDone);
  const back = groupsBack(st, x);
  // les tournées récentes une à une, les plus anciennes d'un bloc
  let c = Math.max(0, gNow - back) * st.per;
  for (let gi = Math.max(0, gNow - back); gi <= gNow + 1; gi++) {
    const { x: gx } = groupPos(st.groupsDone - gi, st.step);
    st.slots.forEach((dx, j) => { if (gi * st.per + j < st.n && gx + dx >= x) c++; });
  }
  return Math.min(st.n, c);
}

/** Une bouteille de 33 cl (9 × 26 px), pied posé sur le tapis. */
export function drawBeltBottle(g: CanvasRenderingContext2D, cx: number, base: number, fill: number, label: import('../core/label').Label | null, capped: boolean): void {
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

/** Un fût de 5 L (11 × 16 px) sur le tapis : la jauge monte sous le bec. */
export function drawBeltKeg(g: CanvasRenderingContext2D, cx: number, base: number, fill: number, label: import('../core/label').Label | null): void {
  const x = cx - 5;
  const y = base - 16;
  g.fillStyle = '#465264'; g.fillRect(x, y, 11, 16);
  g.fillStyle = '#c4d0dc'; g.fillRect(x + 1, y, 9, 16);
  g.fillStyle = '#ffffff'; g.fillRect(x + 2, y, 1, 16);
  g.fillStyle = '#98a6b6'; g.fillRect(x, y + 2, 11, 1); g.fillRect(x, y + 13, 11, 1);
  g.fillStyle = '#2c283a'; g.fillRect(x + 4, y - 2, 3, 2);
  g.fillStyle = '#1b1424'; g.fillRect(x + 7, y + 4, 2, 8);
  const h = Math.round(8 * fill);
  if (h > 0) { g.fillStyle = '#e8a530'; g.fillRect(x + 7, y + 12 - h, 2, h); }
  if (label && fill >= 1) drawMiniLabel(g, label, x + 1, y + 6, 5);
}

/** La bande du tapis qui défile avec les tournées, de x0 à x1 (origin : décalage du repère, pour le stockage). */
export function drawBeltBand(g: CanvasRenderingContext2D, st: LineState, x0: number, x1: number, origin = 0): void {
  const shift = Math.floor((st.groupsDone * st.step) % 4);
  g.fillStyle = '#4a4458';
  for (let x = x0 - 4 + ((((shift - x0 - origin) % 4) + 4) % 4); x < x1; x += 4) g.fillRect(x, LINE.belt + 2, 2, 1);
}

/** Couleur du liquide selon l'étape. */
const LIQUID: Record<StationId, readonly string[]> = {
  mill: PAL.malt, mash: PAL.wort, boil: PAL.wort, cooler: PAL.wort, fermenter: PAL.beer, conditioning: PAL.beer, bottling: PAL.beer,
};

export class Scene {
  readonly canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  /** Décor de chaque niveau de brasserie (mis en cache). */
  private bgs = new Map<number, HTMLCanvasElement>();
  /** Copies assombries des cuves, pour les cuves supplémentaires (en retrait). */
  private shaded = new Map<string, HTMLCanvasElement>();
  private flashAt = -99;
  /** Instant (s) du dernier transfert vers chaque étape, pour animer le liquide dans les tuyaux. */
  private flows = new Map<number, number>();
  selected: StationId | null = null;
  readonly key = 'workshop' as const;
  /** Aperçu (captures de contrôle) : le niveau de décor affiché. */
  preview: { level: number } | null = null;
  /** Limites de la pièce (le plan de 160 × 300 au centre du canvas, le décor peint jusqu'aux bords). */
  b: Bounds = { L: 0, R: SCENE_W, T: 0, B: SCENE_H, ox: 0, oy: 0 };

  constructor() {
    this.canvas.width = SCENE_W;
    this.canvas.height = SCENE_H;
    this.g = this.canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
  }

  /** Taille de l'écran en pixels natifs (voir Room.resize). */
  resize(w: number, h: number, b: Bounds): void {
    this.b = b;
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.bgs.clear();
  }

  onStage(stage: number, t: number): void {
    this.flows.set(stage, t);
    // le liquide qui arrive dans une rangée de cuves la traverse aussi
    const id = STATION_ORDER[stage];
    if (id) this.seriesFlow.set(id, t);
  }
  private seriesFlow = new Map<StationId, number>();

  /** Rectangle occupé par un appareil (coordonnées de la scène). L'embouteillage = la remplisseuse au premier plan. */
  /** Rectangle occupé par toute la rangée de cuves d'un appareil (la cuve de devant et celles de derrière, à sa gauche). */
  rowRect(id: StationId, level: number): Rect {
    const r = this.rect(id, level);
    const row = this.rows[id];
    const extra = row && row.n > 1 ? row.gap * (row.n - 1) : 0;
    return { x: r.x - extra, y: r.y, w: r.w + extra, h: r.h };
  }

  rect(id: StationId, level: number): Rect {
    if (id === 'bottling') return { x: LINE.fillX - 32, y: LINE.top, w: 78, h: LINE.belt - LINE.top };
    const def = SPRITES[id][level - 1]!;
    const s = SLOTS[id];
    const shift = id === 'fermenter' ? this.fermentShift : id === 'conditioning' ? this.gardeShift : 0;
    return { x: Math.round(s.cx - def.w / 2) + shift, y: s.floor - def.h, w: def.w, h: def.h };
  }

  private anchor(id: StationId, level: number, which: 'inlet' | 'outlet'): Pt {
    if (id === 'bottling') return { x: LINE.fillX - 14, y: LINE.top + 4 };
    const r = this.rect(id, level);
    const p = SPRITES[id][level - 1]![which];
    const row = this.rows[id];
    // une rangée de cuves en série : on entre par la cuve du fond (la plus à gauche), on sort par celle de devant (à droite)
    if (row && row.n > 1 && which === 'inlet') return { x: this.tankPort(r, p.x, row, row.n - 1), y: r.y + p.y };

    return { x: r.x + p.x, y: r.y + p.y };
  }

  /** Cuves en parallèle de chaque étape : leur nombre et leur écart (mis à jour à chaque image). */
  private rows: Partial<Record<StationId, { n: number; gap: number }>> = {};

  /**
   * Abscisse du piquage du haut de la cuve k d'une rangée (0 = celle de devant, à droite ; les suivantes, derrière,
   * se décalent vers la gauche) : son entrée habituelle pour la cuve de devant, sinon le milieu de la bande
   * que la cuve de devant laisse voir.
   */
  private tankPort(r: Rect, inletX: number, row: { n: number; gap: number }, k: number): number {
    const x = r.x - row.gap * k;
    if (k === 0) return x + inletX;
    return Math.round(x + row.gap / 2);
  }

  /** Position (scène) du bouton « Goûter » : au-dessus du bec de remplissage. */
  get tastePoint(): Pt {
    return { x: LINE.fillX + this.tasteDx, y: LINE.top - 6 };
  }
  /** Décalage de la fermentation et de la garde par rapport à leur place habituelle, pour loger leurs rangées de cuves. */
  private fermentShift = 0;
  private gardeShift = 0;
  /** Décalage du bec qui remplit la bouteille d'essai. */
  private tasteDx = 0;

  private checkedAt = 0;

  /**
   * Oublie les images en cache (décors, appareils) pour les redessiner. Nécessaire au retour d'arrière-plan :
   * iOS libère la mémoire des canvas hors écran, qui deviennent vides (seul ce qui est redessiné à chaque image restait visible).
   */
  invalidate(): void {
    this.bgs.clear();
    this.shaded.clear();
    clearSpriteCache();
    clearDecorCache();
  }

  /** Le décor en cache a-t-il été effacé par le système ? (il est entièrement opaque : un pixel transparent = perdu) */
  private cacheLost(level: number): boolean {
    const bg = this.bgs.get(level);
    if (!bg) return false;
    try {
      return bg.getContext('2d')!.getImageData(0, 0, 1, 1).data[3] === 0;
    } catch {
      return true;
    }
  }

  /** Ombre tramée d'un appareil, portée sur le mur derrière lui. */
  private wallShadow(id: StationId, lv: number): HTMLCanvasElement {
    const key = `w${id}${lv}`;
    let c = this.shaded.get(key);
    if (!c) {
      c = silhouette(stationCanvas(id, lv), 0.5);
      this.shaded.set(key, c);
    }
    return c;
  }

  private shadedSprite(id: StationId, lv: number): HTMLCanvasElement {
    const key = `${id}${lv}`;
    let c = this.shaded.get(key);
    if (c) return c;
    const src = stationCanvas(id, lv);
    c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(20,14,28,0.4)';
    g.fillRect(0, 0, c.width, c.height);
    this.shaded.set(key, c);
    return c;
  }

  /** Éclair blanc quand la brasserie change de niveau (et donc de décor). */
  flash(): void {
    this.flashAt = performance.now() / 1000;
  }

  draw(game: Game, t: number): void {
    const g = this.g;
    if (t - this.checkedAt > 1) {
      this.checkedAt = t;
      if (this.cacheLost(game.breweryLevel)) this.invalidate();
    }
    const lv = this.preview?.level ?? game.breweryLevel;
    {
      // les deux rangées de cuves se partagent l'étage, sans jamais se chevaucher ; elles peuvent déborder du plan
      // jusqu'aux bords de l'écran (la garde laisse à sa droite la place du tuyau qui l'alimente)
      const n = game.tankCount('fermenter');
      const fd = SPRITES.fermenter[game.level('fermenter') - 1]!;
      const m = game.tankCount('conditioning');
      const cd = SPRITES.conditioning[game.level('conditioning') - 1]!;
      const lo = Math.max(this.b.L + 2, -24);
      const hi = Math.min(this.b.R - 7, 184);
      const { fx, gf, cx, gc } = layoutTankRows(fd, n, cd, m, lo, hi);
      this.fermentShift = fx - Math.round(SLOTS.fermenter.cx - fd.w / 2);
      this.gardeShift = cx - Math.round(SLOTS.conditioning.cx - cd.w / 2);
      this.rows = { fermenter: { n, gap: gf }, conditioning: { n: m, gap: gc } };
    }
    const decor = { room: this.key, lv, t, game, preview: !!this.preview, top: this.b.T };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false; // réinitialisé si le contexte est restauré
    g.drawImage(this.background(lv), 0, 0);
    g.setTransform(1, 0, 0, 1, this.b.ox, this.b.oy);
    drawDecor(g, decor, false);
    this.drawPipes(game, t);
    for (const id of STATION_ORDER) if (id !== 'bottling') this.drawStation(game, id, t);
    this.drawLine(game, t);
    drawDecor(g, decor, true);
    const k = t - this.flashAt;
    if (k >= 0 && k < 1.2) {
      g.fillStyle = `rgba(255,248,220,${(1 - k / 1.2) * 0.85})`;
      g.fillRect(this.b.L, this.b.T, this.b.R - this.b.L, this.b.B - this.b.T);
    }
  }

  // ------------------------------------------------------------------ décor

  /**
   * Décor selon le niveau de la brasserie (le niveau de son appareil le moins avancé) :
   * 1 cave d'alchimiste, 2 garage, 3 microbrasserie, 4 usine, 5 laboratoire du futur.
   */
  private background(level: number): HTMLCanvasElement {
    const cached = this.bgs.get(level);
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d')!;
    const { L, R, T, B, ox, oy } = this.b;
    g.translate(ox, oy);
    const WW = R - L;
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
    };
    const W = SCENE_W;
    const top = LINE.top - 4;
    const cone = (x: number, y: number, w: number, h: number, alpha: number, col = '255,230,160') => {
      g.fillStyle = `rgba(${col},${alpha})`;
      g.beginPath();
      g.moveTo(x - 3, y); g.lineTo(x + 4, y); g.lineTo(x + w, y + h); g.lineTo(x - w + 1, y + h);
      g.fill();
    };
    // ---------------------------------------------------------------- murs
    if (level === 1) {
      // cave voûtée en pierre, poutres, étagères de bocaux
      px(L, T, WW, B - T, '#4a4038');
      for (let y = from(0, 9, T), row = Math.round(y / 9); y < top; y += 9, row++) {
        for (let x = from(-((((row % 16) + 16) * 7) % 16), 16, L - 16); x < R; x += 16) {
          const shade = ['#5e5248', '#56493f', '#665a4e', '#4e4238'][(x * 3 + row * 5) & 3]!;
          px(x + 1, y + 1, 14, 7, shade);
          px(x + 1, y + 1, 14, 1, '#76685a');
        }
      }
      for (const bx of [4, 152]) { px(bx, 0, 5, top, '#5a3a1c'); px(bx, 0, 1, top, '#7a5228'); }
      px(L, 0, WW, 5, '#5a3a1c'); px(L, 4, WW, 1, '#3a240e');
      for (let bx = from(4, 148, L); bx < R; bx += 148) if (bx !== 4 && bx !== 152) { px(bx, 0, 5, top, '#5a3a1c'); px(bx, 0, 1, top, '#7a5228'); }
      // lucarne, étagères, toiles d'araignée : des décors (voir decorLayout)
    } else if (level === 2) {
      // garage : mur de briques, fenêtres hautes
      const bricks = ['#9a4a3a', '#8a4232', '#7a3a2c', '#6a3226', '#5a2a20'];
      for (let y = T; y < B; y++) px(L, y, WW, 1, bricks[Math.max(0, Math.min(4, Math.floor((y / SCENE_H) * 3 + ((((y * 7) % 3) + 3) % 3 === 0 ? 0.5 : 0))))]!);
      for (let y = from(0, 6, T); y < B; y += 6) {
        px(L, y + 5, WW, 1, '#4a221a');
        for (let x = from((((y / 6) % 2) + 2) % 2 * 6, 12, L - 12); x < R; x += 12) { px(x, y, 1, 5, '#4a221a'); px(x + 1, y, 10, 1, '#b2604a'); }
      }
    } else if (level === 3) {
      // microbrasserie : carreaux métro blancs, poutres en bois, grandes baies en arc
      px(L, T, WW, B - T, '#e4ddd0');
      for (let y = from(0, 5, T); y < top; y += 5) {
        px(L, y + 4, WW, 1, '#b8ae9c');
        for (let x = from((((y / 5) % 2) + 2) % 2 * 5, 10, L - 10); x < R; x += 10) px(x, y, 1, 4, '#b8ae9c');
      }
      px(L, Math.min(0, T), WW, 6 - Math.min(0, T), '#8a5a2c'); px(L, 5, WW, 1, '#5a3a18');
      for (let bx = from(0, 78, L - 4); bx < R; bx += 78) px(bx, T, 4, top - T, '#8a5a2c');
    } else if (level === 4) {
      // usine : tôle ondulée, verrière quadrillée, poutres IPN
      for (let x = L; x < R; x++) px(x, T, 1, B - T, ['#5c6878', '#6c788a', '#7c889a', '#6c788a', '#56606e', '#4a5462'][((x % 6) + 6) % 6]!);
      px(L, Math.min(0, T), WW, 8 - Math.min(0, T), '#3a4250'); px(L, 7, WW, 1, '#2a303a');
      for (let wx = from(8, 38, L - 30); wx < R - 4; wx += 38) {
        px(wx, 12, 34, 30, '#2a303a');
        for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
          px(wx + 2 + i * 8, 14 + j * 9, 7, 8, '#7ab0d0');
          px(wx + 2 + i * 8, 14 + j * 9, 7, 2, '#b0d8f0');
        }
        cone(wx + 17, 42, 20, 26, 0.05, '220,240,255');
      }
      for (let bx = from(0, 77, L - 6); bx < R; bx += 77) { px(bx, 0, 6, top, '#c85a2c'); px(bx + 1, 0, 1, top, '#e88a5a'); px(bx + 4, 0, 1, top, '#8a3a1a'); }
    } else {
      // laboratoire du futur : panneaux blancs, néons, baie sur la ville de nuit
      px(L, T, WW, B - T, '#e8eef4');
      for (let y = from(0, 22, T); y < top; y += 22) px(L, y, WW, 1, '#c4d0dc');
      for (let x = from(0, 32, L); x < R; x += 32) px(x, T, 1, top - T, '#c4d0dc');
      for (const y of [98, 168]) { px(L, y, WW, 1, '#5ef0ff'); px(L, y + 1, WW, 1, '#1c8ca8'); }
    }
    // ---------------------------------------------------------------- ombrage des murs, étage par étage
    // (plus sombre sous chaque passerelle et dans les coins, halo autour des lampes et des fenêtres)
    const storeyLights: [number, number, number, number][][] = [
      level === 1 ? [[80, 18, 30, 0.25]] : level === 5 ? [[80, 20, 60, 0.12]] : [[80, 24, 60, 0.18]],
      [[80, 80, 46, level === 1 ? 0.35 : 0.22]],
      [[80, 150, 46, level === 1 ? 0.35 : 0.22]],
    ];
    const ceilings = [T, ...FLOORS.slice(0, 2).map((f) => f + 5)];
    FLOORS.forEach((f, i) => wallLight(g, this.b, ceilings[i]!, f, storeyLights[i]!, level === 3 || level === 5 ? 0.78 : 0.68));
    // ---------------------------------------------------------------- passerelles
    for (const f of FLOORS) {
      if (level === 1) {
        px(L, f, WW, 5, '#7a5228'); px(L, f, WW, 1, '#a87a48'); px(L, f + 4, WW, 1, '#4a2e14');
        for (let x = from(13, 26, L); x < R; x += 26) px(x, f + 1, 1, 3, '#5a3a1c');
      } else if (level === 5) {
        px(L, f, WW, 5, '#f4f8fc'); px(L, f, WW, 1, '#ffffff'); px(L, f + 4, WW, 1, '#8a9ab0'); px(L, f + 2, WW, 1, '#5ef0ff');
      } else {
        const metal = level === 3 ? ['#2c5a3a', '#6aa078', '#1c3c26'] : ['#3e3a50', '#8c88a0', '#2c283a'];
        px(L, f, WW, 5, metal[0]!); px(L, f, WW, 1, metal[1]!);
        for (let x = from(0, 3, L); x < R; x += 3) px(x, f + 2, 1, 2, metal[2]!);
        if (level === 4) for (let x = from(0, 8, L); x < R; x += 8) { px(x, f + 4, 4, 1, '#f2c14e'); px(x + 4, f + 4, 4, 1, '#1b1424'); }
      }
      px(L, f + 5, WW, 1, '#1c1828');
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(L, f + 6, WW, 3);
      // la passerelle a de l'épaisseur : on voit son dessus sous les yeux, son dessous au-dessus
      const deck = DECK[level - 1]!;
      if (f > EYE) {
        floor(g, this.b, f - 4, VX, EYE, 10, (u, v, du, dv) => (seam(u, du) ? deck[2] : seam(v * 2, dv * 2) ? mix(deck[0], deck[2], 0.4) : deck[0]), f);
        shade(g, this.b, { x: L, y: f - 4, w: WW, h: 4 }, (_, y) => 0.75 + (y - f + 4) * 0.08);
      } else {
        floor(g, this.b, f + 6, VX, EYE, 10, (u, v, du, dv) => (seam(u, du) ? deck[2] : seam(v * 3, dv * 3) ? deck[2] : deck[1]), f + 11);
        shade(g, this.b, { x: L, y: f + 6, w: WW, h: 5 }, (_, y) => 0.55 + (y - f - 6) * 0.06);
        px(L, f + 11, WW, 1, '#1c1828');
        shade(g, this.b, { x: L, y: f + 12, w: WW, h: 4 }, (_, y) => 0.7 + (y - f - 12) * 0.075);
      }
    }
    // ---------------------------------------------------------------- sol de la salle d'embouteillage, en perspective
    paintWorkshopFloor(g, this.b, top, level);
    floorLight(g, this.b, top, [[80, top + 24, 70, 0.2]], 0.5);
    px(L, top, WW, 2, level === 5 ? '#5ef0ff' : '#5c4848');
    shade(g, this.b, { x: L, y: top + 2, w: WW, h: 4 }, (_, y) => 0.6 + (y - top - 2) * 0.1);
    paintBelt(g, this.b, L, R, level);
    paintDecor(g, { room: this.key, lv: level, t: 0, game: null, preview: !!this.preview, top: T });
    this.bgs.set(level, c);
    return c;
  }

  // ------------------------------------------------------------------ tuyaux

  private drawPipes(game: Game, t: number): void {
    for (let i = 1; i < STATION_ORDER.length; i++) {
      const from = STATION_ORDER[i - 1]!;
      const to = STATION_ORDER[i]!;
      const a = this.anchor(from, game.level(from), 'outlet');
      const b = this.anchor(to, game.level(to), 'inlet');
      // vers une rangée de cuves, le tuyau passe par-dessus pour arriver sur la cuve du fond
      const top = ['mash', 'boil', 'fermenter', 'bottling'].includes(to) || (this.rows[to]?.n ?? 1) > 1;
      const garde = to === 'conditioning' && (this.rows.conditioning?.n ?? 1) > 1;
      // de la fermentation à une rangée de garde : le long de la passerelle, sous les cuves, puis on remonte
      // par la droite de la rangée et on redescend sur la cuve du fond
      const floorY = SLOTS.fermenter.floor - 3;
      const gr = this.rect('conditioning', game.level('conditioning'));
      const xr = gr.x + gr.w + 4;
      const path: Pt[] = garde
        ? [a, { x: a.x, y: floorY }, { x: xr, y: floorY }, { x: xr, y: b.y - 6 }, { x: b.x, y: b.y - 6 }, b]
        : top
        ? [a, { x: a.x + 5, y: a.y }, { x: a.x + 5, y: b.y - 6 }, { x: b.x, y: b.y - 6 }, b]
        : (() => {
            const mx = Math.round((a.x + b.x) / 2);
            return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
          })();
      const grain = from === 'mill';
      this.pipe(path, grain);
      const since = t - (this.flows.get(i) ?? -99);
      if (since < 2.5) this.flow(path, t, since, 2.5, grain, grain ? PAL.malt : LIQUID[to]);
    }
  }

  private pipe(path: Pt[], grain: boolean, valve = true): void {
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
    if (!valve) return;
    const m = path[Math.floor(path.length / 2)]!;
    g.fillStyle = PAL.rd[3]!; g.fillRect(m.x - 2, m.y - 5, 5, 1);
    g.fillStyle = PAL.rd[2]!; g.fillRect(m.x, m.y - 5, 1, 3);
  }

  /**
   * Liquide (ou grain) qui circule pendant un transfert : le tuyau se remplit depuis l'appareil de départ,
   * le courant défile en continu (reflets qui glissent au pixel près, avec un fondu entre deux pixels),
   * puis le tuyau se vide par l'arrière à la fin du transfert.
   */
  private flow(path: Pt[], t: number, since: number, span: number, grain: boolean, col: readonly string[]): void {
    const g = this.g;
    const segs = path.slice(1).map((b, k) => {
      const a = path[k]!;
      return { a, b, len: Math.abs(b.x - a.x) + Math.abs(b.y - a.y) };
    });
    const total = segs.reduce((s, x) => s + x.len, 0);
    if (total <= 0) return;
    const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 2;
    const head = total * ease(since / 0.45); // le front avance vite, puis ralentit en arrivant
    const tail = total * ease((since - (span - 0.5)) / 0.5); // la queue part en dernier
    const speed = 34; // px par seconde
    const period = 7;
    const phase = t * speed;
    // couleurs : le fond du courant, ses reflets (le grain : des grains qui roulent)
    const base = grain ? col[3]! : col[2]!;
    const shine = grain ? col[1]! : col[0]!;
    let d = 0;
    for (const sgm of segs) {
      const dx = Math.sign(sgm.b.x - sgm.a.x);
      const dy = Math.sign(sgm.b.y - sgm.a.y);
      for (let i = 0; i <= sgm.len; i++, d++) {
        if (d < tail || d > head) continue;
        const x = sgm.a.x + dx * i;
        const y = sgm.a.y + dy * i;
        // le courant occupe le cœur du tuyau (2 px) ; le bord avant du front est plus clair
        const front = head - d < 2 && head < total;
        g.fillStyle = front ? shine : base;
        if (dy === 0) g.fillRect(x, y, 1, 2);
        else g.fillRect(x, y, 2, 1);
        if (grain) {
          // des grains : un sur trois, qui avancent
          if (Math.floor(d - phase) % 3 === 0) { g.fillStyle = shine; g.fillRect(x, y, 1, 1); }
          continue;
        }
        // reflet qui glisse : intensité selon la distance au centre de la vague (sous-pixel)
        const w = (((d - phase) % period) + period) % period;
        const k = Math.max(0, 1 - Math.abs(w - period / 2) / 1.6);
        if (k > 0) {
          g.globalAlpha = k * 0.9;
          g.fillStyle = shine;
          if (dy === 0) g.fillRect(x, y, 1, 1);
          else g.fillRect(x, y, 1, 1);
          g.globalAlpha = 1;
        }
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
    // ombres : la silhouette de l'appareil sur le mur (la lumière vient d'en haut à gauche), et son pied sur la passerelle
    const fl = SLOTS[id as Exclude<StationId, 'bottling'>].floor;
    // cuves en parallèle : la cuve de devant reste à sa place, les autres se rangent derrière elle en se décalant
    // vers la gauche, la plus éloignée le plus à gauche ; on voit toujours leur flanc gauche, et donc leur jauge
    const tanks = game.tankCount(id);
    const gap = this.rows[id]?.gap ?? 0;
    if (tanks > 1) {
      const all = game.batchesAt(id);
      for (let k = tanks - 1; k >= 1; k--) {
        const x = r.x - gap * k;
        const es = ellipseShadow(Math.max(4, Math.round(r.w / 2)), 3, 0.8);
        g.drawImage(es, Math.round(x + r.w / 2 - es.width / 2) + 1, fl - 4);
        g.drawImage(this.shadedSprite(id, lv), x, r.y); // en retrait : un peu plus sombre
        const tb = all[k];
        if (def.window && tb) {
          const w = def.window;
          const p = Math.min(1, tb.elapsed / Math.max(0.01, tb.duration));
          const h = Math.round(w.h * Math.min(1, 0.35 + p * 2));
          const col = LIQUID[id];
          g.fillStyle = col[3]!; g.fillRect(x + w.x, r.y + w.y + w.h - h, w.w, h);
          g.fillStyle = col[2]!; g.fillRect(x + w.x, r.y + w.y + w.h - h, Math.max(1, w.w - 1), h);
          g.fillStyle = col[0]!; g.fillRect(x + w.x, r.y + w.y + w.h - h, w.w, 1);
        }
        // une cuve qui travaille : un voyant vert, au-dessus de sa jauge
        if (tb) {
          const vx = def.window ? x + def.window.x : x + Math.round(gap / 2);
          const vy = def.window ? r.y + def.window.y - 4 : r.y + 3;
          g.fillStyle = Math.floor(t * 2 + k) % 2 ? '#7cff9c' : '#3e9028';
          g.fillRect(vx, vy, 2, 2);
        }
        // la cuve de devant fait son ombre sur celle de derrière
        g.fillStyle = 'rgba(16,10,24,0.25)';
        g.fillRect(x + gap - 2, r.y + 2, 2, r.h - 4);
      }
    }
    g.drawImage(this.wallShadow(id, lv), r.x + 4, r.y - 2);
    const sh = ellipseShadow(Math.max(4, Math.round(r.w / 2)), 3, 0.8);
    g.drawImage(sh, Math.round(r.x + r.w / 2 - sh.width / 2) + 1, fl - 4);
    if (def.flame && active) this.flames(r.x + def.flame.x, r.y + def.flame.y, def.flame.w, t);
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
    if (tanks > 1) {
      // les cuves sont reliées en série : un court tuyau sort de chaque cuve et entre dans celle qui est devant elle
      const cy = r.y + Math.round(def.h * 0.72);
      const since = t - (this.seriesFlow.get(id) ?? -99);
      for (let k = tanks - 1; k >= 1; k--) {
        const xl = r.x - gap * k + Math.max(2, Math.round(gap / 2)); // sur la bande visible de la cuve k
        const xr = r.x - gap * (k - 1) + 1; // le flanc gauche de la cuve qui est devant
        const path = [{ x: xl, y: cy }, { x: xr, y: cy }];
        this.pipe(path, false, false);
        g.fillStyle = PAL.st[4]!; g.fillRect(xr - 1, cy - 2, 2, 5); g.fillRect(xl, cy - 2, 2, 5); // brides
        if (since < 2.5) this.flow(path, t, since, 2.5, false, LIQUID[id]);
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
   * La ligne d'embouteillage : les bouteilles (ou les fûts) arrivent par tournées, autant que la remplisseuse a de becs,
   * se remplissent ensemble, passent à l'étiqueteuse et filent sur le tapis jusqu'au stockage, où on les met en caisse.
   */
  private drawLine(game: Game, t: number): void {
    const g = this.g;
    const st = lineState(game);
    const { lv, b, keg, offs, label } = st;
    this.tasteDx = offs[Math.floor((offs.length - 1) / 2)]!;
    const { fillX, labelX, belt } = LINE;
    drawBeltBand(g, st, this.b.L, this.b.R);
    this.drawPallet(game);
    this.drawFiller(lv, !!b && !b.waiting, t);
    this.drawLabeler(lv, !!b && !b.waiting, t);
    // bouteilles sur le tapis : elles filent vers la droite, jusque dans le stockage
    if (!b) {
      for (const dx of offs) drawBeltBottle(g, fillX - st.step + dx, belt, 0, null, false);
      return;
    }
    lineItems(st, this.b.L - 8, this.b.R + 8, (x, fill, f) => {
      if (keg) drawBeltKeg(g, Math.round(x), belt, fill, label);
      else drawBeltBottle(g, Math.round(x), belt, fill, x >= labelX && label ? label : null, f >= 1);
      if (fill > 0 && fill < 1 && !b.waiting) this.pour(Math.round(x), belt, t, keg);
    });
  }

  /** Filet de bière qui coule du bec dans le goulot (ou dans le fût). */
  private pour(cx: number, base: number, t: number, keg = false): void {
    const g = this.g;
    const top = LINE.top + 40;
    const bottom = keg ? base - 18 : base - 25;
    for (let y = top; y < bottom; y++) {
      g.fillStyle = (y + Math.floor(t * 30)) % 3 ? '#e8a530' : '#f2c14e';
      g.fillRect(cx, y, 1, 1);
    }
  }

  private drawFiller(lv: number, active: boolean, t: number): void {
    const g = this.g;
    const x = LINE.fillX;
    const top = LINE.top;
    const P = PAL;
    const px = (xx: number, yy: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(xx, yy, w, h);
    };
    if (lv === 1) {
      // support de labo, ballon renversé et entonnoir au-dessus du goulot
      px(x - 26, top + 66, 14, 3, P.ir[3]!); px(x - 26, top + 66, 14, 1, P.ir[1]!);
      px(x - 21, top + 4, 2, 62, P.st[3]!); px(x - 21, top + 4, 1, 62, P.st[1]!);
      px(x - 19, top + 20, 18, 2, P.br[2]!); px(x - 19, top + 8, 12, 2, P.br[2]!);
      g.fillStyle = P.gl[3]!; g.beginPath(); g.arc(x - 6, top + 6, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = P.beer[2]!; g.beginPath(); g.arc(x - 6, top + 6, 5, 0, Math.PI * 2); g.fill();
      px(x - 8, top + 12, 3, 8, P.gl[3]!);
      for (let j = 0; j < 6; j++) px(x - 5 + j / 2, top + 22 + j, 10 - j, 1, P.gl[j < 2 ? 1 : 2]!);
      px(x, top + 28, 1, 8, P.gl[3]!);
      return;
    }
    if (lv === 2) {
      // seau sur étagère + tuyau + canne
      px(x - 28, top + 26, 24, 3, P.wd[4]!);
      px(x - 25, top + 10, 16, 16, P.pl[2]!);
      px(x - 25, top + 10, 4, 16, P.pl[0]!);
      px(x - 13, top + 10, 4, 16, P.pl[4]!);
      px(x - 26, top + 8, 18, 3, P.pl[1]!);
      px(x - 9, top + 22, 9, 2, P.st[3]!);
      px(x, top + 22, 2, 18, P.st[3]!);
      return;
    }
    const fut = lv === 5;
    const offs = nozzles(lv);
    const w = (offs.length - 1) * NOZZLE_GAP + 12; // la remplisseuse est aussi large que ses becs
    const body = lv === 3 ? P.st : lv === 4 ? P.tl : (['#ffffff', '#f4f8fc', '#dce6f0', '#b8c6d6', '#8a9ab0', '#5a6a82'] as const);
    px(x - w / 2 - 1, top - 1, w + 2, 36, '#1b1424');
    for (let i = 0; i < w; i++) {
      const k = i / w;
      px(x - w / 2 + i, top, 1, 34, body[k < 0.15 ? 2 : k < 0.3 ? 1 : k < 0.75 ? 2 : 4]!);
    }
    px(x - w / 2, top, w, 1, body[0]!);
    if (fut) {
      px(x - w / 2, top + 30, w, 1, '#5ef0ff');
      px(x - w / 2 + 3, top + 5, 16, 10, '#0c1420');
      for (let i = 0; i < 14; i++) px(x - w / 2 + 4 + i, top + 10 + Math.round(Math.sin(i * 0.9 + t * 4) * 3), 1, 1, '#5ef0ff');
    }
    // panneau de commande
    px(x + w / 2 - 12, top + 6, 9, 9, '#2c283a');
    px(x + w / 2 - 10, top + 8, 5, 2, fut ? '#5ef0ff' : '#7cff9c');
    px(x + w / 2 - 10, top + 12, 1, 1, active && Math.floor(t * 4) % 2 ? '#6cc040' : '#3e9028');
    px(x + w / 2 - 6, top + 12, 1, 1, '#e85a3a');
    // becs (ou pinces robotisées)
    for (const dx of offs) {
      const reach = 6;
      px(x + dx - 1, top + 34, 3, reach, fut ? '#8a9ab0' : P.st[4]!);
      px(x + dx - 1, top + 34, 1, reach, fut ? '#ffffff' : P.st[1]!);
      if (fut) px(x + dx, top + 34 + reach, 1, 1, '#5ef0ff');
    }
  }

  private drawLabeler(lv: number, active: boolean, t: number): void {
    const g = this.g;
    const x = LINE.labelX;
    const top = LINE.top + 16;
    if (lv === 1) {
      // étiquetage à la main : pot de colle et pinceau sur un tabouret
      g.fillStyle = PAL.wd[3]!; g.fillRect(x - 6, top + 30, 12, 3); g.fillRect(x - 5, top + 33, 2, 13); g.fillRect(x + 3, top + 33, 2, 13);
      g.fillStyle = PAL.gl[2]!; g.fillRect(x - 4, top + 22, 7, 8);
      g.fillStyle = '#f6ecd6'; g.fillRect(x - 3, top + 25, 5, 4);
      g.fillStyle = PAL.wd[1]!; g.fillRect(x + 1, top + 14, 1, 10);
      return;
    }
    const fut = lv === 5;
    // rouleau d'étiquettes et bras
    g.fillStyle = '#1b1424'; g.fillRect(x - 9, top - 1, 18, 26);
    g.fillStyle = fut ? '#dce6f0' : lv === 4 ? PAL.br[2]! : PAL.ir[2]!; g.fillRect(x - 8, top, 16, 24);
    g.fillStyle = fut ? '#ffffff' : lv === 4 ? PAL.br[0]! : PAL.ir[0]!; g.fillRect(x - 8, top, 16, 1);
    if (fut) { g.fillStyle = '#5ef0ff'; g.fillRect(x - 8, top + 20, 16, 1); }
    const a = active ? t * 6 : 0;
    g.fillStyle = '#f6ecd6';
    g.beginPath(); g.arc(x, top + 9, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#bdb59e';
    g.fillRect(Math.round(x + Math.cos(a) * 3), Math.round(top + 9 + Math.sin(a) * 3), 1, 1);
    g.fillStyle = fut ? '#8a9ab0' : '#6c6884'; g.fillRect(x - 1, top + 24, 3, 22);
    g.fillStyle = '#f6ecd6'; g.fillRect(x - 3, top + 40, 2, 6);
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

/** Passerelles : dessus, dessous, joints. */
const DECK = [
  ['#8a6034', '#4a2e14', '#3a2410'], ['#5a566c', '#2c283a', '#1c1828'], ['#3a6a48', '#1c3c26', '#142a1c'],
  ['#5a566c', '#2c283a', '#1c1828'], ['#ffffff', '#b8c6d6', '#8a9ab0'],
].map((p) => p.map(rgb) as [RGB, RGB, RGB]);

/** Le sol de la salle d'embouteillage, qui fuit vers le point de fuite de l'atelier. */
function paintWorkshopFloor(g: CanvasRenderingContext2D, b: Bounds, top: number, level: number): void {
  const mod = (a: number) => a - Math.floor(a);
  if (level === 1) {
    // vieux plancher : lames dans la profondeur, raboutées en quinconce
    const woods = ['#6a4422', '#62401f', '#724826'].map(rgb);
    const joint = rgb('#4a2e14');
    floor(g, b, top, VX, EYE, 20, (u, v, du, dv) => {
      const bi = Math.floor(u * 2);
      if (seam(u * 2, du * 2)) return joint;
      const ve = v + ((bi * 37) % 7) * 0.6;
      if (seam(ve / 3, dv / 3)) return joint;
      return woods[((bi * 7 + Math.floor(ve / 3)) % 3 + 3) % 3]!;
    });
  } else if (level === 2) {
    // garage : dalles de béton sombre
    const base = rgb('#3a2c2c');
    const joint = rgb('#2a1e20');
    floor(g, b, top, VX, EYE, 26, (u, v, du, dv) => (seam(u, du) || seam(v, dv) ? joint : mod(u * 7 + v * 3) < 0.04 ? dim(base, 0.9) : base));
  } else if (level === 3) {
    // tomettes en damier
    const a = rgb('#a8582c');
    const c = rgb('#c87a44');
    floor(g, b, top, VX, EYE, 14, (u, v) => ((Math.floor(u) + Math.floor(v)) & 1 ? a : c));
  } else if (level === 4) {
    // béton d'usine, allée jaune qui fuit vers le fond
    const base = rgb('#6a6e74');
    const speck = rgb('#585c62');
    const lane = rgb('#f2c14e');
    floor(g, b, top, VX, EYE, 30, (u, v, du) => {
      if (Math.abs(Math.abs(u) - 1.5) < 0.06 + du / 2) return lane;
      return mod(Math.sin(Math.floor(u * 30) * 12.9898 + Math.floor(v * 30) * 78.233) * 43758.5) < 0.12 ? speck : base;
    });
  } else {
    // laboratoire : dalles sombres quadrillées, ligne lumineuse
    const base = rgb('#1c2230');
    const joint = rgb('#2a3244');
    const neon = rgb('#5ef0ff');
    floor(g, b, top, VX, EYE, 22, (u, v, du, dv) => (Math.abs(u) < 0.03 + du / 2 ? neon : seam(u, du) || seam(v, dv) ? joint : base));
  }
}
