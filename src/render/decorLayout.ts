/**
 * Où sont posés les décors : pour chaque pièce et chaque niveau de la pièce, la liste de ses assets
 * (position du coin haut-gauche dans le plan de 160 × 300, échelle, retourné, devant le reste).
 * L'outil de mise en page (dev) modifie `decorLayout` et exporte le code de DECOR_DEFAULT.
 */
export type RoomKey = 'workshop' | 'office' | 'storage' | 'bar' | 'shop';

export const ROOM_NAMES: Record<RoomKey, string> = { workshop: 'Atelier', office: 'Bureau', storage: 'Stockage', bar: 'Bar', shop: 'Magasin' };
/** Nombre de niveaux (de décors) de chaque pièce. */
export const ROOM_LEVELS: Record<RoomKey, number> = { workshop: 5, office: 5, storage: 5, bar: 5, shop: 1 };

export interface DecorInst {
  /** Identifiant unique dans la pièce et le niveau. */
  id: string;
  /** L'asset (voir decorAssets.ts). */
  a: string;
  x: number;
  y: number;
  /** Échelle (1 = taille d'origine). */
  s: number;
  /** Retourné horizontalement. */
  f?: boolean;
  /** Dessiné devant tout le reste de la pièce. */
  front?: boolean;
}

export type RoomDecor = Record<number, DecorInst[]>;
export type DecorLayout = Record<RoomKey, RoomDecor>;

type Spec = [a: string, x: number, y: number, extra?: Partial<DecorInst>];
const list = (specs: Spec[]): DecorInst[] => {
  const n = new Map<string, number>();
  return specs.map(([a, x, y, extra]) => {
    const k = (n.get(a) ?? 0) + 1;
    n.set(a, k);
    return { id: `${a}-${k}`, a, x, y, s: 1, ...extra };
  });
};

/** Mobilier du bar (affiché quand il est acheté), le même à tous les niveaux. */
const BAR_FURNITURE: Spec[] = [
  ['posterBottle', 86, 40], ['posterMug', 102, 40], ['smallPlant', 58, 89, { f: true }], ['smallPlant', 118, 95],
  ['neonSign', 18, 118], ['jukebox', 145, 112],
];
const OFFICE: Spec[] = [['clock', 72, 126], ['bigPlant', 108, 240], ['deskLamp', 86, 227], ['mug', 10, 240], ['chair', 37, 258]];

export const DECOR_DEFAULT: DecorLayout = {
  bar: {
    1: list([
      ['cobweb', 0, 0], ['cobweb', 141, 0, { f: true }], ['crack', 104, 26], ['bulb', 41, 14], ['lightRayWide', 6, 18], ['openSign', 23, 24],
      ['bottleShelf', 8, 56], ['barrel', 115, 164], ['emptyCrate', 10, 170], ['cellarVent', 66, 210], ...BAR_FURNITURE,
    ]),
    2: list([
      ['greenPendant', 15, 14], ['greenPendant', 61, 14], ['greenPendant', 115, 14], ['lightRay', -4, 18], ['lightRay', 42, 18], ['lightRay', 96, 18],
      ['bottleShelf', 8, 52], ['bottleShelf', 8, 76], ['board', 23, 26], ['cellarVent', 66, 210], ...BAR_FURNITURE,
    ]),
    3: list([
      ['brassSconce', 20, 8], ['brassSconce', 60, 8], ['brassSconce', 100, 8], ['brassSconce', 136, 8],
      ['bottleShelf', 8, 52], ['bottleShelf', 8, 76], ['board', 23, 26], ...BAR_FURNITURE,
    ]),
    4: list([
      ['brewSign', 6, 2], ['factoryLamp', 94, 22], ['factoryLamp', 134, 22],
      ['bottleShelf', 8, 44], ['bottleShelf', 8, 64], ['bottleShelf', 8, 84], ['board', 23, 26], ...BAR_FURNITURE,
    ]),
    5: list([
      ['cityViewSmall', 6, 1], ['bottleShelf', 8, 44], ['bottleShelf', 8, 64], ['bottleShelf', 8, 84], ['board', 23, 26], ...BAR_FURNITURE,
    ]),
  },
  storage: {
    1: list([['bulb', 78, 12], ['cobweb', 0, 0], ['toolBoard', 130, 8], ['trolley', 10, 222]]),
    2: list([['lantern', 18, 12], ['lantern', 138, 12], ['trolley', 10, 222]]),
    3: list([['coldUnit', 54, 4], ['thermometer', 124, 6], ['trolley', 10, 222]]),
    4: list([['trolley', 10, 222]]),
    5: list([['robotArm', 20, 6], ['trolley', 10, 222]]),
  },
  shop: {
    1: list([['shopSign', 34, 8], ['shopPendant', 73, 34], ['lightRay', 56, 40, { s: 1.75 }], ['register', 103, 233]]),
  },
  office: { 1: list(OFFICE), 2: list(OFFICE), 3: list(OFFICE), 4: list(OFFICE), 5: list(OFFICE) },
  workshop: {
    1: list([['moonWindow', 68, 6], ['jarShelf', 60, 92], ['jarShelf', 64, 164], ['cobweb', 8, 4], ['candle', 58, 53], ['candle', 58, 123]]),
    2: list([['garageWindow', 47, 3], ['garageWindow', 69, 3], ['workLamp', 59, 68], ['workLamp', 59, 138]]),
    3: list([['archWindow', 14, -6], ['archWindow', 94, -6], ['chalkboard', 66, 94], ['workLamp', 59, 68], ['workLamp', 59, 138]]),
    4: list([['workLamp', 59, 68], ['workLamp', 59, 138]]),
    5: list([['cityView', 30, 5], ['ceilingNeon', 54, 70], ['ceilingNeon', 54, 140]]),
  },
};

const clone = (l: DecorLayout): DecorLayout => JSON.parse(JSON.stringify(l));

/** Disposition en cours (modifiée par l'outil de mise en page). */
export const decorLayout: DecorLayout = clone(DECOR_DEFAULT);

export function resetDecor(room?: RoomKey, lv?: number): void {
  const d = clone(DECOR_DEFAULT);
  if (!room) Object.assign(decorLayout, d);
  else if (lv == null) decorLayout[room] = d[room];
  else decorLayout[room][lv] = d[room][lv] ?? [];
}

/** Reprend une disposition gardée (seulement ce qui a la bonne forme). */
export function applyDecor(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  for (const room of Object.keys(ROOM_NAMES) as RoomKey[]) {
    const r = (data as Record<string, unknown>)[room];
    if (!r || typeof r !== 'object') continue;
    for (const [lv, items] of Object.entries(r as Record<string, unknown>)) {
      if (!Array.isArray(items)) continue;
      decorLayout[room][Number(lv)] = items
        .filter((i): i is DecorInst => !!i && typeof i.a === 'string' && typeof i.id === 'string' && Number.isFinite(i.x) && Number.isFinite(i.y))
        .map((i) => ({ id: i.id, a: i.a, x: Math.round(i.x), y: Math.round(i.y), s: Number.isFinite(i.s) && i.s > 0 ? i.s : 1, ...(i.f ? { f: true } : {}), ...(i.front ? { front: true } : {}) }));
    }
  }
}
