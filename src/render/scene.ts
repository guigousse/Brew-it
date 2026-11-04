/**
 * La brasserie à l'écran, en portrait : le procédé descend en zigzag du moulin (en haut) à l'embouteillage (en bas).
 * Rendu sur un canvas à résolution native (200 px de large), agrandi au pixel près.
 */
import type { Game } from '../core/game';
import { STATION_ORDER, type StationId } from '../core/stations';
import { PAL } from './painter';
import { clearSpriteCache, SPRITES, stationCanvas, type Pt, type Rect } from './sprites';
import { drawMiniLabel } from './labelArt';
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
  /** Décor de chaque niveau de brasserie (mis en cache). */
  private bgs = new Map<number, HTMLCanvasElement>();
  /** Copies assombries des cuves, pour les cuves supplémentaires (en retrait). */
  private shaded = new Map<string, HTMLCanvasElement>();
  private flashAt = -99;
  /** Instant (s) du dernier transfert vers chaque étape, pour animer le liquide dans les tuyaux. */
  private flows = new Map<number, number>();
  selected: StationId | null = null;
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

  private checkedAt = 0;

  /**
   * Oublie les images en cache (décors, appareils) pour les redessiner. Nécessaire au retour d'arrière-plan :
   * iOS libère la mémoire des canvas hors écran, qui deviennent vides (seul ce qui est redessiné à chaque image restait visible).
   */
  invalidate(): void {
    this.bgs.clear();
    this.shaded.clear();
    clearSpriteCache();
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
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false; // réinitialisé si le contexte est restauré
    g.drawImage(this.background(game.breweryLevel), 0, 0);
    g.setTransform(1, 0, 0, 1, this.b.ox, this.b.oy);
    this.drawPipes(game, t);
    for (const id of STATION_ORDER) if (id !== 'bottling') this.drawStation(game, id, t);
    this.drawLine(game, t);
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
      // lucarne ronde au clair de lune
      g.fillStyle = '#2a2030'; g.beginPath(); g.arc(80, 18, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1c2a4a'; g.beginPath(); g.arc(80, 18, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f6ecd6'; g.beginPath(); g.arc(84, 15, 3, 0, Math.PI * 2); g.fill();
      px(80, 9, 1, 18, '#2a2030'); px(71, 18, 18, 1, '#2a2030');
      // étagères de bocaux et grimoires
      for (const [sx, sy] of [[60, 98], [64, 170]] as const) {
        px(sx, sy, 34, 2, '#7a5228');
        const cols = ['#6cc040', '#e8553a', '#4ea8f0', '#f2c14e', '#8a5cc8'];
        for (let i = 0; i < 5; i++) { px(sx + 2 + i * 7, sy - 6, 5, 6, '#c8f0e8'); px(sx + 3 + i * 7, sy - 4, 3, 4, cols[i]!); }
      }
      // toiles d'araignée
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.moveTo(9, 5); g.lineTo(22, 5); g.moveTo(9, 5); g.lineTo(9, 18); g.moveTo(9, 5); g.lineTo(19, 15); g.stroke();
    } else if (level === 2) {
      // garage : mur de briques, fenêtres hautes
      const bricks = ['#9a4a3a', '#8a4232', '#7a3a2c', '#6a3226', '#5a2a20'];
      for (let y = T; y < B; y++) px(L, y, WW, 1, bricks[Math.max(0, Math.min(4, Math.floor((y / SCENE_H) * 3 + ((((y * 7) % 3) + 3) % 3 === 0 ? 0.5 : 0))))]!);
      for (let y = from(0, 6, T); y < B; y += 6) {
        px(L, y + 5, WW, 1, '#4a221a');
        for (let x = from((((y / 6) % 2) + 2) % 2 * 6, 12, L - 12); x < R; x += 12) { px(x, y, 1, 5, '#4a221a'); px(x + 1, y, 10, 1, '#b2604a'); }
      }
      for (const wx of [62, 84]) {
        px(wx - 1, 3, 16, 24, '#2a1a20'); px(wx, 4, 14, 22, '#6cc0f0'); px(wx, 4, 14, 8, '#a8e0ff');
        px(wx + 6, 4, 2, 22, '#2a1a20'); px(wx, 14, 14, 1, '#2a1a20');
        cone(wx + 7, 26, 23, 38, 0.07, '255,240,200');
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
      for (const wx of [24, 104]) {
        px(wx, 10, 32, 30, '#3a2c20');
        g.fillStyle = '#3a2c20'; g.beginPath(); g.arc(wx + 16, 10, 16, Math.PI, 0); g.fill();
        g.fillStyle = '#8ad0f0'; g.beginPath(); g.arc(wx + 16, 10, 14, Math.PI, 0); g.fill();
        px(wx + 2, 10, 28, 28, '#8ad0f0'); px(wx + 2, 10, 28, 10, '#c0ecff');
        px(wx + 15, -4, 2, 42, '#3a2c20'); px(wx + 2, 22, 28, 1, '#3a2c20');
        cone(wx + 16, 38, 26, 30, 0.08, '255,250,220');
      }
      // ardoise des bières
      px(66, 94, 28, 18, '#5a3a18'); px(67, 95, 26, 16, '#2a3030');
      for (let i = 0; i < 4; i++) px(70, 98 + i * 3, 10 + ((i * 7) % 9), 1, '#e8e4dc');
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
      px(30, 6, 100, 28, '#0c1420');
      for (let i = 0; i < 40; i++) px(31 + ((i * 37) % 98), 7 + ((i * 13) % 12), 1, 1, i % 5 ? '#ffffff' : '#5ef0ff');
      for (let i = 0; i < 12; i++) { const h = 6 + ((i * 11) % 12); px(32 + i * 8, 34 - h, 6, h, '#1c2a44'); px(33 + i * 8, 35 - h, 1, 1, '#f2c14e'); px(35 + i * 8, 37 - h, 1, 1, '#5ef0ff'); }
      px(30, 5, 100, 1, '#5ef0ff'); px(30, 34, 100, 1, '#5ef0ff');
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
    // ---------------------------------------------------------------- éclairage
    for (const [lx, ly] of [[80, 68], [80, 138]] as const) {
      if (level === 1) {
        // bougie sur un bougeoir
        px(lx - 2, ly + 14, 5, 2, '#a8742a'); px(lx - 1, ly + 8, 3, 6, '#f6ecd6');
        px(lx, ly + 5, 1, 3, '#ff9a2e'); px(lx, ly + 6, 1, 1, '#fff4b0');
        g.fillStyle = 'rgba(255,190,90,0.10)'; g.beginPath(); g.arc(lx, ly + 7, 22, 0, Math.PI * 2); g.fill();
      } else if (level === 5) {
        px(lx - 14, ly + 2, 29, 2, '#ffffff'); px(lx - 13, ly + 4, 27, 1, '#5ef0ff');
        cone(lx, ly + 5, 26, 50, 0.06, '160,240,255');
      } else {
        px(lx, ly, 1, 6, '#2c283a');
        px(lx - 4, ly + 6, 9, 3, level === 3 ? '#b88420' : '#465264');
        px(lx - 3, ly + 9, 7, 1, '#fff4b0');
        cone(lx, ly + 10, 21, 50, 0.06);
      }
    }
    // ---------------------------------------------------------------- sol de la salle d'embouteillage, en perspective
    paintWorkshopFloor(g, this.b, top, level);
    floorLight(g, this.b, top, [[80, top + 24, 70, 0.2]], 0.5);
    px(L, top, WW, 2, level === 5 ? '#5ef0ff' : '#5c4848');
    shade(g, this.b, { x: L, y: top + 2, w: WW, h: 4 }, (_, y) => 0.6 + (y - top - 2) * 0.1);
    // tapis roulant (châssis, la bande est animée)
    px(L, LINE.belt, WW, 6, level === 1 ? '#5a3a1c' : '#2c283a');
    px(L, LINE.belt, WW, 1, level === 1 ? '#a87a48' : '#8c88a0');
    px(L, LINE.belt + 6, WW, 2, '#1c1828');
    for (let x = from(8, 48, L - 3); x < R; x += 48) {
      px(x, LINE.belt + 8, 3, B - LINE.belt - 8, '#3e3a50');
      px(x, LINE.belt + 8, 1, B - LINE.belt - 8, '#6c6884');
    }
    // l'ombre de la ligne d'embouteillage sur le sol, derrière le tapis
    shade(g, this.b, { x: L, y: LINE.belt - 6, w: WW, h: 6 }, (_, y) => 0.6 + (LINE.belt - y) * 0.065);
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
    // ombres : la silhouette de l'appareil sur le mur (la lumière vient d'en haut à gauche), et son pied sur la passerelle
    const fl = SLOTS[id as Exclude<StationId, 'bottling'>].floor;
    g.drawImage(this.wallShadow(id, lv), r.x + 4, r.y - 2);
    const sh = ellipseShadow(Math.max(4, Math.round(r.w / 2)), 3, 0.8);
    g.drawImage(sh, Math.round(r.x + r.w / 2 - sh.width / 2) + 1, fl - 4);
    if (def.flame && active) this.flames(r.x + def.flame.x, r.y + def.flame.y, def.flame.w, t);
    // cuves en parallèle : rangée de cuves en retrait, derrière la principale
    const tanks = game.tankCount(id);
    if (tanks > 1) {
      const busy = game.batchesAt(id).length;
      for (let k = tanks - 1; k >= 1; k--) {
        const dx = (id === 'fermenter' ? 11 : -11) * k;
        g.drawImage(this.shadedSprite(id, lv), r.x + dx, r.y - 2 * k);
        // une cuve qui travaille : un voyant vert
        if (k < busy) {
          g.fillStyle = Math.floor(t * 2 + k) % 2 ? '#7cff9c' : '#3e9028';
          g.fillRect(r.x + dx + Math.floor(r.w / 2), r.y - 2 * k + 3, 2, 2);
        }
      }
    }
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
    const keg = b?.format === 'keg';
    const n = (keg ? b?.kegs : b?.bottles) ?? 0;
    const p = b ? (b.waiting ? 1 : Math.min(1, b.elapsed / Math.max(0.01, b.duration))) : 0;
    const done = p * n;
    const beer = b?.beerId != null ? game.beers.find((x) => x.id === b.beerId) : undefined;
    const label = beer?.label ?? null;
    const { fillX, labelX, cartonX, belt, spacing } = LINE;

    // bande du tapis qui défile
    const shift = Math.floor((done * spacing) % 4);
    g.fillStyle = '#4a4458';
    for (let x = from(-4 + shift, 4, this.b.L - 4); x < this.b.R; x += 4) g.fillRect(x, belt + 2, 2, 1);

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
        if (keg) this.keg(Math.round(x), belt, fill, label);
        else this.bottle(Math.round(x), belt, fill, x >= labelX && label ? label : null, f >= 1);
        if (f >= 0.2 && f < 1) this.pour(fillX, belt, t);
      }
    }
    // carton en bout de ligne
    // bouteilles arrivées au carton : celles dont la position a dépassé son bord
    let inCarton = 0;
    if (b && !keg) for (let k = 0; k < Math.min(n, Math.ceil(done)); k++) if (bottlePos(done - k).x >= cartonX + 2) inCarton++;
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

  /** Un fût de 5 L (11 × 16 px) sur le tapis : la jauge monte sous le bec. */
  private keg(cx: number, base: number, fill: number, label: import('../core/label').Label | null): void {
    const g = this.g;
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
    const w = lv === 3 ? 34 : 44;
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
    const nozzles = lv === 3 ? [-12, -4, 4, 12] : [-16, -8, 0, 8, 16];
    for (const dx of nozzles) {
      const reach = dx === 0 ? 6 : 4;
      px(x + dx - 1, top + 34, 3, reach, fut ? '#8a9ab0' : P.st[4]!);
      px(x + dx - 1, top + 34, 1, reach, fut ? '#ffffff' : P.st[1]!);
      if (fut) px(x + dx, top + 34 + reach, 1, 1, '#5ef0ff');
    }
    if (lv === 3) px(x - 1, top + 34, 3, 6, P.st[4]!);
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
