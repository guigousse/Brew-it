/** Étiquette d'une bière, créée par le joueur dans l'éditeur. */
/** Forme de la bouteille (les nouvelles s'achètent au magasin). */
export type BottleShape = 'classic' | 'longneck' | 'stubby' | 'swing' | 'champagne' | 'gold';

/** Pierre du logo diamant (cosmétique de luxe). */
export type GemStone = 'diamond' | 'sapphire' | 'ruby' | 'emerald' | 'amethyst' | 'topaz' | 'aquamarine' | 'tourmaline';

export interface Label {
  /** Absente des anciennes sauvegardes : la bouteille classique. */
  bottle?: BottleShape;
  shape: 'rect' | 'oval' | 'shield' | 'ribbon' | 'round' | 'arch' | 'notched' | 'baroque';
  bg: string;
  pattern: 'none' | 'stripes' | 'dots' | 'diamonds' | 'waves' | 'checks' | 'rays' | 'zigzag' | 'scales' | 'herringbone' | 'tartan' | 'fleurdelis';
  patternColor: string;
  emblem: 'hop' | 'wheat' | 'barrel' | 'star' | 'crown' | 'anchor' | 'mountain' | 'leaf' | 'bee' | 'sun' | 'fish' | 'castle' | 'skull' | 'gem' | 'none';
  textColor: string;
  font: 'pixel' | 'retro' | 'classic';
  /** Pierre du logo diamant ; absente : le diamant. */
  gem?: GemStone;
}

export const LABEL_COLORS = [
  '#f6ecd6', '#f2c14e', '#e8553a', '#a8302a', '#6cc040', '#2c6a3a',
  '#4ea8f0', '#1e3c78', '#8a5cc8', '#1b1424', '#c88a4a', '#ffffff',
] as const;

export const SHAPES: { id: Label['shape']; name: string }[] = [
  { id: 'rect', name: 'Rectangle' }, { id: 'oval', name: 'Ovale' }, { id: 'shield', name: 'Écusson' }, { id: 'ribbon', name: 'Banderole' },
  { id: 'round', name: 'Arrondie' }, { id: 'arch', name: 'Arche' }, { id: 'notched', name: 'Coins coupés' },
  { id: 'baroque', name: 'Cartouche baroque' },
];
export const PATTERNS: { id: Label['pattern']; name: string }[] = [
  { id: 'none', name: 'Uni' }, { id: 'stripes', name: 'Rayures' }, { id: 'dots', name: 'Pois' }, { id: 'diamonds', name: 'Losanges' },
  { id: 'waves', name: 'Vagues' }, { id: 'checks', name: 'Damier' }, { id: 'rays', name: 'Soleil' },
  { id: 'zigzag', name: 'Zigzag' }, { id: 'scales', name: 'Écailles' }, { id: 'herringbone', name: 'Chevrons' }, { id: 'tartan', name: 'Tartan' },
  { id: 'fleurdelis', name: 'Fleurs de lys d\'or' },
];
export const EMBLEMS: { id: Label['emblem']; name: string }[] = [
  { id: 'hop', name: 'Houblon' }, { id: 'wheat', name: 'Épi' }, { id: 'barrel', name: 'Tonneau' }, { id: 'star', name: 'Étoile' },
  { id: 'crown', name: 'Couronne' }, { id: 'anchor', name: 'Ancre' }, { id: 'mountain', name: 'Montagne' },
  { id: 'leaf', name: 'Feuille' }, { id: 'bee', name: 'Abeille' }, { id: 'sun', name: 'Soleil' }, { id: 'fish', name: 'Poisson' },
  { id: 'castle', name: 'Château' }, { id: 'skull', name: 'Crâne' }, { id: 'gem', name: 'Diamant' }, { id: 'none', name: 'Aucun' },
];
export const BOTTLES: { id: BottleShape; name: string }[] = [
  { id: 'classic', name: 'Classique' }, { id: 'longneck', name: 'Long col' }, { id: 'stubby', name: 'Trapue' },
  { id: 'swing', name: 'Bouchon mécanique' }, { id: 'champagne', name: 'Champenoise' }, { id: 'gold', name: 'Bouteille d\'or' },
];
/** Les 8 pierres du logo diamant : du plus clair au plus sombre de chaque pierre, w étant l'éclat. */
export const GEMSTONES: { id: GemStone; name: string; a: string; b: string; c: string; d: string; e: string }[] = [
  { id: 'diamond', name: 'Diamant', a: '#ffffff', b: '#dff4ff', c: '#a8d8f0', d: '#6a9ec0', e: '#3e6a8c' },
  { id: 'sapphire', name: 'Saphir', a: '#8cd0ff', b: '#4ea8f0', c: '#2a6ad0', d: '#1e3c98', e: '#121e5a' },
  { id: 'ruby', name: 'Rubis', a: '#ff9aa8', b: '#f0384e', c: '#c0182e', d: '#80101e', e: '#4a0812' },
  { id: 'emerald', name: 'Émeraude', a: '#a0f0b8', b: '#40c870', c: '#1a9048', d: '#0e5c2e', e: '#06341a' },
  { id: 'amethyst', name: 'Améthyste', a: '#e0b8ff', b: '#b070f0', c: '#8040c8', d: '#542888', e: '#2e1450' },
  { id: 'topaz', name: 'Topaze', a: '#fff0a0', b: '#ffc838', c: '#e8901a', d: '#a85a10', e: '#5e3008' },
  { id: 'aquamarine', name: 'Aigue-marine', a: '#d0fff8', b: '#70e8e0', c: '#30b8c0', d: '#1a7a88', e: '#0c4450' },
  { id: 'tourmaline', name: 'Tourmaline rose', a: '#ffd0ec', b: '#ff88c8', c: '#e04c9c', d: '#a02a6a', e: '#5c1238' },
];
export const gemStone = (id?: GemStone) => GEMSTONES.find((x) => x.id === id) ?? GEMSTONES[0]!;

export const FONTS: { id: Label['font']; name: string }[] = [
  { id: 'pixel', name: 'Pixel' }, { id: 'retro', name: 'Rétro' }, { id: 'classic', name: 'Classique' },
];

export const DEFAULT_LABEL: Label = {
  shape: 'rect', bg: '#f6ecd6', pattern: 'stripes', patternColor: '#f2c14e', emblem: 'hop', textColor: '#1b1424', font: 'pixel',
};
