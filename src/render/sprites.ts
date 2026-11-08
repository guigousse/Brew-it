/**
 * Sprites des appareils, vue de face, 5 niveaux chacun : verrerie d'alchimiste, matériel de garage,
 * professionnel, industriel, puis laboratoire futuriste.
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
/** Pierre (mortier). */
const STONE = ['#f0ece4', '#d0cabe', '#aea698', '#8c8476', '#6a6256', '#48423a'] as const;
/** Coque blanche laquée du labo futuriste. */
const FUT = ['#ffffff', '#f4f8fc', '#dce6f0', '#b8c6d6', '#8a9ab0', '#5a6a82'] as const;
const NEON = '#5ef0ff';
const NEON_DIM = '#1c8ca8';

/** Support de laboratoire : socle, tige et pince (niveau 1). */
function labStand(p: Painter, x: number, base: number, h: number, clampY: number, clampW: number) {
  p.rect(x - 4, base - 2, 12, 2, P.ir[3]!); p.hl(x - 4, base - 2, 12, P.ir[1]!);
  p.rect(x, base - h, 2, h - 2, P.st[3]!); p.vl(x, base - h, h - 2, P.st[1]!);
  p.rect(x + 2, clampY, clampW, 2, P.br[2]!); p.hl(x + 2, clampY, clampW, P.br[0]!);
}

/** Bec Bunsen sous un récipient (la flamme est animée par la scène). */
function bunsen(p: Painter, cx: number, base: number) {
  p.rect(cx - 4, base - 2, 9, 2, P.ir[3]!); p.hl(cx - 4, base - 2, 9, P.ir[1]!);
  p.rect(cx - 1, base - 7, 3, 5, P.br[2]!); p.vl(cx - 1, base - 7, 5, P.br[0]!); p.vl(cx + 1, base - 7, 5, P.br[4]!);
}

/** Verre : corps elliptique avec reflets. */
function glassBall(p: Painter, cx: number, cy: number, rx: number, ry: number) {
  p.ellipse(cx, cy, rx, ry, P.gl[3]!);
  p.ellipse(cx, cy, rx - 1, ry - 1, P.gl[1]!);
  p.ellipse(cx - 1, cy - 1, rx - 3, ry - 3, P.gl[0]!);
  p.rect(cx - rx + 2, cy - 2, 1, 4, '#ffffff');
}

/** Anneau lumineux (labo futuriste). */
function neonRing(p: Painter, x: number, y: number, w: number) {
  p.hl(x, y, w, NEON_DIM);
  p.hl(x + 1, y, w - 2, NEON);
}

/** Écran noir avec courbe cyan. */
function holoScreen(p: Painter, x: number, y: number, w: number, h: number) {
  p.rect(x, y, w, h, '#0c1420');
  p.hl(x, y, w, FUT[3]!);
  for (let i = 1; i < w - 1; i++) p.px(x + i, y + 2 + Math.round((h - 4) / 2 + Math.sin(i * 0.9) * ((h - 4) / 2)), NEON);
}

// ------------------------------------------------------------------ concassage
const MILL: SpriteDef[] = [
  { w: 28, h: 30, inlet: { x: 14, y: 4 }, outlet: { x: 24, y: 26 }, draw: (p) => {
    p.legs(4, 20, 20, 10, P.wd); p.rect(2, 18, 24, 3, P.wd[2]!); p.hl(2, 18, 24, P.wd[0]!); p.hl(2, 20, 24, P.wd[4]!); // tabouret
    for (let j = 0; j < 9; j++) { const w = 20 - Math.round((j * j) / 7); for (let i = 0; i < w; i++) p.px(14 - w / 2 + i, 8 + j, p.shadeAt((i + 0.5) / w, STONE, i, j)); } // mortier
    p.rect(4, 7, 20, 2, STONE[1]!); p.hl(4, 7, 20, STONE[0]!);
    p.rect(7, 8, 14, 2, P.malt[2]!); p.px(9, 8, P.malt[0]!); p.px(15, 9, P.malt[0]!);
    for (let i = 0; i < 9; i++) p.rect(15 + i * 0.6, 0 + i, 2, 1, i < 3 ? P.wd[1]! : P.wd[2]!); // pilon
    p.rect(21, 22, 6, 6, P.wd[3]!); p.rect(22, 23, 4, 2, P.malt[3]!); // bol
    p.outline();
  } },
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
  { w: 44, h: 50, inlet: { x: 22, y: 2 }, outlet: { x: 36, y: 46 }, draw: (p) => {
    p.rect(8, 44, 28, 3, FUT[3]!); p.hl(8, 44, 28, FUT[1]!); neonRing(p, 10, 47, 24); // socle en lévitation
    p.cylinder(12, 0, 20, 12, FUT); p.dome(12, 0, 20, 3, FUT); neonRing(p, 12, 10, 20); // trémie
    p.cone(10, 12, 24, 6, FUT, 12);
    p.cylinder(6, 18, 32, 24, FUT); p.dome(6, 16, 32, 3, FUT);
    p.rect(10, 24, 18, 12, '#0c1420'); p.hl(10, 24, 18, FUT[3]!); // chambre
    p.rect(11, 29, 16, 1, '#ff3a5a'); p.hl(13, 29, 12, '#ffb0c0'); // faisceau laser
    p.px(12, 27, P.malt[2]!); p.px(18, 32, P.malt[2]!); p.px(23, 26, P.malt[1]!);
    holoScreen(p, 30, 22, 6, 6);
    neonRing(p, 6, 38, 32);
    p.rect(34, 40, 4, 6, FUT[3]!);
    p.outline();
  } },
];

// ------------------------------------------------------------------ empâtage
const MASH: SpriteDef[] = [
  { w: 30, h: 40, window: { x: 9, y: 19, w: 12, h: 9 }, inlet: { x: 15, y: 2 }, outlet: { x: 27, y: 30 }, flame: { x: 12, y: 33, w: 6, h: 4 }, steam: { x: 15, y: 2 }, draw: (p) => {
    labStand(p, 25, 40, 34, 8, 0);
    p.rect(5, 31, 20, 1, P.ir[2]!); p.vl(6, 31, 9, P.ir[3]!); p.vl(23, 31, 9, P.ir[3]!); // trépied
    bunsen(p, 15, 40);
    glassBall(p, 15, 23, 9, 8); // ballon
    p.rect(12, 4, 6, 12, P.gl[2]!); p.vl(12, 4, 12, P.gl[3]!); p.vl(17, 4, 12, P.gl[3]!); p.vl(13, 5, 10, '#ffffff'); // col
    p.rect(11, 2, 8, 2, P.wd[3]!); // bouchon
    p.rect(19, 8, 6, 2, P.br[2]!); // pince
    p.thermometer(14, 0, 6);
    p.rect(24, 29, 5, 2, P.gl[3]!);
    p.outline();
  } },
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
  { w: 50, h: 58, window: { x: 12, y: 16, w: 22, h: 28 }, inlet: { x: 23, y: 4 }, outlet: { x: 46, y: 48 }, draw: (p) => {
    p.rect(6, 52, 38, 4, FUT[3]!); p.hl(6, 52, 38, FUT[1]!); neonRing(p, 8, 56, 34);
    p.cylinder(8, 4, 30, 9, FUT); p.dome(8, 0, 30, 5, FUT); neonRing(p, 8, 12, 30); // chapeau
    p.rect(9, 13, 28, 34, P.gl[2]!); p.vl(9, 13, 34, P.gl[4]!); p.vl(36, 13, 34, P.gl[4]!); p.vl(11, 14, 30, '#ffffff'); // cuve de verre
    p.cylinder(8, 46, 30, 7, FUT); neonRing(p, 8, 46, 30);
    p.vl(23, 13, 32, FUT[4]!); for (let y = 18; y < 44; y += 6) p.hl(19, y, 9, FUT[3]!); // agitateur
    holoScreen(p, 40, 18, 8, 10); p.rect(40, 30, 8, 2, FUT[3]!);
    p.rect(44, 46, 6, 3, FUT[3]!);
    p.outline();
  } },
];

// ------------------------------------------------------------------ ébullition
const BOIL: SpriteDef[] = [
  { w: 36, h: 44, window: { x: 7, y: 22, w: 3, h: 9 }, inlet: { x: 13, y: 12 }, outlet: { x: 33, y: 34 }, flame: { x: 10, y: 37, w: 7, h: 4 }, steam: { x: 13, y: 6 }, draw: (p) => {
    p.rect(3, 34, 22, 2, P.ir[2]!); p.vl(4, 34, 10, P.ir[3]!); p.vl(23, 34, 10, P.ir[3]!); // trépied
    bunsen(p, 13, 44);
    p.cylinder(4, 18, 19, 16, P.cu); p.ellipse(13, 33, 9, 2, P.cu[4]!); // panse de l'alambic
    p.dome(4, 12, 19, 7, P.cu); // chapiteau
    p.cylinder(11, 6, 5, 7, P.cu);
    for (let i = 0; i < 16; i++) p.rect(15 + i, 6 + Math.round(i * 0.9), 2, 2, i % 3 ? P.cu[2]! : P.cu[1]!); // col de cygne
    p.cylinder(28, 22, 7, 12, P.cu); p.band(28, 26, 7, P.cu); // serpentin
    p.rect(6, 21, 5, 11, P.cu[5]!);
    p.rect(32, 33, 4, 2, P.cu[3]!);
    p.outline();
  } },
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
  { w: 48, h: 58, window: { x: 9, y: 22, w: 3, h: 22 }, inlet: { x: 24, y: 12 }, outlet: { x: 45, y: 44 }, steam: { x: 24, y: 0 }, draw: (p) => {
    p.rect(6, 52, 36, 4, FUT[3]!); p.hl(6, 52, 36, FUT[1]!);
    p.rect(8, 48, 32, 4, '#ff7a2e'); p.hl(8, 48, 32, '#ffd0a0'); for (let x = 10; x < 38; x += 4) p.vl(x, 48, 4, '#c84a10'); // bobine à induction
    p.cylinder(6, 16, 36, 32, FUT); p.dome(6, 8, 36, 9, FUT);
    p.cylinder(20, 2, 8, 8, FUT); neonRing(p, 20, 6, 8);
    neonRing(p, 6, 20, 36); neonRing(p, 6, 44, 36);
    p.rect(8, 21, 5, 24, '#0c1420');
    holoScreen(p, 22, 26, 14, 9);
    p.rect(42, 43, 6, 3, FUT[3]!);
    p.outline();
  } },
];

// ------------------------------------------------------------------ refroidissement
const COOLER: SpriteDef[] = [
  { w: 28, h: 30, inlet: { x: 4, y: 2 }, outlet: { x: 22, y: 27 }, draw: (p) => {
    labStand(p, 2, 30, 28, 10, 6);
    for (let i = 0; i < 22; i++) { // réfrigérant de Liebig, en diagonale
      const x = 6 + i * 0.7;
      const y = 3 + i;
      p.rect(x, y, 6, 1, P.gl[2]!); p.px(x, y, P.gl[4]!); p.px(x + 5, y, P.gl[4]!); p.px(x + 2, y, P.wort[2]!); p.px(x + 3, y, P.wort[3]!);
    }
    p.rect(13, 6, 4, 2, P.water[2]!); p.rect(17, 20, 4, 2, P.water[2]!); // arrivée et sortie d'eau
    p.rect(20, 26, 6, 4, P.gl[3]!); p.rect(21, 27, 4, 2, P.wort[2]!); // fiole de réception
    p.outline();
  } },
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
  { w: 34, h: 38, inlet: { x: 2, y: 8 }, outlet: { x: 31, y: 32 }, draw: (p) => {
    p.rect(3, 2, 28, 32, FUT[2]!); p.rect(4, 3, 26, 30, FUT[1]!); p.hl(3, 2, 28, FUT[0]!);
    for (let x = 6; x < 28; x += 3) { p.vl(x, 6, 22, '#a8e8ff'); p.vl(x + 1, 6, 22, '#e8fbff'); } // ailettes givrées
    p.rect(12, 12, 10, 10, '#0c1420'); // flocon
    p.vl(17, 13, 8, NEON); p.hl(13, 17, 8, NEON); p.px(14, 14, NEON); p.px(20, 14, NEON); p.px(14, 20, NEON); p.px(20, 20, NEON);
    neonRing(p, 3, 30, 28);
    p.rect(6, 34, 22, 3, FUT[3]!);
    p.rect(0, 7, 3, 3, FUT[3]!); p.rect(31, 31, 3, 3, FUT[3]!);
    p.outline();
  } },
];

// ------------------------------------------------------------------ fermentation
const FERMENTER: SpriteDef[] = [
  { w: 28, h: 36, window: { x: 8, y: 22, w: 12, h: 9 }, inlet: { x: 14, y: 8 }, outlet: { x: 25, y: 32 }, steam: { x: 14, y: 0 }, draw: (p) => {
    for (let j = 0; j < 20; j++) { // erlenmeyer
      const w = 6 + Math.round(j * 1.05);
      p.hl(14 - w / 2, 14 + j, w, P.gl[3]!);
      p.hl(14 - w / 2 + 1, 14 + j, w - 2, P.gl[1]!);
    }
    p.hl(3, 33, 22, P.gl[4]!);
    for (let j = 0; j < 16; j++) p.vl(9 + Math.round(j * 0.15), 16 + j, 1, '#ffffff');
    p.rect(11, 6, 6, 9, P.gl[2]!); p.vl(11, 6, 9, P.gl[4]!); p.vl(16, 6, 9, P.gl[4]!); // col
    p.rect(10, 5, 8, 2, P.wd[3]!); // bouchon
    p.rect(13, 0, 3, 5, P.gl[2]!); p.rect(12, 0, 5, 2, P.gl[1]!); // barboteur
    p.rect(24, 31, 4, 2, P.gl[3]!);
    p.outline();
  } },
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
    p.panel(30, 34, 8, 5); // petit écran, posé sur la cuve
    p.rect(21, 55, 5, 3, P.st[3]!); p.valveWheel(23, 59);
    p.outline();
  } },
  { w: 37, h: 66, window: { x: 11, y: 14, w: 20, h: 26 }, inlet: { x: 21, y: 4 }, outlet: { x: 21, y: 63 }, steam: { x: 34, y: 0 }, draw: (p) => {
    p.rect(8, 60, 28, 4, FUT[3]!); p.hl(8, 60, 28, FUT[1]!); neonRing(p, 10, 64, 24);
    p.cylinder(7, 4, 28, 8, FUT); p.dome(7, 0, 28, 5, FUT); neonRing(p, 7, 11, 28);
    p.rect(8, 12, 26, 30, P.gl[2]!); p.vl(8, 12, 30, P.gl[4]!); p.vl(33, 12, 30, P.gl[4]!); p.vl(10, 13, 28, '#ffffff');
    p.cone(7, 42, 28, 14, FUT, 8); neonRing(p, 7, 42, 28);
    p.rect(33, 0, 3, 4, NEON_DIM);
    holoScreen(p, 26, 31, 6, 7); // petit écran, sur la vitre de la cuve
    p.rect(19, 56, 5, 5, FUT[3]!);
    p.outline();
  } },
];

// ------------------------------------------------------------------ garde
const CONDITIONING: SpriteDef[] = [
  { w: 22, h: 30, window: { x: 5, y: 11, w: 12, h: 14 }, inlet: { x: 11, y: 4 }, outlet: { x: 19, y: 26 }, draw: (p) => {
    p.rect(3, 9, 16, 19, P.gl[3]!); p.rect(4, 10, 14, 17, P.gl[1]!); p.vl(5, 11, 14, '#ffffff'); // bocal
    p.rect(5, 7, 12, 3, P.gl[3]!);
    p.rect(4, 4, 14, 3, '#f0e0c0'); p.hl(4, 4, 14, '#ffffff'); p.rect(4, 6, 14, 1, P.rd[3]!); // couvercle et joint
    p.vl(3, 5, 6, P.st[3]!); p.vl(18, 5, 6, P.st[3]!); p.hl(3, 3, 16, P.st[3]!); // étrier
    p.rect(1, 27, 20, 3, P.wd[2]!); p.hl(1, 27, 20, P.wd[0]!);
    p.rect(18, 25, 3, 2, P.st[3]!);
    p.outline();
  } },
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
    p.rect(29, 31, 8, 8, P.st[3]!); p.hl(29, 31, 8, P.st[1]!); // groupe froid, plus discret, sur la cuve
    for (let y = 33; y < 38; y += 2) p.hl(30, y, 6, P.st[4]!);
    p.px(35, 32, P.bl[1]!);
    p.gauge(22, 22);
    p.outline();
  } },
  { w: 44, h: 56, window: { x: 12, y: 14, w: 16, h: 28 }, inlet: { x: 20, y: 4 }, outlet: { x: 41, y: 46 }, draw: (p) => {
    p.rect(6, 50, 30, 4, FUT[3]!); p.hl(6, 50, 30, FUT[1]!); neonRing(p, 8, 54, 26);
    for (let j = 0; j < 46; j++) { // capsule
      const k = Math.min(1, Math.min(j, 45 - j) / 8);
      const w = Math.round(14 + 18 * Math.sqrt(k));
      for (let i = 0; i < w; i++) p.px(20 - w / 2 + i, 4 + j, p.shadeAt((i + 0.5) / w, FUT, i, j));
    }
    p.rect(11, 13, 18, 30, '#1c3c6a'); p.rect(12, 14, 16, 28, '#4a7cc8'); p.vl(13, 15, 26, '#a8d8ff'); // hublot de stase
    neonRing(p, 8, 12, 24); neonRing(p, 8, 44, 24);
    p.rect(28, 30, 6, 9, FUT[2]!); p.hl(28, 30, 6, FUT[0]!); for (let y = 32; y < 38; y += 2) p.hl(29, y, 4, NEON_DIM); // panneau discret, sur la capsule
    p.rect(39, 45, 5, 3, FUT[3]!);
    p.outline();
  } },
];

// ------------------------------------------------------------------ embouteillage (sprite = machine, la scène dessine les bouteilles)
const BOTTLING: SpriteDef[] = [
  { w: 40, h: 34, inlet: { x: 12, y: 2 }, outlet: { x: 38, y: 28 }, draw: (p) => {
    p.rect(0, 30, 40, 3, P.wd[2]!); p.hl(0, 30, 40, P.wd[0]!);
    labStand(p, 4, 30, 30, 8, 10);
    for (let j = 0; j < 7; j++) p.hl(9 + j, 4 + j, 14 - j * 2, j < 2 ? P.gl[1]! : P.gl[2]!); // entonnoir
    p.rect(15, 11, 2, 5, P.gl[3]!);
    p.rect(12, 17, 8, 13, '#5a3a20'); p.rect(14, 14, 4, 4, '#5a3a20'); p.vl(13, 18, 10, '#8a5a30'); // bouteille
    p.rect(26, 6, 3, 20, P.gl[2]!); p.vl(26, 6, 20, '#ffffff'); p.rect(25, 2, 5, 5, P.rd[2]!); // pipette et poire
    p.rect(32, 22, 6, 8, P.wd[3]!); // capsules
    for (let x = 33; x < 38; x += 2) p.px(x, 23, P.br[1]!);
    p.outline();
  } },
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
  { w: 120, h: 44, inlet: { x: 10, y: 3 }, outlet: { x: 118, y: 32 }, draw: (p) => {
    p.rect(0, 30, 120, 4, FUT[3]!); p.hl(0, 30, 120, FUT[1]!); neonRing(p, 2, 34, 116);
    p.cylinder(2, 4, 12, 16, FUT); neonRing(p, 2, 10, 12);
    for (const ax of [26, 56, 86]) { // bras robotisés
      p.rect(ax - 4, 0, 10, 4, FUT[2]!); p.hl(ax - 4, 0, 10, FUT[0]!);
      for (let i = 0; i < 10; i++) p.rect(ax + Math.round(Math.sin(i / 3) * 3), 4 + i, 3, 1, FUT[2]!);
      p.rect(ax - 2, 14, 7, 3, FUT[4]!); p.px(ax + 1, 17, NEON); p.px(ax + 1, 18, NEON);
      p.rect(ax - 3, 22, 9, 8, '#0c1420'); p.hl(ax - 3, 22, 9, NEON_DIM);
    }
    holoScreen(p, 100, 6, 16, 12);
    p.outline();
  } },
];

export const SPRITES: Record<StationId, SpriteDef[]> = {
  mill: MILL, mash: MASH, boil: BOIL, cooler: COOLER, fermenter: FERMENTER, conditioning: CONDITIONING, bottling: BOTTLING,
};

const cache = new Map<string, HTMLCanvasElement>();
/** Vide le cache : iOS peut effacer les canvas hors écran quand l'app reste longtemps en arrière-plan. */
export function clearSpriteCache(): void {
  cache.clear();
}
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
