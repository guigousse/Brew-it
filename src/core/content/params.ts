import type { RecipeChoices } from '../brewing/recipe';

/**
 * Les choix du brassin : 2 ou 3 options simples et expliquées par étape du brassage.
 * Pas de curseurs : le joueur comprend l'effet de chaque décision de brasseur.
 */
export interface ChoiceOption {
  value: number | string;
  label: string;
  /** L'effet sur la bière, en quelques mots. */
  hint: string;
}

export interface ChoiceMeta {
  key: keyof RecipeChoices;
  /** Étape du brassage concernée. */
  step: string;
  label: string;
  /** Pourquoi ce choix compte, en une ou deux phrases. */
  why: string;
  options: readonly ChoiceOption[];
}

export const RECIPE_CHOICES: readonly ChoiceMeta[] = [
  {
    key: 'grainKg', step: 'Empâtage', label: 'Quantité de malt',
    why: 'Plus de malt, c\'est plus de sucre dans le moût… donc plus d\'alcool à la fin.',
    options: [
      { value: 4, label: '4 kg', hint: 'Légère' },
      { value: 5, label: '5 kg', hint: 'Normale' },
      { value: 6, label: '6 kg', hint: 'Forte' },
    ],
  },
  {
    key: 'mashTemp', step: 'Empâtage', label: 'Température d\'empâtage',
    why: 'Les enzymes du malt coupent l\'amidon en sucres. À 63 °C la levure les mangera presque tous (bière sèche) ; à 69 °C il en restera (bière ronde et douce).',
    options: [
      { value: 63, label: '63 °C', hint: 'Sèche' },
      { value: 66, label: '66 °C', hint: 'Équilibrée' },
      { value: 69, label: '69 °C', hint: 'Ronde, sucrée' },
    ],
  },
  {
    key: 'hopsItems', step: 'Ébullition', label: 'Dose de houblon',
    why: 'Le houblon, ajouté pendant l\'ébullition, apporte l\'amertume et les arômes. Beaucoup de houblon, c\'est le style IPA.',
    options: [
      { value: 1, label: '50 g', hint: 'Douce' },
      { value: 2, label: '100 g', hint: 'Équilibrée' },
      { value: 4, label: '200 g', hint: 'Très amère' },
    ],
  },
  {
    key: 'strain', step: 'Fermentation', label: 'Levure',
    why: 'La levure mange le sucre et fabrique l\'alcool et les bulles. Chaque souche donne son caractère.',
    options: [
      { value: 'ale_us', label: 'Ale américaine', hint: 'Nette' },
      { value: 'ale_uk', label: 'Ale anglaise', hint: 'Fruitée, ronde' },
      { value: 'saison', label: 'Saison', hint: 'Épicée, sèche' },
    ],
  },
  {
    key: 'gardeDays', step: 'Garde', label: 'Temps de garde',
    why: 'Après la fermentation, la bière se repose au calme et s\'affine. Plus c\'est long, meilleur c\'est… mais plus il faut attendre.',
    options: [
      { value: 1, label: '1 jour', hint: 'Rapide' },
      { value: 3, label: '3 jours', hint: 'Bonne' },
      { value: 7, label: '7 jours', hint: 'Excellente' },
    ],
  },
];
