/**
 * Disposition du bar, dans le plan de la pièce (160 × 300) : le bar (comptoir, étagères, ardoise, barman)
 * occupe la moitié gauche ; la moitié droite accueille l'objet de l'événement, les cadres, le juke-box,
 * les plantes et les tables. Chaque élément a un point d'ancrage (coin haut-gauche de sa boîte) ;
 * l'outil de mise en page (dev) les déplace et exporte les valeurs à recopier ici.
 */
export interface BarSpot { x: number; y: number; w: number; h: number }

export type BarItem =
  | 'counter' | 'shelves' | 'board' | 'sign' | 'event' | 'poster1' | 'poster2'
  | 'plant1' | 'plant2' | 'neon' | 'jukebox' | 'tables' | 'barrel' | 'crate';

/** Nom de chaque élément (outil de mise en page). */
export const BAR_ITEM_NAMES: Record<BarItem, string> = {
  counter: 'Comptoir', shelves: 'Étagères', board: 'Ardoise / carte', sign: 'Enseigne murale', event: 'Objet d\'événement',
  poster1: 'Cadre 1', poster2: 'Cadre 2', plant1: 'Plante 1', plant2: 'Plante 2', neon: 'Néon du comptoir',
  jukebox: 'Juke-box', tables: 'Tables', barrel: 'Tonneau (niv. 1)', crate: 'Caisse vide (niv. 1)',
};

/** Seule la largeur du comptoir se règle ; les autres tailles sont celles du dessin. */
export const RESIZABLE: readonly BarItem[] = ['counter'];

export const BAR_LAYOUT_DEFAULT: Readonly<Record<BarItem, BarSpot>> = {
  counter: { x: 6, y: 112, w: 74, h: 22 },
  shelves: { x: 8, y: 42, w: 70, h: 58 },
  board: { x: 23, y: 26, w: 40, h: 20 },
  sign: { x: 6, y: 2, w: 72, h: 16 },
  event: { x: 120, y: 0, w: 38, h: 44 },
  poster1: { x: 86, y: 40, w: 12, h: 15 },
  poster2: { x: 102, y: 40, w: 12, h: 15 },
  plant1: { x: 70, y: 98, w: 9, h: 14 },
  plant2: { x: 128, y: 104, w: 9, h: 14 },
  neon: { x: 18, y: 118, w: 48, h: 10 },
  jukebox: { x: 145, y: 112, w: 14, h: 42 },
  tables: { x: 79, y: 154, w: 68, h: 40 },
  barrel: { x: 116, y: 164, w: 20, h: 26 },
  crate: { x: 10, y: 170, w: 24, h: 22 },
};

const clone = (l: Readonly<Record<BarItem, BarSpot>>) =>
  Object.fromEntries(Object.entries(l).map(([k, v]) => [k, { ...v }])) as Record<BarItem, BarSpot>;

/** Disposition en cours (modifiable par l'outil de mise en page). */
export const barLayout: Record<BarItem, BarSpot> = clone(BAR_LAYOUT_DEFAULT);

export function resetBarLayout(): void {
  Object.assign(barLayout, clone(BAR_LAYOUT_DEFAULT));
}

export function applyBarLayout(data: Partial<Record<BarItem, Partial<BarSpot>>>): void {
  for (const [k, v] of Object.entries(data)) {
    const spot = barLayout[k as BarItem];
    if (!spot || !v) continue;
    for (const key of ['x', 'y', 'w', 'h'] as const) if (typeof v[key] === 'number' && Number.isFinite(v[key])) spot[key] = Math.round(v[key]!);
  }
}
