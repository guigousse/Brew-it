import type { ItemId } from './items';

/** Ingrédients vendus par le fournisseur, et leurs conditionnements. */
export interface Pack {
  id: string;
  label: string;
  qty: number;
  price: number;
}

export interface Supply {
  item: ItemId;
  name: string;
  /** Comment on compte (« kg », « × 50 g »…). */
  unit: string;
  description: string;
  packs: readonly Pack[];
}

export const SUPPLIES: readonly Supply[] = [
  {
    item: 'malt', name: 'Malt d\'orge', unit: 'kg',
    description: 'De l\'orge germée puis séchée : le sucre et le goût de la bière.',
    packs: [
      { id: 'malt5', label: 'Sac de 5 kg', qty: 5, price: 6 },
      { id: 'malt25', label: 'Sac de 25 kg', qty: 25, price: 25 },
    ],
  },
  {
    item: 'hops', name: 'Houblon', unit: '× 10 g',
    description: 'La fleur qui donne l\'amertume et les arômes.',
    packs: [
      { id: 'hops1', label: 'Sachet de 50 g', qty: 5, price: 2 },
      { id: 'hops5', label: 'Sac de 250 g', qty: 25, price: 9 },
    ],
  },
  {
    item: 'yeast', name: 'Levure', unit: 'sachets',
    description: 'Le champignon qui fabrique l\'alcool et les bulles.',
    packs: [
      { id: 'yeast1', label: '1 sachet', qty: 1, price: 4 },
      { id: 'yeast5', label: 'Boîte de 5', qty: 5, price: 18 },
    ],
  },
  {
    item: 'bottle', name: 'Bouteilles vides', unit: 'bouteilles',
    description: 'Bouteilles brunes de 33 cl avec capsules.',
    packs: [
      { id: 'bottle12', label: 'Lot de 12', qty: 12, price: 3.6 },
      { id: 'bottle48', label: 'Carton de 48', qty: 48, price: 12 },
    ],
  },
];

export const STOCK_ITEMS: readonly ItemId[] = ['malt', 'hops', 'yeast', 'bottle'];

/** Capacité de chaque réserve par niveau (index 0 = niveau 1), et prix pour passer au niveau suivant. */
export const STOCK_LEVELS: Record<string, readonly number[]> = {
  malt: [20, 60, 200, 600, 2000],
  hops: [20, 60, 200, 600, 2000], // sachets de 10 g
  yeast: [4, 12, 40, 120, 400],
  bottle: [60, 200, 600, 2000, 6000],
};
export const STOCK_UPGRADE_COST: readonly number[] = [150, 600, 2500, 10000];
export const STOCK_NAMES: Record<string, string> = {
  malt: 'Réserve de malt', hops: 'Chambre froide à houblon', yeast: 'Frigo à levures', bottle: 'Stock de bouteilles',
};
export const findPack = (id: string) => {
  for (const s of SUPPLIES) for (const p of s.packs) if (p.id === id) return { supply: s, pack: p };
  return undefined;
};
