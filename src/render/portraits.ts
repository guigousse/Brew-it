/**
 * Portraits des clients (16 × 16 px natifs), dessinés au pixel : une tenue par type de client
 * (tablier du bistrot, toque du restaurant, béret de l'épicerie…), et une tête qui varie avec le nom
 * (peau, cheveux, coiffure). Un contour d'encre automatique leur donne le trait des autres icônes.
 */

const INK = '#1b1424';
const SKINS = ['#f6d2b0', '#e8b48a', '#c88a5c', '#9a6440', '#6e4428'];
const HAIRS = ['#2c1c14', '#5c3a1c', '#a8742a', '#e8c070', '#8a8a96', '#b8482a'];
const SHIRTS = ['#3f88d4', '#e8553a', '#4c8a50', '#d4823a', '#8a5cc4', '#c4d0dc'];

type HairStyle = 'short' | 'long' | 'bald' | 'bun';
type Hat = 'none' | 'beret' | 'chef' | 'tallChef' | 'cap' | 'party';

interface Look {
  outfit: string | null; // null : couleur au hasard
  hat: Hat;
  hatColor?: string;
  apron?: boolean;
  tie?: string;
  bow?: string;
  scarf?: string;
  glasses?: boolean;
  shades?: boolean;
  mustache?: boolean;
}

/** La tenue de chaque type de client. */
const LOOKS: Record<string, Look> = {
  particulier: { outfit: null, hat: 'none' },
  bistrot: { outfit: '#2c3e5c', hat: 'none', apron: true, mustache: true },
  epicerie: { outfit: '#6e2a22', hat: 'beret', hatColor: '#2c2840', scarf: '#f2c14e' },
  caviste: { outfit: '#7a2a3a', hat: 'none', glasses: true },
  restaurant: { outfit: '#f4f1e8', hat: 'chef' },
  fetes: { outfit: null, hat: 'party', hatColor: '#e8553a' },
  festival: { outfit: '#2c2c34', hat: 'cap', hatColor: '#7ee081' },
  supermarche: { outfit: '#3f88d4', hat: 'none', tie: '#e8553a' },
  gastro: { outfit: '#f4f1e8', hat: 'tallChef', bow: '#1b1424' },
  export: { outfit: '#1e2a4a', hat: 'none', tie: '#f2c14e', shades: true },
};

/** Petit hachage stable : le même client garde toujours la même tête. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Dessine le portrait d'un client dans un canvas 16 × 16 (agrandi en CSS, pixels nets). */
export function drawPortrait(canvas: HTMLCanvasElement, type: string, name: string): void {
  canvas.width = 16;
  canvas.height = 16;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, 16, 16);
  const grid: (string | null)[][] = Array.from({ length: 16 }, () => Array(16).fill(null));
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) grid[y]![x] = c;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
  };
  const look = LOOKS[type] ?? LOOKS.particulier!;
  const r = hash(`${type}|${name}`);
  const skin = SKINS[r % SKINS.length]!;
  const hair = HAIRS[(r >> 3) % HAIRS.length]!;
  const styles: HairStyle[] = ['short', 'long', 'short', 'bald', 'bun'];
  const style = look.hat === 'none' || look.hat === 'cap' ? styles[(r >> 6) % styles.length]! : 'short';
  const outfit = look.outfit ?? SHIRTS[(r >> 9) % SHIRTS.length]!;

  // buste et cou
  rect(2, 13, 13, 15, outfit);
  rect(3, 12, 12, 12, outfit);
  rect(7, 11, 8, 11, skin);
  if (look.apron) rect(5, 12, 10, 15, '#f4f1e8');
  if (look.scarf) rect(4, 11, 11, 12, look.scarf);
  if (look.tie) rect(7, 12, 8, 15, look.tie);
  if (look.bow) {
    rect(6, 12, 9, 12, look.bow);
    set(7, 13, look.bow);
  }
  // cheveux longs derrière la tête
  if (style === 'long') rect(4, 5, 11, 11, hair);
  // tête
  rect(6, 4, 9, 4, skin);
  rect(5, 5, 10, 9, skin);
  rect(6, 10, 9, 10, skin);
  // cheveux
  if (style !== 'bald') {
    rect(5, 3, 10, 4, hair);
    set(5, 5, hair);
    set(10, 5, hair);
    if (style === 'bun') rect(7, 1, 8, 2, hair);
  }
  // visage
  if (look.shades) rect(5, 7, 10, 7, INK);
  else {
    set(6, 7, INK);
    set(9, 7, INK);
    if (look.glasses) {
      set(5, 7, '#c4d0dc');
      set(7, 7, '#c4d0dc');
      set(8, 7, '#c4d0dc');
      set(10, 7, '#c4d0dc');
    }
  }
  set(7, 9, '#a85c40');
  set(8, 9, '#a85c40');
  if (look.mustache) rect(6, 8, 9, 8, hair === '#e8c070' ? '#a8742a' : hair);
  // chapeaux
  const hc = look.hatColor ?? '#e8553a';
  if (look.hat === 'beret') {
    rect(4, 3, 10, 3, hc);
    rect(5, 2, 10, 2, hc);
    set(8, 1, hc);
  } else if (look.hat === 'chef' || look.hat === 'tallChef') {
    const top = look.hat === 'tallChef' ? 0 : 1;
    rect(5, top, 10, 3, '#ffffff');
    rect(4, top + 1, 11, 2, '#ffffff');
    rect(5, 4, 10, 4, '#e8eef4');
  } else if (look.hat === 'cap') {
    rect(5, 2, 10, 3, hc);
    rect(10, 4, 12, 4, hc);
  } else if (look.hat === 'party') {
    set(7, 0, '#f2c14e');
    rect(7, 1, 8, 1, hc);
    rect(6, 2, 9, 2, '#f2c14e');
    rect(6, 3, 9, 3, hc);
  }
  // contour d'encre : tout pixel vide qui touche un pixel dessiné
  const filled = (x: number, y: number) => x >= 0 && x < 16 && y >= 0 && y < 16 && !!grid[y]![x] && grid[y]![x] !== INK;
  const outline: [number, number][] = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (grid[y]![x]) continue;
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) outline.push([x, y]);
  }
  for (const [x, y] of outline) grid[y]![x] = INK;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = grid[y]![x];
    if (!c) continue;
    g.fillStyle = c;
    g.fillRect(x, y, 1, 1);
  }
}
