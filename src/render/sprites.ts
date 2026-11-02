/**
 * Sprites pixel art 16-bit, vue de face, dessinés pixel par pixel sur un canvas à résolution native
 * (palette limitée, ombrage par bandes, contour sombre automatique). Les mêmes canvas servent de
 * textures Pixi et d'aperçus dans le magasin.
 */
import type { BuildingType } from '../core/content/buildings';

// ---------------------------------------------------------------- palette
export const PAL = {
  outline: '#1b1424',
  shadow: '#00000040',
  cu: ['#ffe0a8', '#f5b76a', '#d4853a', '#9a5424', '#5e3016'], // cuivre : reflet → ombre
  st: ['#ffffff', '#e2e8ef', '#b3bfcc', '#7c8796', '#4c5462'], // inox
  wd: ['#f0c088', '#d4955a', '#a86a35', '#6e4220'], // bois
  rd: ['#ff9a7a', '#e8553a', '#a8301f'],
  bl: ['#a8dcff', '#5aa2e8', '#2e62a8'],
  gr: ['#b8f08a', '#6cc04a', '#3a7a2a'],
  tl: ['#8fe0d4', '#4fb0a4', '#2c7068'], // turquoise (embouteilleuse)
  ir: ['#6c6680', '#4a4458', '#2e2a38'], // fonte
  gl: ['#e4fff8', '#b4e6dc', '#7cbcb4', '#4e8a84'], // verre
  pl: ['#fffcf0', '#e8e2cf', '#bdb59c'], // plastique / papier
  gold: '#f2c14e',
  beer: ['#ffd76a', '#e8a530', '#b06f18'],
  brick: ['#b85a44', '#96442f', '#6f3022', '#d8c8b0'],
};

// ---------------------------------------------------------------- peintre
class Painter {
  readonly c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  constructor(readonly w: number, readonly h: number) {
    this.c = document.createElement('canvas');
    this.c.width = w;
    this.c.height = h;
    this.g = this.c.getContext('2d')!;
  }
  rect(x: number, y: number, w: number, h: number, color: string) {
    this.g.fillStyle = color;
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  px(x: number, y: number, color: string) {
    this.rect(x, y, 1, 1, color);
  }
  hl(x: number, y: number, w: number, color: string) {
    this.rect(x, y, w, 1, color);
  }
  vl(x: number, y: number, h: number, color: string) {
    this.rect(x, y, 1, h, color);
  }
  /** Ellipse pleine au pixel près (pas d'anticrénelage). */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string) {
    for (let y = -ry; y <= ry; y++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.25))));
      this.hl(cx - half, cy + y, half * 2 + 1, color);
    }
  }
  /** Corps cylindrique vu de face : bandes claires à gauche, reflet, ombre à droite. */
  cylinder(x: number, y: number, w: number, h: number, s: readonly string[]) {
    for (let i = 0; i < w; i++) {
      const t = (i + 0.5) / w;
      const c = t < 0.12 ? s[2]! : t < 0.3 ? s[1]! : t < 0.4 ? s[0]! : t < 0.68 ? s[2]! : t < 0.86 ? s[3]! : s[4] ?? s[3]!;
      this.vl(x + i, y, h, c);
    }
  }
  /** Bandeau horizontal (cerclage) qui suit l'ombrage du cylindre. */
  band(x: number, y: number, w: number, s: readonly string[]) {
    for (let i = 0; i < w; i++) {
      const t = (i + 0.5) / w;
      this.px(x + i, y, t < 0.35 ? s[1]! : t < 0.75 ? s[2]! : s[3]!);
    }
  }
  /** Contour sombre automatique autour des pixels opaques (style 16-bit). */
  outline(color = PAL.outline) {
    const img = this.g.getImageData(0, 0, this.w, this.h);
    const a = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : img.data[(y * this.w + x) * 4 + 3]!);
    const pts: [number, number][] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (a(x, y) > 0) continue;
        if (a(x - 1, y) > 200 || a(x + 1, y) > 200 || a(x, y - 1) > 200 || a(x, y + 1) > 200) pts.push([x, y]);
      }
    for (const [x, y] of pts) this.px(x, y, color);
  }
}

// ---------------------------------------------------------------- éléments communs
function legs(p: Painter, x0: number, x1: number, y: number, h: number, s = PAL.ir) {
  p.rect(x0, y, 2, h, s[1]!);
  p.rect(x1, y, 2, h, s[1]!);
  p.vl(x0, y, h, s[0]!);
  p.vl(x1, y, h, s[0]!);
}
function valve(p: Painter, x: number, y: number) {
  p.rect(x, y, 3, 2, PAL.st[3]!);
  p.px(x + 1, y - 1, PAL.rd[1]!);
  p.hl(x, y - 2, 3, PAL.rd[1]!);
}
function gauge(p: Painter, x: number, y: number) {
  p.ellipse(x, y, 2, 2, PAL.st[1]!);
  p.px(x, y, PAL.rd[2]!);
  p.px(x + 1, y - 1, PAL.rd[2]!);
}
function thermometer(p: Painter, x: number, y: number, h: number) {
  p.rect(x, y, 2, h, PAL.pl[0]!);
  p.rect(x, y + Math.floor(h / 2), 2, h - Math.floor(h / 2), PAL.rd[1]!);
}

// ---------------------------------------------------------------- sprites
type Draw = (p: Painter) => void;

interface SpriteDef {
  w: number;
  h: number;
  draw: Draw;
}

const SPRITES: Partial<Record<BuildingType, SpriteDef>> = {
  // Mini-concasseur : moulin à manivelle en bois
  mill: { w: 16, h: 24, draw: (p) => {
    legs(p, 3, 11, 17, 6, PAL.wd);
    p.rect(3, 11, 10, 7, PAL.wd[1]!); p.hl(3, 11, 10, PAL.wd[0]!); p.hl(3, 17, 10, PAL.wd[3]!);
    p.rect(5, 13, 6, 3, PAL.ir[1]!); p.hl(5, 14, 6, PAL.ir[0]!); // rouleaux
    for (let i = 0; i < 6; i++) p.hl(2 + i / 2, 3 + i, 12 - i, i % 2 ? PAL.wd[1]! : PAL.wd[2]!); // trémie
    p.hl(2, 2, 12, PAL.wd[0]!);
    p.rect(4, 3, 8, 2, PAL.beer[1]!); p.px(5, 3, PAL.beer[0]!); p.px(9, 3, PAL.beer[0]!); // grains
    p.rect(13, 13, 2, 1, PAL.ir[1]!); p.vl(14, 9, 5, PAL.ir[1]!); p.rect(14, 8, 2, 2, PAL.rd[1]!); // manivelle
    p.rect(10, 18, 3, 3, PAL.st[3]!); // goulotte
    p.outline();
  } },
  mill_2: { w: 16, h: 26, draw: (p) => {
    legs(p, 3, 11, 20, 5);
    p.cylinder(2, 12, 12, 9, PAL.st); p.hl(2, 12, 12, PAL.st[0]!);
    p.rect(4, 14, 4, 4, PAL.bl[1]!); p.px(4, 14, PAL.bl[0]!); // moteur
    p.px(10, 15, PAL.gr[1]!); p.px(12, 15, PAL.rd[1]!);
    for (let i = 0; i < 7; i++) p.band(1 + i / 2, 4 + i, 14 - i, PAL.st);
    p.hl(1, 3, 14, PAL.st[0]!);
    p.outline();
  } },

  // Marmite d'empâtage : faitout inox avec thermomètre et robinet
  mash_tun_mini: { w: 16, h: 22, draw: (p) => {
    p.rect(2, 19, 12, 2, PAL.ir[1]!); // socle
    p.cylinder(2, 7, 12, 12, PAL.st);
    p.ellipse(7.5, 7, 6, 2, PAL.st[1]!); p.ellipse(7.5, 6, 5, 1, PAL.st[2]!);
    p.rect(6, 3, 3, 2, PAL.ir[1]!); // poignée du couvercle
    p.hl(0, 10, 2, PAL.ir[1]!); p.hl(14, 10, 2, PAL.ir[1]!); // anses
    p.band(2, 12, 12, PAL.st);
    thermometer(p, 4, 9, 6);
    p.rect(13, 16, 3, 2, PAL.st[3]!); p.px(15, 15, PAL.rd[1]!); // robinet
    p.outline();
  } },
  mash_tun: { w: 32, h: 44, draw: (p) => {
    legs(p, 5, 25, 36, 7);
    p.cylinder(3, 10, 26, 27, PAL.cu);
    p.ellipse(15.5, 10, 13, 4, PAL.cu[1]!); p.ellipse(15.5, 9, 10, 2, PAL.cu[0]!);
    p.rect(13, 3, 6, 4, PAL.cu[2]!); p.hl(13, 3, 6, PAL.cu[0]!); // trou d'homme
    for (const y of [16, 26, 34]) p.band(3, y, 26, PAL.cu);
    gauge(p, 22, 20);
    thermometer(p, 7, 18, 9);
    valve(p, 28, 31);
    p.outline();
  } },

  // Marmite d'ébullition sur réchaud à gaz
  kettle_mini: { w: 16, h: 24, draw: (p) => {
    p.rect(2, 18, 12, 2, PAL.ir[1]!); legs(p, 2, 12, 20, 3); // réchaud
    p.hl(3, 17, 10, PAL.ir[0]!);
    p.cylinder(2, 6, 12, 11, PAL.cu);
    p.ellipse(7.5, 6, 6, 2, PAL.cu[1]!); p.ellipse(7.5, 6, 4, 1, PAL.cu[3]!);
    p.hl(0, 9, 2, PAL.ir[1]!); p.hl(14, 9, 2, PAL.ir[1]!);
    p.band(2, 11, 12, PAL.cu);
    p.rect(13, 14, 3, 2, PAL.st[3]!); // sortie
    p.outline();
  } },
  kettle: { w: 32, h: 48, draw: (p) => {
    p.rect(4, 42, 24, 3, PAL.ir[1]!); legs(p, 5, 25, 44, 3);
    p.cylinder(3, 16, 26, 26, PAL.cu);
    for (let i = 0; i < 6; i++) p.band(3 + i * 2, 15 - i, 26 - i * 4, PAL.cu); // dôme
    p.cylinder(13, 1, 6, 9, PAL.cu); p.hl(12, 1, 8, PAL.cu[0]!); // cheminée des vapeurs
    for (const y of [22, 34]) p.band(3, y, 26, PAL.cu);
    gauge(p, 9, 27);
    valve(p, 28, 37);
    p.outline();
  } },

  // Dame-jeanne en verre avec barboteur (le liquide est dessiné par-dessus, selon son niveau)
  fermenter_mini: { w: 16, h: 24, draw: (p) => {
    p.ellipse(7.5, 16, 7, 6, PAL.gl[2]!);
    p.ellipse(6.5, 15, 5, 4, PAL.gl[1]!);
    p.rect(4, 13, 2, 4, PAL.gl[0]!); // reflet
    p.rect(5, 6, 6, 5, PAL.gl[2]!); p.rect(6, 6, 2, 5, PAL.gl[1]!); // col
    p.rect(5, 4, 6, 2, PAL.wd[2]!); // bouchon
    p.vl(7, 1, 3, PAL.pl[1]!); p.rect(6, 0, 3, 2, PAL.pl[0]!); // barboteur
    p.rect(1, 20, 14, 2, PAL.wd[1]!); p.hl(1, 20, 14, PAL.wd[0]!); // panier en osier
    p.outline();
  } },
  fermenter: { w: 32, h: 50, draw: (p) => {
    legs(p, 4, 26, 38, 11, PAL.st);
    p.vl(15, 40, 9, PAL.st[3]!);
    for (let i = 0; i < 8; i++) p.band(3 + i * 1.5, 31 + i, 26 - i * 3, PAL.st); // cône
    p.cylinder(3, 9, 26, 22, PAL.st);
    for (let i = 0; i < 5; i++) p.band(3 + i * 2, 8 - i, 26 - i * 4, PAL.st); // dôme
    for (const y of [14, 18, 22]) p.band(3, y, 26, [PAL.bl[0]!, PAL.bl[1]!, PAL.bl[1]!, PAL.bl[2]!]); // double enveloppe glycol
    gauge(p, 22, 27);
    valve(p, 14, 46);
    p.rect(9, 2, 4, 3, PAL.st[3]!); // évent
    p.outline();
  } },

  // Embouteilleuse manuelle : établi + capsuleuse
  bottler_mini: { w: 16, h: 22, draw: (p) => {
    legs(p, 1, 13, 15, 6, PAL.wd);
    p.rect(0, 13, 16, 3, PAL.wd[1]!); p.hl(0, 13, 16, PAL.wd[0]!);
    p.vl(11, 2, 11, PAL.ir[1]!); p.rect(9, 2, 6, 2, PAL.rd[1]!); p.rect(10, 6, 3, 2, PAL.ir[0]!); // capsuleuse
    p.rect(2, 9, 2, 4, PAL.beer[2]!); p.px(2, 8, PAL.beer[2]!); // bouteilles
    p.rect(5, 9, 2, 4, PAL.beer[2]!); p.px(5, 8, PAL.beer[2]!);
    p.rect(11, 9, 2, 4, PAL.gl[2]!);
    p.outline();
  } },
  bottler: { w: 32, h: 36, draw: (p) => {
    p.rect(2, 16, 28, 18, PAL.tl[1]!); p.hl(2, 16, 28, PAL.tl[0]!); p.vl(29, 16, 18, PAL.tl[2]!);
    p.rect(4, 20, 8, 6, PAL.ir[2]!); p.px(5, 21, PAL.gr[1]!); p.px(7, 21, PAL.rd[1]!); p.px(9, 21, PAL.gold); // panneau
    p.rect(15, 20, 12, 10, PAL.st[3]!);
    p.rect(3, 10, 26, 6, PAL.st[2]!); p.hl(3, 10, 26, PAL.st[0]!);
    for (let i = 0; i < 6; i++) { p.rect(5 + i * 4, 6, 2, 4, PAL.st[3]!); p.vl(5 + i * 4, 3, 3, PAL.st[2]!); } // becs
    p.rect(6, 1, 20, 2, PAL.st[3]!);
    p.outline();
  } },

  crate: { w: 16, h: 14, draw: (p) => {
    p.rect(1, 3, 14, 10, PAL.wd[1]!);
    p.hl(1, 3, 14, PAL.wd[0]!); p.hl(1, 7, 14, PAL.wd[2]!); p.hl(1, 12, 14, PAL.wd[3]!);
    p.vl(1, 3, 10, PAL.wd[2]!); p.vl(14, 3, 10, PAL.wd[3]!);
    p.rect(5, 9, 6, 2, PAL.wd[3]!); // poignée
    p.outline();
  } },
  water_tap: { w: 16, h: 22, draw: (p) => {
    p.rect(3, 0, 10, 14, PAL.st[2]!); p.hl(3, 0, 10, PAL.st[1]!); // plaque murale
    p.cylinder(6, 0, 4, 16, PAL.cu); // conduite
    p.rect(4, 6, 8, 2, PAL.rd[1]!); p.hl(4, 6, 8, PAL.rd[0]!); // volant
    p.rect(5, 16, 6, 3, PAL.st[3]!); p.hl(5, 16, 6, PAL.st[1]!); // sortie
    p.outline();
  } },
  tank: { w: 32, h: 42, draw: (p) => {
    legs(p, 5, 25, 36, 5, PAL.st);
    p.cylinder(3, 8, 26, 29, PAL.st);
    for (let i = 0; i < 4; i++) p.band(3 + i * 2, 7 - i, 26 - i * 4, PAL.st);
    for (const y of [16, 28]) p.band(3, y, 26, PAL.st);
    valve(p, 28, 33);
    p.outline();
  } },
  pump: { w: 16, h: 14, draw: (p) => {
    p.rect(2, 10, 12, 3, PAL.ir[1]!);
    p.cylinder(3, 3, 9, 7, PAL.bl); p.rect(11, 5, 3, 3, PAL.st[3]!);
    p.outline();
  } },
  stand: { w: 32, h: 36, draw: (p) => {
    p.vl(2, 8, 26, PAL.wd[2]!); p.vl(29, 8, 26, PAL.wd[2]!);
    for (let i = 0; i < 8; i++) p.rect(i * 4, 2, 4, 8, i % 2 ? PAL.pl[0]! : PAL.rd[1]!);
    for (let i = 0; i < 8; i++) p.rect(i * 4 + 1, 10, 2, 2, i % 2 ? PAL.pl[0]! : PAL.rd[1]!);
    p.rect(1, 22, 30, 12, PAL.wd[1]!); p.hl(1, 22, 30, PAL.wd[0]!); p.hl(1, 28, 30, PAL.wd[2]!);
    p.outline();
  } },
  supplier: { w: 16, h: 16, draw: (p) => {
    p.rect(1, 12, 14, 3, PAL.wd[2]!);
    p.rect(2, 4, 6, 8, PAL.pl[1]!); p.rect(8, 3, 6, 9, PAL.pl[2]!);
    p.outline();
  } },
};

/** Liaisons (tuyaux, tapis) : dessinées dynamiquement, aperçu fixe pour le magasin. */
const PREVIEWS: Partial<Record<BuildingType, SpriteDef>> = {
  conduit: { w: 16, h: 16, draw: (p) => {
    p.rect(0, 7, 16, 4, PAL.st[2]!); p.hl(0, 7, 16, PAL.st[0]!); p.hl(0, 10, 16, PAL.st[3]!);
    p.rect(0, 6, 2, 6, PAL.st[3]!); p.rect(14, 6, 2, 6, PAL.st[3]!);
    p.outline();
  } },
  conveyor: { w: 16, h: 16, draw: (p) => {
    p.rect(0, 6, 16, 4, PAL.ir[1]!); p.hl(0, 6, 16, PAL.ir[0]!);
    for (let x = 1; x < 16; x += 4) p.px(x, 7, PAL.ir[2]!);
    legs(p, 2, 12, 10, 4);
    p.outline();
  } },
  cooler: { w: 16, h: 16, draw: (p) => drawCoil(p, 0) },
  cooler_2: { w: 16, h: 16, draw: (p) => drawPlates(p) },
};

function drawCoil(p: Painter, _phase: number) {
  p.rect(0, 9, 3, 3, PAL.cu[2]!); p.rect(13, 9, 3, 3, PAL.cu[2]!);
  for (let i = 0; i < 4; i++) p.ellipse(4 + i * 2.6, 9, 2, 4, PAL.cu[(i % 2) + 1]!);
  p.outline();
}
function drawPlates(p: Painter) {
  p.rect(0, 9, 3, 3, PAL.st[3]!); p.rect(13, 9, 3, 3, PAL.st[3]!);
  p.rect(3, 3, 10, 12, PAL.st[2]!);
  for (let x = 4; x < 13; x += 2) p.vl(x, 4, 10, PAL.st[0]!);
  p.rect(3, 2, 10, 2, PAL.bl[1]!);
  p.outline();
}

// ---------------------------------------------------------------- accès
const cache = new Map<string, HTMLCanvasElement>();

/** Sprite de face d'un bâtiment (ou aperçu pour les liaisons). */
export function spriteCanvas(type: BuildingType, preview = false): HTMLCanvasElement | null {
  const def = (preview ? PREVIEWS[type] ?? SPRITES[type] : SPRITES[type]);
  if (!def) return null;
  const key = `${type}|${preview}`;
  let c = cache.get(key);
  if (!c) {
    const p = new Painter(def.w, def.h);
    def.draw(p);
    c = p.c;
    cache.set(key, c);
  }
  return c;
}

export function spriteSize(type: BuildingType): { w: number; h: number } | null {
  const def = SPRITES[type];
  return def ? { w: def.w, h: def.h } : null;
}

/** Petits éléments de décor du serpentin et de l'échangeur, posés sur le tuyau. */
export function coolerCanvas(type: 'cooler' | 'cooler_2'): HTMLCanvasElement {
  return spriteCanvas(type, true)!;
}

/** Petites icônes d'ingrédients pour l'interface (fournisseur, stock). */
export function itemCanvas(item: string): HTMLCanvasElement {
  const key = `item|${item}`;
  let c = cache.get(key);
  if (c) return c;
  const p = new Painter(12, 12);
  switch (item) {
    case 'malt':
      p.rect(2, 3, 8, 8, PAL.pl[1]!); p.rect(3, 4, 6, 6, PAL.pl[0]!); p.rect(4, 1, 4, 2, PAL.wd[2]!);
      p.px(5, 7, PAL.beer[1]!); p.px(7, 6, PAL.beer[1]!); p.px(6, 8, PAL.beer[1]!);
      break;
    case 'hops':
      p.ellipse(6, 7, 3, 4, PAL.gr[1]!); p.px(5, 5, PAL.gr[0]!); p.px(6, 8, PAL.gr[2]!); p.vl(6, 1, 2, PAL.gr[2]!);
      break;
    case 'yeast':
      p.rect(3, 2, 6, 9, PAL.pl[0]!); p.rect(3, 6, 6, 2, PAL.gold); p.hl(3, 2, 6, PAL.pl[2]!);
      break;
    case 'bottle':
      p.rect(4, 5, 4, 6, PAL.beer[2]!); p.rect(5, 2, 2, 3, PAL.beer[2]!); p.rect(5, 1, 2, 1, PAL.gold); p.rect(4, 7, 4, 2, PAL.pl[0]!);
      break;
  }
  p.outline();
  cache.set(key, p.c);
  return p.c;
}
