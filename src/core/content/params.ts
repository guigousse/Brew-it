/**
 * Choix proposés au joueur sur chaque machine : 2 ou 3 options simples et expliquées.
 * Pas de curseurs : le joueur comprend l'effet de chaque décision de brasseur.
 * Seuls les paramètres listés ici sont affichés ; les autres sont des réglages internes.
 */
export interface ChoiceOption {
  value: number | string;
  label: string;
  /** L'effet sur la bière, en quelques mots. */
  hint: string;
}

export interface ChoiceMeta {
  label: string;
  /** Pourquoi ce choix compte (affiché sous le titre). */
  why: string;
  options: readonly ChoiceOption[];
}

export const CHOICES: Record<string, ChoiceMeta> = {
  grainKg: {
    label: 'Quantité de malt',
    why: 'Plus de malt, c\'est plus de sucre… donc plus d\'alcool.',
    options: [
      { value: 4, label: '4 kg', hint: 'Légère' },
      { value: 5, label: '5 kg', hint: 'Normale' },
      { value: 6, label: '6 kg', hint: 'Forte' },
    ],
  },
  mashTemp: {
    label: 'Température d\'empâtage',
    why: 'Elle décide du type de sucre : la levure les mange plus ou moins bien.',
    options: [
      { value: 63, label: '63 °C', hint: 'Sèche' },
      { value: 66, label: '66 °C', hint: 'Équilibrée' },
      { value: 69, label: '69 °C', hint: 'Ronde, sucrée' },
    ],
  },
  hopsItems: {
    label: 'Dose de houblon',
    why: 'Le houblon apporte l\'amertume et les arômes.',
    options: [
      { value: 1, label: '50 g', hint: 'Douce' },
      { value: 2, label: '100 g', hint: 'Équilibrée' },
      { value: 4, label: '200 g', hint: 'Très amère' },
    ],
  },
  strain: {
    label: 'Levure',
    why: 'Chaque levure donne son caractère à la bière.',
    options: [
      { value: 'ale_us', label: 'Ale américaine', hint: 'Nette, laisse parler le houblon' },
      { value: 'ale_uk', label: 'Ale anglaise', hint: 'Fruitée, ronde' },
      { value: 'saison', label: 'Saison', hint: 'Épicée, très sèche' },
    ],
  },
  gardeDays: {
    label: 'Temps de garde',
    why: 'Après la fermentation, la bière se repose et s\'affine.',
    options: [
      { value: 1, label: '1 jour', hint: 'Rapide' },
      { value: 3, label: '3 jours', hint: 'Bonne' },
      { value: 7, label: '7 jours', hint: 'Excellente' },
    ],
  },
  item: {
    label: 'Ingrédient livré',
    why: 'Chaque livraison achète automatiquement son ingrédient.',
    options: [
      { value: 'malt', label: 'Malt', hint: '1,20 € le kg' },
      { value: 'hops', label: 'Houblon', hint: '2 € les 50 g' },
      { value: 'yeast', label: 'Levure', hint: '4 € le sachet' },
      { value: 'bottle', label: 'Bouteilles', hint: '0,30 € pièce' },
    ],
  },
};
