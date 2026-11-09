/**
 * Où sont posés les décors : pour chaque pièce et chaque niveau de la pièce, la liste de ses assets
 * (position du coin haut-gauche dans le plan de 160 × 300, échelle, retourné, devant le reste).
 * Pour changer le rendu d'une pièce : ajouter, retirer ou déplacer des lignes ici.
 */
export type RoomKey = 'workshop' | 'office' | 'storage' | 'bar';

export const ROOM_NAMES: Record<RoomKey, string> = { workshop: 'Atelier', office: 'Bureau', storage: 'Stockage', bar: 'Bar' };
/** Nombre de niveaux (de décors) de chaque pièce. */
export const ROOM_LEVELS: Record<RoomKey, number> = { workshop: 5, office: 5, storage: 5, bar: 5 };

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
 * Mobilier du bar (affiché quand il est acheté), le même à tous les niveaux : le comptoir au centre, avec la même
 * marge de chaque côté ; le juke-box contre le mur à sa droite ; les deux tableaux symétriques, un dans chaque marge,
 * un peu au-dessus du juke-box.
 */
const BAR_FURNITURE: Spec[] = [
  ['posterBottle', 6, 48], ['posterMug', 136, 48], ['smallPlant', 18, 89], ['smallPlant', 112, 89, { f: true }],
  ['jukebox', 140, 78],
];
/** Étagères à bouteilles derrière le comptoir, de sa largeur. */
const shelves = (...ys: number[]): Spec[] => ys.map((y): Spec => ['barShelf', 30, y - 14]);
/**
 * Le bureau est dessiné à l'échelle 0,95, un peu en retrait vers le mur (voir officeRoom) : ce qui l'accompagne
 * (lampe, chaise, objets du plateau) suit, placé ici aux mesures d'origine.
 */
const desk = ([a, x, y, extra]: Spec): Spec => [a, Math.round(2 + (x - 4) * 0.95), Math.round(221 + (y - 228) * 0.95), { s: 0.95, ...extra }];
/** Le bureau : ce qui est commun à tous les niveaux, puis les objets posés sur le plateau, qui changent avec l'ordinateur. */
const OFFICE: Spec[] = [['clock', 72, 126], ...([['deskLamp', 0, 207], ['chair', 28, 245]] as Spec[]).map(desk), ['bigPlant', 118, 240]];
const OFFICE_DESK: Spec[][] = ([
  [['rotaryPhone', 105, 218]],
  [['orderPile', 107, 220]],
  [['deskPhone', 82, 220], ['binders', 100, 214], ['mug', 115, 221]],
  [['smartphone', 110, 225], ['postits', 66, 199, { front: true }]],
  [['smartSpeaker', 96, 218], ['mug', 112, 221]],
] as Spec[][]).map((l) => l.map(desk));

export const DECOR_DEFAULT: DecorLayout = {
  bar: {
    1: list([
      ['cobweb', 0, 0], ['cobweb', 141, 0, { f: true }], ['crack', 79, 30], ['bulb', 78, 14], ['lightRayWide', 43, 18], ['neonSign', 48, 40],
      ...shelves(70), ['barrel', 115, 164], ['emptyCrate', 10, 170], ['cellarVent', 66, 210], ...BAR_FURNITURE,
    ]),
    2: list([
      ['greenPendant', 42, 14], ['greenPendant', 107, 14], ['lightRay', 23, 18], ['lightRay', 89, 18], ['neonSign', 48, 36],
      ...shelves(66, 90), ['cellarVent', 66, 210], ...BAR_FURNITURE,
    ]),
    3: list([
      ['brassSconce', 35, 8], ['brassSconce', 76, 8], ['brassSconce', 116, 8], ['neonSign', 48, 36],
      ...shelves(66, 90), ...BAR_FURNITURE,
    ]),
    4: list([
      ['factoryLamp', 33, 22], ['factoryLamp', 114, 22], ['neonSign', 48, 28],
      ...shelves(58, 78, 98), ...BAR_FURNITURE,
    ]),
    5: list([
      ['cityView', 30, -1], ['neonSignHanging', 48, 30], ...shelves(58, 78, 98), ...BAR_FURNITURE,
    ]),
  },
  storage: {
    1: list([['bulb', 78, 12], ['toolBoard', 130, 8], ['maltSacks', 117, 246, { s: 1.2 }], ['bucket', 146, 272, { s: 1.2 }]]),
    2: list([['lantern', 76, 12], ['lantern', 138, 12], ['barrel', 134, 230, { s: 1.4 }], ['emptyCrate', 118, 258, { s: 1.2 }]]),
    3: list([['coldUnit', 78, 4], ['thermometer', 134, 6], ['coolBoxes', 117, 242, { s: 1.3 }]]),
    4: list([['extinguisher', 146, 214, { s: 1.3 }], ['palletJack', 112, 252, { s: 1.1 }]]),
    5: list([['robotArm', 20, 6], ['deliveryBot', 116, 250, { s: 1.1 }]]),
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
