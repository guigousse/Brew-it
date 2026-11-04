/** Étiquette d'une bière, créée par le joueur dans l'éditeur. */
/** Forme de la bouteille (les nouvelles s'achètent au magasin). */
export type BottleShape = 'classic' | 'longneck' | 'stubby' | 'swing' | 'champagne';

export interface Label {
  /** Absente des anciennes sauvegardes : la bouteille classique. */
  bottle?: BottleShape;
  shape: 'rect' | 'oval' | 'shield' | 'ribbon' | 'round' | 'arch' | 'notched';
  bg: string;
  pattern: 'none' | 'stripes' | 'dots' | 'diamonds' | 'waves' | 'checks' | 'rays' | 'zigzag' | 'scales' | 'herringbone' | 'tartan';
  patternColor: string;
  emblem: 'hop' | 'wheat' | 'barrel' | 'star' | 'crown' | 'anchor' | 'mountain' | 'leaf' | 'bee' | 'sun' | 'fish' | 'castle' | 'skull' | 'none';
  textColor: string;
  font: 'pixel' | 'retro' | 'classic';
}

export const LABEL_COLORS = [
  '#f6ecd6', '#f2c14e', '#e8553a', '#a8302a', '#6cc040', '#2c6a3a',
  '#4ea8f0', '#1e3c78', '#8a5cc8', '#1b1424', '#c88a4a', '#ffffff',
] as const;

export const SHAPES: { id: Label['shape']; name: string }[] = [
  { id: 'rect', name: 'Rectangle' }, { id: 'oval', name: 'Ovale' }, { id: 'shield', name: 'Écusson' }, { id: 'ribbon', name: 'Banderole' },
  { id: 'round', name: 'Arrondie' }, { id: 'arch', name: 'Arche' }, { id: 'notched', name: 'Coins coupés' },
];
export const PATTERNS: { id: Label['pattern']; name: string }[] = [
  { id: 'none', name: 'Uni' }, { id: 'stripes', name: 'Rayures' }, { id: 'dots', name: 'Pois' }, { id: 'diamonds', name: 'Losanges' },
  { id: 'waves', name: 'Vagues' }, { id: 'checks', name: 'Damier' }, { id: 'rays', name: 'Soleil' },
  { id: 'zigzag', name: 'Zigzag' }, { id: 'scales', name: 'Écailles' }, { id: 'herringbone', name: 'Chevrons' }, { id: 'tartan', name: 'Tartan' },
];
export const EMBLEMS: { id: Label['emblem']; name: string }[] = [
  { id: 'hop', name: 'Houblon' }, { id: 'wheat', name: 'Épi' }, { id: 'barrel', name: 'Tonneau' }, { id: 'star', name: 'Étoile' },
  { id: 'crown', name: 'Couronne' }, { id: 'anchor', name: 'Ancre' }, { id: 'mountain', name: 'Montagne' },
  { id: 'leaf', name: 'Feuille' }, { id: 'bee', name: 'Abeille' }, { id: 'sun', name: 'Soleil' }, { id: 'fish', name: 'Poisson' },
  { id: 'castle', name: 'Château' }, { id: 'skull', name: 'Crâne' }, { id: 'none', name: 'Aucun' },
];
export const BOTTLES: { id: BottleShape; name: string }[] = [
  { id: 'classic', name: 'Classique' }, { id: 'longneck', name: 'Long col' }, { id: 'stubby', name: 'Trapue' },
  { id: 'swing', name: 'Bouchon mécanique' }, { id: 'champagne', name: 'Champenoise' },
];
export const FONTS: { id: Label['font']; name: string }[] = [
  { id: 'pixel', name: 'Pixel' }, { id: 'retro', name: 'Rétro' }, { id: 'classic', name: 'Classique' },
];

export const DEFAULT_LABEL: Label = {
  shape: 'rect', bg: '#f6ecd6', pattern: 'stripes', patternColor: '#f2c14e', emblem: 'hop', textColor: '#1b1424', font: 'pixel',
};
