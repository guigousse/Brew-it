/** Étiquette d'une bière, créée par le joueur dans l'éditeur. */
export interface Label {
  shape: 'rect' | 'oval' | 'shield' | 'ribbon';
  bg: string;
  pattern: 'none' | 'stripes' | 'dots' | 'diamonds' | 'waves' | 'checks' | 'rays';
  patternColor: string;
  emblem: 'hop' | 'wheat' | 'barrel' | 'star' | 'crown' | 'anchor' | 'mountain' | 'none';
  textColor: string;
  font: 'pixel' | 'retro' | 'classic';
}

export const LABEL_COLORS = [
  '#f6ecd6', '#f2c14e', '#e8553a', '#a8302a', '#6cc040', '#2c6a3a',
  '#4ea8f0', '#1e3c78', '#8a5cc8', '#1b1424', '#c88a4a', '#ffffff',
] as const;

export const SHAPES: { id: Label['shape']; name: string }[] = [
  { id: 'rect', name: 'Rectangle' }, { id: 'oval', name: 'Ovale' }, { id: 'shield', name: 'Écusson' }, { id: 'ribbon', name: 'Banderole' },
];
export const PATTERNS: { id: Label['pattern']; name: string }[] = [
  { id: 'none', name: 'Uni' }, { id: 'stripes', name: 'Rayures' }, { id: 'dots', name: 'Pois' }, { id: 'diamonds', name: 'Losanges' },
  { id: 'waves', name: 'Vagues' }, { id: 'checks', name: 'Damier' }, { id: 'rays', name: 'Soleil' },
];
export const EMBLEMS: { id: Label['emblem']; name: string }[] = [
  { id: 'hop', name: 'Houblon' }, { id: 'wheat', name: 'Épi' }, { id: 'barrel', name: 'Tonneau' }, { id: 'star', name: 'Étoile' },
  { id: 'crown', name: 'Couronne' }, { id: 'anchor', name: 'Ancre' }, { id: 'mountain', name: 'Montagne' }, { id: 'none', name: 'Aucun' },
];
export const FONTS: { id: Label['font']; name: string }[] = [
  { id: 'pixel', name: 'Pixel' }, { id: 'retro', name: 'Rétro' }, { id: 'classic', name: 'Classique' },
];

export const DEFAULT_LABEL: Label = {
  shape: 'rect', bg: '#f6ecd6', pattern: 'stripes', patternColor: '#f2c14e', emblem: 'hop', textColor: '#1b1424', font: 'pixel',
};
