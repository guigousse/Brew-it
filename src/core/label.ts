import { tl } from '../i18n';
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
  pattern: 'none' | 'stripes' | 'dots' | 'diamonds' | 'waves' | 'checks' | 'rays' | 'zigzag' | 'scales' | 'herringbone' | 'tartan' | 'artdeco';
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
  { id: 'rect', name: tl('Rectangle') }, { id: 'oval', name: tl('Ovale') }, { id: 'shield', name: tl('Écusson') }, { id: 'ribbon', name: tl('Banderole') },
  { id: 'round', name: tl('Arrondie') }, { id: 'arch', name: tl('Arche') }, { id: 'notched', name: tl('Coins coupés') },
  { id: 'baroque', name: tl('Cartouche baroque') },
];
export const PATTERNS: { id: Label['pattern']; name: string }[] = [
  { id: 'none', name: tl('Uni') }, { id: 'stripes', name: tl('Rayures') }, { id: 'dots', name: tl('Pois') }, { id: 'diamonds', name: tl('Losanges') },
  { id: 'waves', name: tl('Vagues') }, { id: 'checks', name: tl('Damier') }, { id: 'rays', name: tl('Soleil') },
  { id: 'zigzag', name: tl('Zigzag') }, { id: 'scales', name: tl('Écailles') }, { id: 'herringbone', name: tl('Chevrons') }, { id: 'tartan', name: tl('Tartan') },
  { id: 'artdeco', name: tl('Art déco') },
];
export const EMBLEMS: { id: Label['emblem']; name: string }[] = [
  { id: 'hop', name: tl('Houblon') }, { id: 'wheat', name: tl('Épi') }, { id: 'barrel', name: tl('Tonneau') }, { id: 'star', name: tl('Étoile') },
  { id: 'crown', name: tl('Couronne') }, { id: 'anchor', name: tl('Ancre') }, { id: 'mountain', name: tl('Montagne') },
  { id: 'leaf', name: tl('Feuille') }, { id: 'bee', name: tl('Abeille') }, { id: 'sun', name: tl('Soleil') }, { id: 'fish', name: tl('Poisson') },
  { id: 'castle', name: tl('Château') }, { id: 'skull', name: tl('Crâne') }, { id: 'gem', name: tl('Diamant') }, { id: 'none', name: tl('Aucun') },
];
export const BOTTLES: { id: BottleShape; name: string }[] = [
  { id: 'classic', name: tl('Classique') }, { id: 'longneck', name: tl('Long col') }, { id: 'stubby', name: tl('Trapue') },
  { id: 'swing', name: tl('Bouchon mécanique') }, { id: 'champagne', name: tl('Champenoise') }, { id: 'gold', name: tl('Bouteille d\'or') },
];
/** Les 8 pierres du logo diamant : du plus clair au plus sombre de chaque pierre, w étant l'éclat. */
export const GEMSTONES: { id: GemStone; name: string; a: string; b: string; c: string; d: string; e: string }[] = [
  { id: 'diamond', name: tl('Diamant'), a: '#ffffff', b: '#dff4ff', c: '#a8d8f0', d: '#6a9ec0', e: '#3e6a8c' },
  { id: 'sapphire', name: tl('Saphir'), a: '#8cd0ff', b: '#4ea8f0', c: '#2a6ad0', d: '#1e3c98', e: '#121e5a' },
  { id: 'ruby', name: tl('Rubis'), a: '#ff9aa8', b: '#f0384e', c: '#c0182e', d: '#80101e', e: '#4a0812' },
  { id: 'emerald', name: tl('Émeraude'), a: '#a0f0b8', b: '#40c870', c: '#1a9048', d: '#0e5c2e', e: '#06341a' },
  { id: 'amethyst', name: tl('Améthyste'), a: '#e0b8ff', b: '#b070f0', c: '#8040c8', d: '#542888', e: '#2e1450' },
  { id: 'topaz', name: tl('Topaze'), a: '#fff0a0', b: '#ffc838', c: '#e8901a', d: '#a85a10', e: '#5e3008' },
  { id: 'aquamarine', name: tl('Aigue-marine'), a: '#d0fff8', b: '#70e8e0', c: '#30b8c0', d: '#1a7a88', e: '#0c4450' },
  { id: 'tourmaline', name: tl('Tourmaline rose'), a: '#ffd0ec', b: '#ff88c8', c: '#e04c9c', d: '#a02a6a', e: '#5c1238' },
];
export const gemStone = (id?: GemStone) => GEMSTONES.find((x) => x.id === id) ?? GEMSTONES[0]!;

export const FONTS: { id: Label['font']; name: string }[] = [
  { id: 'pixel', name: tl('Pixel') }, { id: 'retro', name: tl('Rétro') }, { id: 'classic', name: tl('Classique') },
];

export const DEFAULT_LABEL: Label = {
  shape: 'rect', bg: '#f6ecd6', pattern: 'stripes', patternColor: '#f2c14e', emblem: 'hop', textColor: '#1b1424', font: 'pixel',
};
