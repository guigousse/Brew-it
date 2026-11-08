/**
 * Les éléments fixes du bar, ceux dont dépend le jeu (on les déplace, on ne les retire pas) : le comptoir
 * (et avec lui tireuses, barman et tabourets), l'emplacement de l'objet d'événement, la zone des tables.
 * Les décors (lampes, cadres, juke-box…) sont dans decorLayout. Coin haut-gauche dans le plan de 160 × 300.
 */
export interface BarSpot { x: number; y: number; w: number; h: number }

export type BarItem = 'counter' | 'event' | 'tables';

/** Nom de chaque élément. */
export const BAR_ITEM_NAMES: Record<BarItem, string> = { counter: 'Comptoir', event: 'Objet d\'événement', tables: 'Tables' };

/** Seul le comptoir change de taille (largeur, hauteur de la façade). */
export const RESIZABLE: readonly BarItem[] = ['counter'];

export const BAR_LAYOUT_DEFAULT: Readonly<Record<BarItem, BarSpot>> = {
  counter: { x: 6, y: 112, w: 74, h: 22 },
  event: { x: 120, y: 0, w: 38, h: 44 },
  tables: { x: 79, y: 154, w: 68, h: 40 },
};

const clone = (l: Readonly<Record<BarItem, BarSpot>>) =>
  Object.fromEntries(Object.entries(l).map(([k, v]) => [k, { ...v }])) as Record<BarItem, BarSpot>;

/** Disposition en cours. */
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
