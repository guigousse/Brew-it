import type { PartnerId } from '../core/partners';

/**
 * Scènes des partenaires, en pixel art (40 × 40 px natifs, affichées ×2 dans un cadre) : un petit tableau par
 * partenaire, du terrain de rugby du village au podium des Jeux mondiaux.
 */
export const SCENE_SIZE = 40;

const C = {
  ink: '#1b1424', white: '#f6ecd6', grey: '#bcaecb', steel: '#6c7a8c', gold: '#f2c14e', goldDark: '#a8742a', goldLight: '#fff4b0',
  grass: '#4aa046', grassDark: '#2c7a3a', grassLight: '#7ee081', sky: '#8cd0ff', skyDeep: '#4e8fd8', night: '#1e1a3a', night2: '#2c2452',
  red: '#e8553a', redDark: '#a8302a', brown: '#8a4a1c', brownLight: '#c8803a', purple: '#6a3aa0', orange: '#f0884a', pink: '#d45c8e',
  silver: '#c4ccd8', bronze: '#c07a3e', beer: '#e8a830', foam: '#fff8e0', blue: '#3f6ad4', wood: '#6e4a2a',
};

type Painter = {
  px: (x: number, y: number, c: string) => void;
  rect: (x: number, y: number, w: number, h: number, c: string) => void;
  hline: (x0: number, x1: number, y: number, c: string) => void;
  vline: (x: number, y0: number, y1: number, c: string) => void;
  disc: (cx: number, cy: number, r: number, c: string) => void;
};

function painter(g: CanvasRenderingContext2D): Painter {
  const px = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= SCENE_SIZE || y >= SCENE_SIZE) return;
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  return {
    px, rect,
    hline: (x0, x1, y, c) => rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c),
    vline: (x, y0, y1, c) => rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c),
    disc: (cx, cy, r, c) => {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) px(cx + x, cy + y, c);
    },
  };
}

/** Un ciel en bandes, du haut vers l'horizon. */
function sky(p: Painter, bands: string[], until: number) {
  const h = Math.ceil(until / bands.length);
  bands.forEach((c, i) => p.rect(0, i * h, SCENE_SIZE, Math.min(h, until - i * h), c));
}

/** Une pelouse rayée. */
function lawn(p: Painter, y: number) {
  for (let i = y; i < SCENE_SIZE; i++) p.hline(0, SCENE_SIZE - 1, i, Math.floor((i - y) / 2) % 2 ? C.grass : C.grassDark);
}

/** Une foule : des têtes de toutes les couleurs. */
function crowd(p: Painter, y: number, rows: number, colors: string[], seed = 3) {
  let n = seed;
  for (let r = 0; r < rows; r++) {
    for (let x = (r % 2) * 1; x < SCENE_SIZE; x += 2) {
      n = (n * 1103515245 + 12345) >>> 0;
      p.px(x, y + r, colors[n % colors.length]!);
    }
  }
}

const SCENES: Record<PartnerId, (p: Painter) => void> = {
  // le club de rugby du village : poteaux en H, ballon ovale, petite tribune et drapeaux
  rugby: (p) => {
    sky(p, [C.skyDeep, C.sky, C.sky, '#b8e4ff'], 26);
    p.disc(32, 6, 3, C.goldLight);
    // la petite tribune en bois au fond
    p.rect(0, 20, 40, 6, C.wood);
    crowd(p, 21, 3, [C.red, C.white, C.blue, C.gold, C.pink]);
    p.hline(0, 39, 20, C.ink);
    lawn(p, 26);
    // les poteaux en H
    for (const x of [9, 22]) {
      p.vline(x, 4, 33, C.white);
      p.vline(x + 1, 4, 33, C.grey);
    }
    p.hline(9, 23, 18, C.white);
    p.hline(9, 23, 19, C.grey);
    // les fanions en haut des poteaux
    p.rect(11, 4, 3, 2, C.red);
    p.rect(24, 4, 3, 2, C.red);
    // le ballon ovale, lacets blancs
    for (let y = -3; y <= 3; y++) {
      const w = Math.round(5 * Math.sqrt(Math.max(0, 1 - (y / 3.6) ** 2)));
      p.hline(31 - w, 31 + w, 32 + y, y > 1 ? C.brown : C.brownLight);
    }
    p.hline(29, 33, 31, C.white);
    for (const x of [29, 31, 33]) p.px(x, 30, C.white);
  },
  // le festival rock : la scène, les projecteurs, la foule et une guitare au premier plan
  rock: (p) => {
    sky(p, [C.night, C.night, C.night2, C.purple], 28);
    for (const [x, y] of [[4, 3], [14, 6], [30, 2], [36, 8], [24, 5]]) p.px(x!, y!, C.white);
    // faisceaux des projecteurs
    for (let i = 0; i < 18; i++) {
      p.px(6 + i * 0.6, 4 + i, '#f2c14e55');
      p.px(34 - i * 0.6, 4 + i, '#7ee08155');
    }
    p.rect(5, 2, 3, 2, C.gold);
    p.rect(32, 2, 3, 2, C.grassLight);
    // la scène et ses enceintes
    p.rect(4, 18, 32, 8, C.ink);
    p.rect(6, 19, 28, 6, '#2a2040');
    p.rect(2, 14, 5, 12, C.steel);
    p.rect(33, 14, 5, 12, C.steel);
    for (const x of [4, 35]) {
      p.disc(x, 17, 1, C.ink);
      p.disc(x, 22, 1, C.ink);
    }
    // le chanteur au micro
    p.rect(19, 15, 2, 4, C.red);
    p.disc(20, 13, 1, C.brownLight);
    p.vline(23, 14, 18, C.grey);
    // la foule, bras levés
    crowd(p, 28, 5, [C.ink, C.night2, C.purple, C.pink, C.ink]);
    for (const x of [6, 13, 27, 33]) p.vline(x, 25, 27, C.brownLight);
    // la guitare au premier plan
    p.disc(31, 35, 3, C.red);
    p.disc(29, 37, 2, C.red);
    p.px(31, 35, C.ink);
    for (let i = 0; i < 7; i++) p.px(33 + i * 0.5, 33 - i, C.brown);
  },
  // le club de foot : la pelouse, le rond central, le but et le ballon, la tribune
  foot: (p) => {
    sky(p, [C.skyDeep, C.sky, C.sky], 12);
    p.rect(0, 8, 40, 6, C.steel);
    crowd(p, 9, 4, [C.blue, C.white, C.blue, C.red, C.gold], 7);
    p.hline(0, 39, 13, C.ink);
    lawn(p, 14);
    // les lignes : ligne médiane et rond central
    p.vline(20, 14, 39, C.white);
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      p.px(20 + Math.cos(t) * 8, 27 + Math.sin(t) * 5, C.white);
    }
    // le but à droite
    p.rect(33, 21, 7, 11, '#ffffff33');
    p.vline(33, 21, 32, C.white);
    p.hline(33, 39, 21, C.white);
    for (let y = 23; y < 32; y += 2) p.hline(34, 39, y, '#ffffff66');
    // le ballon
    p.disc(14, 31, 3, C.white);
    p.px(14, 31, C.ink);
    p.px(13, 30, C.ink);
    p.px(15, 32, C.ink);
    p.px(12, 32, C.ink);
    p.px(16, 30, C.ink);
    p.hline(12, 16, 35, C.grassDark);
  },
  // la finale au grand stade : la nuit, les projecteurs, l'anneau des tribunes pleines
  stadium: (p) => {
    sky(p, [C.night, C.night, C.night2], 14);
    // les pylônes d'éclairage
    for (const x of [3, 35]) {
      p.vline(x + 1, 3, 16, C.steel);
      p.rect(x, 1, 4, 3, C.goldLight);
      for (let i = 0; i < 10; i++) p.px(x + 2 + (x < 20 ? i : -i), 4 + i, '#fff4b040');
    }
    // l'anneau des tribunes
    p.rect(0, 12, 40, 28, C.steel);
    crowd(p, 13, 9, [C.red, C.white, C.blue, C.gold, C.pink, C.grassLight], 11);
    // la pelouse en ellipse
    for (let y = 22; y < 40; y++) {
      const w = Math.round(16 * Math.sqrt(Math.max(0, 1 - ((y - 32) / 11) ** 2)));
      p.hline(20 - w, 19 + w, y, Math.floor(y / 2) % 2 ? C.grass : C.grassDark);
    }
    p.vline(20, 23, 39, C.white);
    // le grand écran et la coupe
    p.rect(14, 3, 12, 7, C.ink);
    p.rect(15, 4, 10, 5, C.blue);
    p.rect(19, 5, 2, 2, C.gold);
    p.px(20, 7, C.gold);
    p.hline(19, 21, 8, C.goldDark);
  },
  // le festival de la bière : le grand chapiteau rayé, les guirlandes, la chope géante
  festival: (p) => {
    sky(p, ['#f0884a', '#f2a860', '#f8c890', '#ffe0b0'], 26);
    p.disc(33, 9, 4, C.goldLight);
    // le chapiteau
    for (let y = 6; y < 22; y++) {
      const w = Math.round((y - 5) * 1.15);
      for (let x = 20 - w; x <= 19 + w; x++) p.px(x, y, Math.floor((x - 20 + 40) / 3) % 2 ? C.red : C.white);
    }
    p.rect(2, 21, 36, 11, C.white);
    for (let x = 2; x < 38; x += 6) p.rect(x, 21, 3, 11, C.red);
    p.vline(20, 2, 6, C.ink);
    p.rect(21, 2, 4, 2, C.blue);
    // l'entrée et la chope géante
    p.rect(16, 24, 8, 8, C.ink);
    p.rect(17, 26, 4, 5, C.beer);
    p.hline(17, 20, 25, C.foam);
    p.rect(21, 27, 2, 3, C.gold);
    // les guirlandes de fanions
    for (let x = 0; x < 40; x += 2) p.px(x, 4 + Math.round(Math.abs(20 - x) / 7), [C.red, C.gold, C.blue, C.grassLight][(x / 2) % 4]!);
    lawn(p, 32);
    crowd(p, 33, 3, [C.ink, C.brown, C.blue, C.red, C.pink], 5);
  },
  // les Jeux mondiaux : la flamme, le podium or-argent-bronze et les feux d'artifice
  games: (p) => {
    sky(p, [C.night, C.night2, C.night2, '#3a2c66'], 30);
    // feux d'artifice
    for (const [cx, cy, c] of [[7, 7, C.pink], [32, 6, C.grassLight], [20, 3, C.gold]] as const) {
      for (let a = 0; a < 8; a++) {
        const t = (a / 8) * Math.PI * 2;
        p.px(cx + Math.cos(t) * 3, cy + Math.sin(t) * 3, c);
        p.px(cx + Math.cos(t) * 2, cy + Math.sin(t) * 2, C.white);
      }
    }
    // la vasque et sa flamme
    p.rect(18, 12, 4, 6, C.steel);
    p.rect(16, 11, 8, 2, C.silver);
    p.disc(20, 8, 2, C.orange);
    p.disc(20, 9, 2, C.red);
    p.px(20, 6, C.goldLight);
    p.vline(20, 7, 9, C.gold);
    // le podium : 2, 1, 3
    p.rect(4, 26, 10, 14, C.silver);
    p.rect(15, 21, 10, 19, C.gold);
    p.rect(26, 29, 10, 11, C.bronze);
    p.rect(5, 27, 8, 1, C.white);
    p.rect(16, 22, 8, 1, C.goldLight);
    p.rect(27, 30, 8, 1, '#f0b884');
    // les chiffres
    p.rect(19, 25, 2, 5, C.goldDark);
    p.hline(8, 10, 30, C.steel);
    p.hline(8, 10, 32, C.steel);
    p.hline(8, 10, 34, C.steel);
    p.px(10, 31, C.steel);
    p.px(8, 33, C.steel);
    p.hline(30, 32, 32, '#8a4a1c');
    p.hline(30, 32, 34, '#8a4a1c');
    p.hline(30, 32, 36, '#8a4a1c');
    p.px(32, 33, '#8a4a1c');
    p.px(32, 35, '#8a4a1c');
    // les athlètes sur le podium
    for (const [x, y, c] of [[9, 22, C.blue], [20, 17, C.red], [31, 25, C.grassDark]] as const) {
      p.rect(x - 1, y, 3, 4, c);
      p.disc(x, y - 2, 1, C.brownLight);
      p.px(x - 2, y - 1, c);
      p.px(x + 2, y - 1, c);
    }
  },
};

/** Dessine la scène d'un partenaire, au pixel près, à l'échelle demandée. */
export function drawPartnerScene(canvas: HTMLCanvasElement, id: PartnerId, scale = 2): void {
  canvas.width = SCENE_SIZE * scale;
  canvas.height = SCENE_SIZE * scale;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.save();
  g.scale(scale, scale);
  SCENES[id](painter(g));
  g.restore();
}
