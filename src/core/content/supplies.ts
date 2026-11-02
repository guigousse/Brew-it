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
    item: 'hops', name: 'Houblon', unit: '× 50 g',
    description: 'La fleur qui donne l\'amertume et les arômes.',
    packs: [
      { id: 'hops1', label: 'Sachet de 50 g', qty: 1, price: 2 },
      { id: 'hops5', label: 'Sac de 250 g', qty: 5, price: 9 },
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
export const findPack = (id: string) => {
  for (const s of SUPPLIES) for (const p of s.packs) if (p.id === id) return { supply: s, pack: p };
  return undefined;
};
