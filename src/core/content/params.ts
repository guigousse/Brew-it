import type { RecipeChoices } from '../brewing/recipe';

/**
 * Organisation des molettes du brassin, par étape du brassage, avec l'explication de chaque réglage.
 * Le jeu ne donne aucune prévision : c'est la fournée d'essai qui révèle le résultat.
 */
export type KnobKey = Exclude<keyof RecipeChoices, 'strain'>;

export interface KnobGroup {
  step: string;
  /** Ce qui se passe à cette étape. */
  hint: string;
  knobs: readonly KnobKey[];
  /** L'étape comporte le choix de la levure. */
  strain?: boolean;
}

export const RECIPE_GROUPS: readonly KnobGroup[] = [
  { step: 'Empâtage', hint: 'Le malt infuse dans 24 L d\'eau chaude : ses enzymes changent l\'amidon en sucre.', knobs: ['grainKg', 'mashTemp', 'mashTime'] },
  { step: 'Ébullition', hint: 'Le moût bout avec le houblon, qui apporte amertume et arômes.', knobs: ['hopsGrams', 'boilTime'] },
  { step: 'Fermentation et garde', hint: 'La levure transforme le sucre en alcool et en bulles, puis la bière mûrit.', knobs: ['fermentTemp', 'gardeDays'], strain: true },
];

/** Les explications de Gaston sur sa recette (tutoriel). */
export const GASTON_NOTES: Record<keyof RecipeChoices, string> = {
  grainKg: '5 kg de malt pour 25 L : assez de sucre pour une bière autour de 5 %.',
  mashTemp: '66 °C : le juste milieu entre une bière sèche et une bière ronde.',
  mashTime: '60 minutes : le temps qu\'il faut aux enzymes pour tout convertir.',
  hopsGrams: '30 g : une amertume douce, qui équilibre le sucre sans agresser.',
  boilTime: '60 minutes de grosse ébullition : on stérilise et on chasse les mauvais arômes.',
  strain: 'Levure ale américaine : nette, elle laisse parler le malt et le houblon.',
  fermentTemp: '19 °C : bien dans sa zone de confort, pas de goût de solvant.',
  gardeDays: '3 jours de garde : les arômes de jeunesse disparaissent.',
};
