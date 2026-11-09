/**
 * Où sont posés les décors : pour chaque pièce et chaque niveau de la pièce, la liste de ses assets
 * (position du coin haut-gauche dans le plan de 160 × 300, échelle, retourné, devant le reste).
 * Pour changer le rendu d'une pièce : ajouter, retirer ou déplacer des lignes ici.
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

/**
 * Mobilier du bar (affiché quand il est acheté), le même à tous les niveaux : le comptoir au centre, un peu raccourci
 * pour que le juke-box tienne à sa droite contre le mur ; les tableaux de part et d'autre de l'objet d'événement.
 */
const BAR_FURNITURE: Spec[] = [
  ['posterBottle', 22, 34], ['posterMug', 126, 34], ['smallPlant', -4, 89], ['smallPlant', 112, 89, { f: true }],
  ['neonSign', 45, 118], ['jukebox', 140, 78],
];
/** Étagères à bouteilles derrière le comptoir, sur toute sa largeur (deux étagères côte à côte par rangée). */
const shelves = (...ys: number[]): Spec[] => ys.flatMap((y): Spec[] => [['bottleShelf', 8, y - 14], ['bottleShelf', 60, y - 14]]);
/** Le bureau : ce qui est commun à tous les niveaux, puis les objets posés sur le plateau, qui changent avec l'ordinateur. */
const OFFICE: Spec[] = [['clock', 72, 126], ['deskLamp', 0, 207], ['wasteBin', 98, 280], ['chair', 28, 245], ['bigPlant', 118, 240]];
const OFFICE_DESK: Spec[][] = [
  [['rotaryPhone', 105, 218]],
  [['orderPile', 107, 220]],
  [['deskPhone', 82, 220], ['binders', 100, 214], ['mug', 115, 221]],
  [['smartphone', 110, 225], ['postits', 66, 199, { front: true }]],
  [['smartSpeaker', 96, 218], ['mug', 112, 221]],
];

export const DECOR_DEFAULT: DecorLayout = {
  bar: {
    1: list([
      ['cobweb', 0, 0], ['cobweb', 141, 0, { f: true }], ['crack', 104, 26], ['bulb', 78, 14], ['lightRayWide', 44, 18], ['openSign', 112, 46],
      ...shelves(70), ['barrel', 115, 164], ['emptyCrate', 10, 170], ['cellarVent', 66, 210], ...BAR_FURNITURE,
    ]),
    2: list([
      ['greenPendant', 31, 14], ['greenPendant', 95, 14], ['lightRay', 13, 18], ['lightRay', 77, 18],
      ...shelves(66, 90), ['cellarVent', 66, 210], ...BAR_FURNITURE,
    ]),
    3: list([
      ['brassSconce', 20, 8], ['brassSconce', 60, 8], ['brassSconce', 100, 8],
      ...shelves(66, 90), ...BAR_FURNITURE,
    ]),
    4: list([
      ['brewSign', 30, 4], ['factoryLamp', 8, 22], ['factoryLamp', 104, 22],
      ...shelves(58, 78, 98), ...BAR_FURNITURE,
    ]),
    5: list([
      ['cityView', 10, -1], ...shelves(58, 78, 98), ...BAR_FURNITURE,
    ]),
  },
  storage: {
    1: list([['bulb', 78, 12], ['toolBoard', 130, 8], ['maltSacks', 117, 246, { s: 1.2 }], ['bucket', 146, 272, { s: 1.2 }]]),
    2: list([['lantern', 76, 12], ['lantern', 138, 12], ['barrel', 134, 230, { s: 1.4 }], ['emptyCrate', 118, 258, { s: 1.2 }]]),
    3: list([['coldUnit', 78, 4], ['thermometer', 134, 6], ['coolBoxes', 117, 242, { s: 1.3 }]]),
    4: list([['extinguisher', 146, 214, { s: 1.3 }], ['palletJack', 112, 252, { s: 1.1 }]]),
    5: list([['robotArm', 20, 6], ['deliveryBot', 116, 250, { s: 1.1 }]]),
  },
  shop: {
    1: list([['shopSign', 34, 8], ['shopPendant', 73, 34], ['lightRay', 56, 40, { s: 1.75 }], ['register', 103, 233]]),
  },
  office: Object.fromEntries(OFFICE_DESK.map((desk, i) => [i + 1, list([...OFFICE, ...desk])])),
  workshop: {
    1: list([['moonWindow', 68, 6], ['jarShelf', 60, 92], ['jarShelf', 64, 164], ['cobweb', 8, 4], ['candle', 58, 53], ['candle', 58, 123]]),
    2: list([['garageWindow', 47, 3], ['garageWindow', 69, 3], ['workLamp', 59, 68], ['workLamp', 59, 138]]),
    3: list([['archWindow', 14, -6], ['archWindow', 94, -6], ['chalkboard', 66, 94], ['workLamp', 59, 68], ['workLamp', 59, 138]]),
    4: list([['workLamp', 59, 68], ['workLamp', 59, 138]]),
    5: list([['cityView', 30, 5], ['ceilingNeon', 54, 70], ['ceilingNeon', 54, 140]]),
  },
};

const clone = (l: DecorLayout): DecorLayout => JSON.parse(JSON.stringify(l));

/** Disposition en cours. */
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
