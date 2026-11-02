/**
 * Sprites des appareils, vue de face, 3 niveaux chacun : du matériel de garage à l'équipement industriel.
 * Chaque sprite décrit aussi ses points d'accroche (entrée, sortie, hublot de niveau, brûleur, vapeur).
 */
import type { StationId } from '../core/stations';
import { Painter, PAL } from './painter';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }

export interface SpriteDef {
  w: number;
  h: number;
  draw: (p: Painter) => void;
  /** Hublot où l'on voit le liquide. */
  window?: Rect;
  inlet: Pt;
  outlet: Pt;
  flame?: Rect;
  steam?: Pt;
}

const P = PAL;

// ------------------------------------------------------------------ concassage
const MILL: SpriteDef[] = [
  { w: 30, h: 38, inlet: { x: 15, y: 2 }, outlet: { x: 25, y: 33 }, draw: (p) => {
    p.legs(3, 24, 22, 15, P.wd);
    p.rect(1, 20, 28, 3, P.wd[2]!); p.hl(1, 20, 28, P.wd[0]!); p.hl(1, 22, 28, P.wd[4]!); // plateau
    for (let i = 0; i < 9; i++) p.rect(5 + i / 2, 3 + i, 20 - i, 1, i % 2 ? P.wd[2]! : P.wd[3]!); // trémie
    p.rect(4, 2, 22, 2, P.wd[1]!);
    p.rect(7, 3, 16, 3, P.malt[2]!); p.px(9, 3, P.malt[0]!); p.px(14, 4, P.malt[0]!); p.px(19, 3, P.malt[0]!);
    p.cylinder(9, 12, 12, 8, P.st); // corps du moulin
    p.rect(21, 14, 4, 2, P.ir[2]!); p.vl(24, 9, 6, P.ir[2]!); p.rect(23, 7, 3, 3, P.rd[2]!); p.px(23, 7, P.rd[0]!); // manivelle
    p.cylinder(20, 27, 9, 9, P.pl); p.hl(20, 27, 9, P.pl[0]!); p.rect(21, 28, 7, 2, P.malt[3]!); // seau
    p.outline();
  } },
  { w: 36, h: 42, inlet: { x: 18, y: 2 }, outlet: { x: 30, y: 38 }, draw: (p) => {
    p.legs(5, 28, 27, 14);
    for (let i = 0; i < 10; i++) p.rect(4 + i / 2, 2 + i, 28 - i, 1, p.shadeAt(0.5, P.st, 0, i)); // trémie inox
    for (let i = 0; i < 10; i++) for (let x = 0; x < 28 - i; x++) p.px(4 + i / 2 + x, 2 + i, p.shadeAt((x + 0.5) / (28 - i), P.st, x, i));
    p.rect(9, 3, 18, 2, P.malt[2]!);
    p.cylinder(6, 12, 24, 15, P.st); p.band(6, 12, 24, P.st); p.rivets(6, 25, 24, 3, P.st);
    p.rect(9, 16, 8, 6, P.ir[3]!); p.rect(10, 17, 6, 1, P.ir[1]!); // rouleaux
    p.cylinder(22, 15, 10, 8, P.bl); p.hl(22, 15, 10, P.bl[0]!); p.rect(32, 17, 2, 4, P.ir[2]!); // moteur
    p.rect(28, 30, 4, 8, P.st[3]!); p.vl(28, 30, 8, P.st[1]!); // goulotte
    p.outline();
  } },
  { w: 44, h: 50, inlet: { x: 22, y: 2 }, outlet: { x: 37, y: 46 }, draw: (p) => {
    p.legs(6, 35, 36, 13);
    p.cylinder(10, 0, 24, 10, P.st); p.dome(10, 0, 24, 3, P.st); p.rivets(10, 8, 24, 4, P.st); // silo
    p.cone(8, 10, 28, 10, P.st, 10);
    p.cylinder(5, 20, 34, 17, P.st); p.band(5, 20, 34, P.st); p.band(5, 34, 34, P.st);
    p.panel(8, 24, 10, 8);
    p.cylinder(22, 23, 14, 9, P.bl); p.hl(22, 23, 14, P.bl[0]!); p.rect(36, 25, 3, 5, P.ir[2]!);
    p.rect(35, 37, 5, 9, P.st[3]!); p.vl(35, 37, 9, P.st[1]!);
    p.outline();
  } },
];

// ------------------------------------------------------------------ empâtage
const MASH: SpriteDef[] = [
  { w: 34, h: 34, window: { x: 5, y: 12, w: 3, h: 14 }, inlet: { x: 17, y: 4 }, outlet: { x: 31, y: 28 }, draw: (p) => {
    p.rect(2, 8, 30, 24, P.bl[2]!); p.rect(3, 9, 28, 22, P.bl[1]!); p.rect(3, 9, 6, 22, P.bl[0]!); p.rect(27, 9, 4, 22, P.bl[3]!); // glacière
    p.rect(1, 4, 32, 5, P.pl[1]!); p.hl(1, 4, 32, P.pl[0]!); p.hl(1, 8, 32, P.pl[3]!); // couvercle
    p.rect(13, 2, 8, 2, P.pl[3]!);
    p.rect(4, 11, 5, 16, P.pl[2]!); // hublot (rempli par la scène)
    p.thermometer(22, 12, 9);
    p.rect(31, 26, 3, 3, P.st[3]!); p.px(33, 25, P.rd[2]!); // robinet
    p.outline();
  } },
  { w: 44, h: 48, window: { x: 8, y: 16, w: 3, h: 17 }, inlet: { x: 22, y: 3 }, outlet: { x: 41, y: 38 }, draw: (p) => {
    p.legs(6, 35, 39, 9);
    p.cylinder(3, 10, 38, 30, P.st); p.dome(3, 3, 38, 8, P.st);
    p.band(3, 14, 38, P.st); p.band(3, 36, 38, P.st);
    p.rect(19, 1, 6, 3, P.st[3]!); p.hl(19, 1, 6, P.st[1]!);
    p.rect(7, 15, 5, 19, P.st[4]!);
    p.thermometer(30, 18, 10); p.gauge(17, 22);
    p.rect(14, 40, 16, 4, P.ir[3]!); p.hl(14, 40, 16, P.ir[1]!); p.px(16, 42, P.rd[2]!); // résistance
    p.rect(40, 37, 4, 3, P.st[3]!); p.valveWheel(42, 35);
    p.outline();
  } },
  { w: 52, h: 58, window: { x: 9, y: 20, w: 3, h: 22 }, inlet: { x: 26, y: 8 }, outlet: { x: 49, y: 46 }, draw: (p) => {
    p.legs(7, 42, 48, 9);
    p.cylinder(3, 16, 46, 33, P.cu); p.dome(3, 7, 46, 10, P.cu);
    for (const y of [20, 32, 44]) p.band(3, y, 46, P.cu);
    p.rivets(3, 26, 46, 4, P.cu);
    p.cylinder(20, 0, 12, 7, P.bl); p.hl(20, 0, 12, P.bl[0]!); p.vl(26, 7, 3, P.st[3]!); // moteur d'agitateur
    p.rect(8, 19, 5, 24, P.cu[5]!);
    p.gauge(36, 28); p.gauge(36, 38); p.panel(18, 35, 12, 9);
    p.rect(49, 45, 3, 3, P.st[3]!); p.valveWheel(50, 43);
    p.outline();
  } },
];

// ------------------------------------------------------------------ ébullition
const BOIL: SpriteDef[] = [
  { w: 34, h: 40, window: { x: 6, y: 12, w: 3, h: 12 }, inlet: { x: 17, y: 5 }, outlet: { x: 31, y: 24 }, flame: { x: 9, y: 33, w: 16, h: 4 }, steam: { x: 17, y: 5 }, draw: (p) => {
    p.rect(4, 31, 26, 3, P.ir[2]!); p.hl(4, 31, 26, P.ir[0]!); p.legs(5, 26, 33, 6); // réchaud
    p.cylinder(3, 8, 28, 22, P.st);
    p.ellipse(16, 8, 14, 3, P.st[2]!); p.ellipse(16, 8, 11, 2, P.st[4]!);
    p.hl(0, 12, 3, P.ir[2]!); p.hl(31, 12, 3, P.ir[2]!); // anses
    p.band(3, 18, 28, P.st);
    p.rect(5, 11, 5, 14, P.st[4]!);
    p.rect(31, 23, 3, 3, P.st[3]!);
    p.outline();
  } },
  { w: 42, h: 50, window: { x: 7, y: 18, w: 3, h: 16 }, inlet: { x: 21, y: 10 }, outlet: { x: 39, y: 34 }, flame: { x: 10, y: 43, w: 22, h: 4 }, steam: { x: 21, y: 0 }, draw: (p) => {
    p.rect(4, 41, 34, 3, P.ir[2]!); p.hl(4, 41, 34, P.ir[0]!); p.legs(5, 33, 43, 6);
    p.cylinder(3, 14, 36, 27, P.st); p.dome(3, 8, 36, 7, P.st);
    p.cylinder(18, 0, 7, 9, P.st); p.hl(17, 0, 9, P.st[1]!); // cheminée
    p.band(3, 18, 36, P.st); p.band(3, 36, 36, P.st);
    p.rect(6, 17, 5, 18, P.st[4]!);
    p.gauge(28, 24);
    p.rect(38, 33, 4, 3, P.st[3]!); p.valveWheel(40, 31);
    p.outline();
  } },
  { w: 50, h: 60, window: { x: 8, y: 26, w: 3, h: 20 }, inlet: { x: 25, y: 18 }, outlet: { x: 47, y: 44 }, flame: { x: 10, y: 53, w: 30, h: 4 }, steam: { x: 25, y: 0 }, draw: (p) => {
    p.rect(4, 51, 42, 3, P.ir[2]!); p.hl(4, 51, 42, P.ir[0]!); p.legs(6, 40, 53, 6);
    p.cylinder(3, 22, 44, 30, P.cu); p.dome(3, 12, 44, 11, P.cu);
    p.cylinder(21, 0, 9, 13, P.cu); p.hl(19, 0, 13, P.cu[0]!); p.hl(19, 1, 13, P.cu[4]!); // cheminée
    for (const y of [26, 38, 48]) p.band(3, y, 44, P.cu);
    p.rect(7, 25, 5, 22, P.cu[5]!);
    p.rect(36, 16, 10, 3, P.st[3]!); p.vl(45, 16, 12, P.st[3]!); // vapeur
    p.panel(22, 33, 12, 9); p.gauge(16, 31);
    p.rect(47, 43, 3, 3, P.st[3]!); p.valveWheel(48, 41);
    p.outline();
  } },
];

// ------------------------------------------------------------------ refroidissement
const COOLER: SpriteDef[] = [
  { w: 28, h: 26, inlet: { x: 3, y: 6 }, outlet: { x: 25, y: 21 }, draw: (p) => {
    p.cylinder(2, 6, 24, 18, P.pl); p.ellipse(14, 6, 12, 2, P.water[1]!); // seau d'eau froide
    for (let i = 0; i < 4; i++) p.ellipse(14, 10 + i * 3, 8, 1, P.cu[i % 2 ? 2 : 3]!); // serpentin
    p.rect(1, 4, 3, 3, P.cu[3]!); p.rect(24, 20, 4, 3, P.cu[3]!);
    p.outline();
  } },
  { w: 30, h: 30, inlet: { x: 3, y: 8 }, outlet: { x: 27, y: 24 }, draw: (p) => {
    p.rect(4, 4, 22, 24, P.bl[3]!); p.rect(5, 5, 20, 22, P.st[2]!);
    for (let x = 6; x < 24; x += 2) p.vl(x, 6, 20, P.st[0]!);
    p.rect(4, 3, 22, 3, P.bl[2]!); p.hl(4, 3, 22, P.bl[0]!);
    p.rect(0, 7, 4, 3, P.st[3]!); p.rect(26, 23, 4, 3, P.st[3]!);
    p.outline();
  } },
  { w: 32, h: 36, inlet: { x: 2, y: 8 }, outlet: { x: 29, y: 30 }, draw: (p) => {
    for (const ox of [3, 17]) {
      p.rect(ox, 4, 12, 26, P.bl[3]!); p.rect(ox + 1, 5, 10, 24, P.st[2]!);
      for (let x = ox + 2; x < ox + 11; x += 2) p.vl(x, 6, 22, P.st[0]!);
      p.rect(ox, 3, 12, 3, P.bl[2]!);
    }
    p.rect(13, 12, 6, 3, P.bl[3]!); p.rect(13, 22, 6, 3, P.bl[3]!);
    p.panel(10, 31, 12, 5);
    p.rect(0, 7, 3, 3, P.st[3]!); p.rect(29, 29, 3, 3, P.st[3]!);
    p.outline();
  } },
];

// ------------------------------------------------------------------ fermentation
const FERMENTER: SpriteDef[] = [
  { w: 30, h: 34, window: { x: 5, y: 12, w: 3, h: 16 }, inlet: { x: 15, y: 5 }, outlet: { x: 27, y: 28 }, steam: { x: 15, y: 0 }, draw: (p) => {
    p.cylinder(3, 8, 24, 25, P.pl); p.rect(2, 6, 26, 3, P.pl[1]!); p.hl(2, 6, 26, P.pl[0]!);
    p.band(3, 18, 24, P.pl);
    p.rect(14, 1, 3, 5, P.gl[2]!); p.rect(13, 0, 5, 2, P.gl[1]!); // barboteur
    p.rect(4, 11, 5, 18, P.pl[3]!);
    p.rect(27, 27, 3, 3, P.st[3]!);
    p.outline();
  } },
  { w: 38, h: 56, window: { x: 7, y: 14, w: 3, h: 18 }, inlet: { x: 19, y: 4 }, outlet: { x: 19, y: 53 }, steam: { x: 26, y: 0 }, draw: (p) => {
    p.legs(4, 31, 38, 17, P.st);
    p.cylinder(3, 8, 32, 26, P.st); p.dome(3, 3, 32, 6, P.st);
    p.cone(3, 34, 32, 12, P.st, 6);
    p.band(3, 12, 32, P.st); p.band(3, 30, 32, P.st);
    p.rect(25, 0, 3, 4, P.gl[2]!);
    p.rect(6, 13, 5, 20, P.st[4]!);
    p.gauge(26, 22);
    p.rect(17, 46, 5, 3, P.st[3]!); p.valveWheel(19, 50);
    p.outline();
  } },
  { w: 46, h: 66, window: { x: 8, y: 16, w: 3, h: 22 }, inlet: { x: 23, y: 4 }, outlet: { x: 23, y: 63 }, steam: { x: 32, y: 0 }, draw: (p) => {
    p.legs(5, 38, 46, 19, P.st);
    p.cylinder(3, 9, 40, 32, P.st); p.dome(3, 3, 40, 7, P.st);
    p.cone(3, 41, 40, 14, P.st, 8);
    for (const y of [14, 20, 26, 32]) { p.band(3, y, 40, P.bl); }
    p.rect(31, 0, 3, 4, P.gl[2]!);
    p.rect(7, 15, 5, 24, P.st[4]!);
    p.panel(28, 35, 12, 8);
    p.rect(21, 55, 5, 3, P.st[3]!); p.valveWheel(23, 59);
    p.outline();
  } },
];

// ------------------------------------------------------------------ garde
const CONDITIONING: SpriteDef[] = [
  { w: 26, h: 34, window: { x: 6, y: 14, w: 14, h: 12 }, inlet: { x: 13, y: 4 }, outlet: { x: 23, y: 28 }, draw: (p) => {
    p.ellipse(13, 21, 11, 10, P.gl[3]!); p.ellipse(12, 20, 9, 8, P.gl[2]!); p.rect(6, 15, 3, 8, P.gl[0]!);
    p.rect(9, 5, 8, 6, P.gl[3]!); p.rect(10, 5, 3, 6, P.gl[1]!);
    p.rect(9, 3, 8, 2, P.wd[3]!);
    p.rect(2, 27, 22, 5, P.wd[2]!); for (let x = 3; x < 24; x += 3) p.vl(x, 27, 5, P.wd[4]!); // osier
    p.rect(23, 27, 3, 3, P.st[3]!);
    p.outline();
  } },
  { w: 36, h: 50, window: { x: 6, y: 14, w: 3, h: 20 }, inlet: { x: 18, y: 4 }, outlet: { x: 33, y: 40 }, draw: (p) => {
    p.legs(5, 28, 42, 7, P.st);
    p.cylinder(3, 8, 30, 35, P.st); p.dome(3, 3, 30, 6, P.st);
    for (const y of [12, 24, 36]) p.band(3, y, 30, P.st);
    p.rect(5, 13, 5, 22, P.st[4]!);
    p.gauge(24, 20); p.thermometer(23, 27, 8);
    p.rect(33, 39, 3, 3, P.st[3]!);
    p.outline();
  } },
  { w: 44, h: 56, window: { x: 8, y: 16, w: 3, h: 22 }, inlet: { x: 20, y: 4 }, outlet: { x: 41, y: 44 }, draw: (p) => {
    p.legs(6, 34, 48, 7, P.st);
    p.cylinder(3, 9, 36, 40, P.pl); p.dome(3, 3, 36, 7, P.pl); // isolation blanche
    for (const y of [14, 28, 42]) p.band(3, y, 36, P.st);
    p.rect(7, 15, 5, 24, P.st[4]!);
    p.rect(30, 30, 14, 12, P.st[3]!); p.hl(30, 30, 14, P.st[1]!); // groupe froid
    for (let y = 32; y < 41; y += 2) p.hl(32, y, 10, P.st[4]!);
    p.px(41, 31, P.bl[1]!);
    p.gauge(22, 22);
    p.outline();
  } },
];

// ------------------------------------------------------------------ embouteillage (sprite = machine, la scène dessine les bouteilles)
const BOTTLING: SpriteDef[] = [
  { w: 60, h: 32, inlet: { x: 10, y: 4 }, outlet: { x: 58, y: 22 }, draw: (p) => {
    p.legs(3, 52, 20, 11, P.wd);
    p.rect(0, 18, 60, 3, P.wd[2]!); p.hl(0, 18, 60, P.wd[0]!); p.hl(0, 20, 60, P.wd[4]!);
    p.cylinder(3, 4, 14, 14, P.pl); p.rect(3, 3, 14, 2, P.pl[1]!); // seau d'embouteillage
    p.rect(16, 13, 10, 1, P.pl[3]!); p.vl(25, 9, 5, P.st[3]!); // tuyau + canne
    p.vl(40, 5, 13, P.ir[2]!); p.rect(36, 4, 10, 3, P.rd[2]!); p.rect(38, 9, 5, 3, P.ir[1]!); // capsuleuse
    p.outline();
  } },
  { w: 80, h: 38, inlet: { x: 10, y: 3 }, outlet: { x: 78, y: 28 }, draw: (p) => {
    p.legs(4, 72, 28, 9);
    p.rect(0, 25, 80, 4, P.ir[2]!); p.hl(0, 25, 80, P.ir[0]!); // convoyeur
    p.rect(14, 2, 40, 14, P.st[2]!); p.hl(14, 2, 40, P.st[0]!); p.vl(53, 2, 14, P.st[4]!);
    for (let i = 0; i < 4; i++) { p.rect(18 + i * 9, 16, 3, 4, P.st[3]!); p.px(19 + i * 9, 20, P.st[4]!); } // 4 becs
    p.cylinder(2, 4, 10, 12, P.st); // réservoir
    p.panel(58, 6, 12, 10);
    p.outline();
  } },
  { w: 120, h: 42, inlet: { x: 10, y: 3 }, outlet: { x: 118, y: 31 }, draw: (p) => {
    p.legs(4, 112, 32, 9);
    p.rect(0, 29, 120, 4, P.ir[2]!); p.hl(0, 29, 120, P.ir[0]!);
    p.cylinder(2, 2, 12, 16, P.st);
    p.rect(18, 4, 34, 16, P.tl[2]!); p.hl(18, 4, 34, P.tl[0]!); p.vl(51, 4, 16, P.tl[4]!); // remplisseuse
    p.ellipse(35, 12, 10, 4, P.st[2]!); for (let i = 0; i < 6; i++) p.rect(24 + i * 4, 20, 2, 4, P.st[3]!);
    p.rect(58, 6, 18, 14, P.st[2]!); p.hl(58, 6, 18, P.st[0]!); p.rect(63, 20, 8, 4, P.rd[2]!); // capsuleuse
    p.rect(82, 8, 16, 12, P.br[2]!); p.hl(82, 8, 16, P.br[0]!); p.rect(85, 12, 10, 4, P.pl[0]!); // étiqueteuse
    p.panel(102, 6, 14, 12);
    p.outline();
  } },
];

export const SPRITES: Record<StationId, SpriteDef[]> = {
  mill: MILL, mash: MASH, boil: BOIL, cooler: COOLER, fermenter: FERMENTER, conditioning: CONDITIONING, bottling: BOTTLING,
};

const cache = new Map<string, HTMLCanvasElement>();
export function stationCanvas(id: StationId, level: number): HTMLCanvasElement {
  const key = `${id}|${level}`;
  let c = cache.get(key);
  if (!c) {
    const def = SPRITES[id][level - 1]!;
    const p = new Painter(def.w, def.h);
    def.draw(p);
    c = p.c;
    cache.set(key, c);
  }
  return c;
}
