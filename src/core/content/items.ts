/** Objets solides transportés par convoyeur. 1 unité = la quantité indiquée dans `unit`. */
export const ITEMS = {
  malt: { name: 'Malt', unit: '1 kg', color: 0xd9a441 },
  crushed_malt: { name: 'Malt concassé', unit: '1 kg', color: 0xb5793a },
  hops: { name: 'Houblon', unit: '10 g', color: 0x6dbb4a },
  yeast: { name: 'Levure', unit: '1 sachet', color: 0xf2e5b8 },
  bottle: { name: 'Bouteille vide', unit: '33 cl', color: 0x7fb3c9 },
  beer_bottle: { name: 'Bouteille de bière', unit: '33 cl', color: 0xe08a2c },
} as const;

export type ItemId = keyof typeof ITEMS;
export const HOPS_GRAMS_PER_ITEM = 10;
export const BOTTLE_LITERS = 0.33;
