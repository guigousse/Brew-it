import type { ContestTier, Metal } from '../core/contests';

/**
 * Cocardes de concours, en pixel art, dessinées pixel par pixel. Plus le concours est prestigieux, plus la cocarde
 * l'est : régionale (un médaillon sur un ruban rouge), nationale (une collerette plissée et un ruban tricolore,
 * une étoile), internationale (double collerette, ruban pourpre bordé d'or, couronne de laurier et étoile).
 * Le médaillon central est de bronze, d'argent ou d'or.
 */

export const COCARDE_W = 20;
export const COCARDE_H = 24;

const METAL = [
  { hi: '#f0b884', mid: '#c07a3e', lo: '#6e3e1a' }, // bronze
  { hi: '#ffffff', mid: '#bcc6d0', lo: '#5c6670' }, // argent
  { hi: '#fff4b0', mid: '#f2c14e', lo: '#a0681e' }, // or
] as const;

const INK = '#1b1424';
const GOLD = '#f2c14e';
const GOLD_HI = '#fff4b0';
/** Couleurs des pans du ruban (3 pixels de large), par concours. */
const RIBBONS: readonly (readonly string[])[] = [
  ['#e8553a', '#c8443a', '#8a2a1c'],
  ['#2b4fa8', '#f6ecd6', '#d8443a'],
  [GOLD, '#6a2ca0', GOLD],
];
/** Plis de la collerette, du bord extérieur vers le médaillon : [clair, sombre] par anneau. */
const RINGS: readonly (readonly (readonly [string, string])[])[] = [
  [['#e8553a', '#a8341c']],
  [['#3f6ad4', '#24408a'], ['#f6ecd6', '#c8bca4'], ['#e8553a', '#a8341c']],
  [[GOLD, '#a8742a'], ['#9a5ad8', '#5a2a8a'], ['#9a5ad8', '#5a2a8a'], [GOLD, '#a8742a']],
];
const SIZES = [
  { disc: 3.3, ring: 2.4, tail: 19 },
  { disc: 3.5, ring: 3.1, tail: 21 },
  { disc: 3.6, ring: 3.4, tail: 23 },
] as const;

export function drawCocarde(canvas: HTMLCanvasElement, tier: ContestTier, metal: Metal, scale = 2): void {
  canvas.width = COCARDE_W * scale;
  canvas.height = COCARDE_H * scale;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const px = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= COCARDE_W || y >= COCARDE_H) return;
    g.fillStyle = c;
    g.fillRect(x * scale, y * scale, scale, scale);
  };
  const cx = 9.5;
  const cy = 8.5;
  const m = METAL[metal];
  const { disc, ring, tail } = SIZES[tier];
  const outer = disc + ring;

  // les deux pans du ruban partent de derrière le médaillon et s'écartent un peu, coupés en V
  const stripes = RIBBONS[tier]!;
  for (const [x0, dir] of [[6, -1], [11, 1]] as const) {
    for (let y = Math.round(cy); y <= tail; y++) {
      const x = x0 + Math.round(dir * (y - cy) * 0.22);
      px(x - 1, y, INK);
      px(x + 3, y, INK);
      const notch = y === tail;
      for (let i = 0; i < 3; i++) px(x + i, y, notch && i === 1 ? INK : stripes[i]!);
    }
    const xe = x0 + Math.round(dir * (tail + 1 - cy) * 0.22);
    px(xe - 1, tail + 1, INK);
    px(xe, tail + 1, INK);
    px(xe + 2, tail + 1, INK);
    px(xe + 3, tail + 1, INK);
  }

  // rayons d'or autour de la cocarde internationale
  if (tier === 2) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 - Math.PI / 2;
      const long = k % 2 === 0 ? 2 : 1;
      for (let r = 0; r < long; r++) px(Math.round(cx + (outer + 1 + r) * Math.cos(a) - 0.5), Math.round(cy + (outer + 1 + r) * Math.sin(a) - 0.5), r ? GOLD_HI : GOLD);
    }
  }

  // collerette plissée (des anneaux de plis), puis le médaillon
  const rings = RINGS[tier]!;
  for (let y = 0; y < COCARDE_H; y++) {
    for (let x = 0; x < COCARDE_W; x++) {
      const dx = x + 0.5 - cx - 0.5;
      const dy = y + 0.5 - cy - 0.5;
      const d = Math.hypot(dx, dy);
      if (d > outer + 1) continue;
      if (d > outer) {
        px(x, y, INK);
        continue;
      }
      if (d > disc + 1) {
        const band = Math.min(rings.length - 1, Math.floor(((outer - d) / (outer - disc - 1)) * rings.length));
        const pleat = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 14) % 2;
        // les plis du haut à gauche prennent la lumière
        const lit = dx + dy < -outer * 0.4;
        const [hi, lo] = rings[band]!;
        px(x, y, pleat && !lit ? lo : hi);
        continue;
      }
      if (d > disc) {
        px(x, y, INK);
        continue;
      }
      // médaillon en relief : clair en haut à gauche, sombre en bas à droite
      const shade = (dx + dy) / disc;
      px(x, y, shade < -0.55 ? m.hi : shade > 0.6 ? m.lo : m.mid);
    }
  }

  // emblème frappé : un reflet (régional), une étoile (national, international)
  const ix = Math.round(cx - 0.5);
  const iy = Math.round(cy - 0.5);
  if (tier === 0) {
    px(ix - 1, iy - 1, m.hi);
    px(ix, iy - 2, m.hi);
  } else {
    const c = tier === 2 ? m.hi : m.lo;
    for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [1, 1]]) px(ix + dx!, iy + dy!, c);
  }
}

/** Noms des cocardes, pour l'accessibilité. */
export const cocardeClass = (tier: ContestTier, metal: Metal) => `cocarde t${tier} m${metal}`;
