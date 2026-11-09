import type { Tasting } from './brewing/model';
import { clamp01 } from './math';
import type { Rng } from './rng';
import { TRENDS, trendById, type Trend } from './trends';

/**
 * Commandes : des missions qui arrivent sur l'ordinateur du stockage, envoyées par une clientèle variée
 * (particuliers, bistrots, cavistes, festivals, export…). Pas de contrats : de nouveaux profils de clients
 * se présentent à mesure que la brasserie grandit et que la marque se fait connaître.
 */
export type OrderKind = 'classic' | 'style' | 'keg' | 'mix' | 'urgent' | 'prestige';

export interface ClientType {
  id: string;
  /** Nom de la catégorie (annonce « Nouveaux clients : … »). */
  label: string;
  /** Noms des clients de ce profil. */
  names: readonly string[];
  /** Niveau de brasserie nécessaire. */
  level: number;
  /** Popularité de la marque nécessaire (0 à 1). */
  pop: number;
  /** Taille de ses commandes, relative à la taille de référence du niveau. */
  size: number;
  /** Prix de base d'une bouteille. */
  price: number;
  /** Qualité minimale exigée. */
  minQuality: number;
  /** Types de commandes qu'il passe, avec leur poids. */
  kinds: Partial<Record<OrderKind, number>>;
}

export const CLIENT_TYPES: readonly ClientType[] = [
  {
    id: 'particulier', label: 'les particuliers', level: 1, pop: 0, size: 0.6, price: 3.2, minQuality: 0.3,
    names: ['Anniversaire de Lucie', 'Barbecue des voisins', 'Crémaillère de Tom', 'Apéro de Marc', 'Soirée foot chez Karim', 'Mariage de Paul & Inès', 'Pot de départ de Sophie'],
    kinds: { classic: 4, style: 2, keg: 1, urgent: 1 },
  },
  {
    id: 'bistrot', label: 'les bistrots', level: 1, pop: 0, size: 1, price: 3.4, minQuality: 0.45,
    names: ['Bistrot Chez Lulu', 'Café du Commerce', 'Le Zinc', 'Bar des Sports', 'Pizzeria Mamma'],
    kinds: { classic: 3, style: 2, keg: 2, urgent: 1 },
  },
  {
    id: 'epicerie', label: 'les épiceries fines', level: 1, pop: 0.15, size: 1, price: 3.8, minQuality: 0.55,
    names: ['Épicerie Le Panier', 'Maison Roux', 'Comptoir des Saveurs'],
    kinds: { classic: 2, style: 2, mix: 2 },
  },
  {
    id: 'caviste', label: 'les cavistes', level: 2, pop: 0.3, size: 1.4, price: 4.8, minQuality: 0.65,
    names: ['Le Houblon d\'Or', 'La Cave de Jeanne', 'Bières & Cie'],
    kinds: { style: 3, mix: 2, prestige: 1 },
  },
  {
    id: 'restaurant', label: 'les restaurants', level: 2, pop: 0.4, size: 1.4, price: 4.4, minQuality: 0.6,
    names: ['Brasserie de la Gare', 'L\'Ardoise', 'Le Gourmet', 'Crêperie Ty Breizh'],
    kinds: { classic: 2, style: 2, mix: 1, urgent: 1 },
  },
  {
    id: 'fetes', label: 'les fêtes de village', level: 3, pop: 0.4, size: 2.5, price: 3.2, minQuality: 0.4,
    names: ['Fête du village', 'Comité des fêtes', 'Kermesse de l\'école', 'Club de rugby'],
    kinds: { keg: 3, classic: 2, urgent: 1 },
  },
  {
    id: 'festival', label: 'les festivals', level: 3, pop: 0.6, size: 4, price: 3, minQuality: 0.45,
    names: ['Festival Rock en Fût', 'Fête de la musique', 'Festival des Brasseurs'],
    kinds: { keg: 3, style: 1, classic: 1 },
  },
  {
    id: 'supermarche', label: 'les supermarchés', level: 4, pop: 0.5, size: 5, price: 2.4, minQuality: 0.45,
    names: ['Supermarché Grand Panier', 'Hypermarché du Rond-Point'],
    kinds: { classic: 3, mix: 2 },
  },
  {
    id: 'gastro', label: 'les grandes tables', level: 4, pop: 0.8, size: 0.8, price: 7, minQuality: 0.85,
    names: ['Le Grand Cerf (étoilé)', 'Palace Royal', 'Maison Lumière'],
    kinds: { prestige: 3, style: 1 },
  },
  {
    id: 'export', label: 'l\'export', level: 5, pop: 0.7, size: 5, price: 3.8, minQuality: 0.75,
    names: ['Importateur de Tokyo', 'Distributeur de Montréal', 'Pub de Dublin', 'Bar à bières de Berlin'],
    kinds: { style: 2, mix: 1, prestige: 2 },
  },
];

export const clientTypeById = (id: string) => CLIENT_TYPES.find((c) => c.id === id);

export interface Order {
  id: number;
  /** Profil du client. */
  type: string;
  /** Nom du client. */
  client: string;
  kind: OrderKind;
  /** Bouteilles demandées (fûts pour une commande de fûts). */
  qty: number;
  /** Ce qui est recherché (une tendance, un style), pour les commandes « style », « urgente » et « prestige ». */
  want?: string;
  /** Bières différentes demandées (assortiment). */
  mix?: number;
  minQuality: number;
  /** Paiement à la livraison. */
  reward: number;
  received: number;
  expires: number;
}

/** Taille de référence d'une commande (bouteilles) selon le niveau de la brasserie : de 6 à 24 bouteilles au début. */
export const ORDER_BASE = [15, 80, 300, 1500, 6000] as const;
/** L'ordinateur du stockage : chaque niveau ajoute une place au tableau des commandes. */
export const COMPUTERS: readonly { name: string; slots: number; cost: number }[] = [
  { name: 'Vieux minitel', slots: 2, cost: 0 },
  { name: 'PC d\'occasion', slots: 3, cost: 1500 },
  { name: 'Poste de bureau', slots: 4, cost: 40000 },
  { name: 'Logiciel de gestion', slots: 5, cost: 400000 },
  { name: 'Intelligence logistique', slots: 6, cost: 3000000 },
];
/** Délai entre deux nouvelles commandes (s de jeu) : de 30 à 60 min. */
export const ORDER_GAP_MIN_S = 30 * 60;
export const ORDER_GAP_MAX_S = 60 * 60;
/** Première commande d'une nouvelle partie. */
export const FIRST_ORDER_S = 3 * 60;
/** Validité d'une commande : de 8 à 12 h (2 h pour une urgente). */
export const ORDER_LIFE_MIN_S = 8 * 3600;
export const ORDER_LIFE_MAX_S = 12 * 3600;
export const URGENT_LIFE_S = 2 * 3600;
/** Multiplicateur de paiement par type de commande. */
export const KIND_PAY: Record<OrderKind, number> = { classic: 1, style: 1.3, keg: 1.15, mix: 1.25, urgent: 1.5, prestige: 2.5 };
/** Diamants d'une commande livrée, selon son type : plus elle est difficile, plus elle rapporte. */
export const KIND_GEMS: Record<OrderKind, number> = { classic: 1, keg: 1, style: 2, mix: 2, urgent: 3, prestige: 5 };
/** Qualité exigée à partir de laquelle une commande rapporte un diamant de plus. */
export const DEMANDING_QUALITY = 0.65;

/**
 * Diamants que rapporte une commande : selon son type, +1 si le client est exigeant sur la qualité,
 * +1 pour une commande urgente qui impose aussi un style. Calculé, pas tiré au sort : il s'affiche sur la commande.
 */
export function orderGems(o: Pick<Order, 'kind' | 'minQuality' | 'want'>): number {
  return KIND_GEMS[o.kind] + (o.kind !== 'prestige' && o.minQuality >= DEMANDING_QUALITY ? 1 : 0) + (o.kind === 'urgent' && o.want ? 1 : 0);
}

/** Libellés des types de commandes. */
export const KIND_LABEL: Record<OrderKind, string> = {
  classic: 'Commande', style: 'Style recherché', keg: 'Fûts', mix: 'Assortiment', urgent: 'Urgent', prestige: 'Prestige',
};

/** Grossiste : il reprend n'importe quelle bière buvable (bouteilles ou fûts), à moitié prix environ d'une commande. Prix d'une bouteille de 33 cl. */
export const WHOLESALE_PRICE = 1.6;
export const wholesalePrice = (t: Pick<Tasting, 'quality'>) => WHOLESALE_PRICE * (0.6 + 0.8 * t.quality);

/** Contexte de la brasserie pour tirer une commande. */
export interface OrderContext {
  rng: Rng;
  time: number;
  breweryLevel: number;
  brand: number;
  beers: number;
  storageCap: number;
  kegLiters: number;
  trends: readonly Trend[];
}

/** Profils de clients qui passent commande aujourd'hui. */
export const openTypes = (level: number, brand: number) => CLIENT_TYPES.filter((c) => c.level <= level && c.pop <= brand + 1e-9);

function pickWeighted<T extends string>(rng: Rng, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  let r = rng.next() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) if ((r -= w) <= 0) return k;
  return entries[0]![0];
}

/** Tire une nouvelle commande. */
export function drawOrder(id: number, ctx: OrderContext): Order {
  const { rng } = ctx;
  const types = openTypes(ctx.breweryLevel, ctx.brand);
  const type = types[Math.floor(rng.next() * types.length)]!;
  let kind = pickWeighted(rng, type.kinds);
  if (kind === 'mix' && ctx.beers < 2) kind = 'classic';
  let bottles = (ORDER_BASE[ctx.breweryLevel - 1] ?? 15) * type.size * (0.6 + 0.8 * rng.next());
  if (kind === 'urgent') bottles *= 0.6;
  if (kind === 'prestige') bottles *= 0.5;
  bottles = Math.max(6, Math.round(Math.min(bottles, ctx.storageCap * 0.75) / 6) * 6);
  const order: Order = {
    id, type: type.id, client: type.names[Math.floor(rng.next() * type.names.length)]!, kind, qty: bottles,
    minQuality: kind === 'prestige' ? 0.85 : type.minQuality, reward: 0, received: ctx.time,
    expires: ctx.time + (kind === 'urgent' ? URGENT_LIFE_S : ORDER_LIFE_MIN_S + (ORDER_LIFE_MAX_S - ORDER_LIFE_MIN_S) * rng.next()),
  };
  if (kind === 'style' || kind === 'urgent' || kind === 'prestige') {
    // souvent une tendance du moment
    const pool = rng.next() < 0.7 && ctx.trends.length ? ctx.trends.map((t) => t.id) : TRENDS.map((t) => t.id);
    if (kind !== 'urgent' || rng.next() < 0.5) order.want = pool[Math.floor(rng.next() * pool.length)];
  }
  if (kind === 'mix') {
    order.mix = Math.min(3, ctx.beers);
    order.qty = Math.max(order.mix * 6, Math.round(order.qty / (order.mix * 6)) * order.mix * 6);
  }
  if (kind === 'keg') order.qty = Math.max(1, Math.round((bottles * 0.33) / ctx.kegLiters));
  // paiement fixe, annoncé : plus la marque est connue, mieux elle est payée
  const volume = kind === 'keg' ? (order.qty * ctx.kegLiters) / 0.33 : order.qty;
  order.reward = Math.round(volume * type.price * KIND_PAY[kind] * (0.8 + 0.4 * clamp01(ctx.brand)));
  return order;
}

/** La bière convient-elle à la commande (qualité, style recherché) ? */
export function fits(o: Order, t: Tasting): boolean {
  if (t.quality < o.minQuality) return false;
  const want = o.want ? trendById(o.want) : undefined;
  return !want || want.test(t);
}

/** Ce que demande la commande, en quelques mots. */
export function orderAsk(o: Order): string {
  const want = o.want ? trendById(o.want)?.short : undefined;
  const what = o.kind === 'keg' ? `${o.qty} fût${o.qty > 1 ? 's' : ''}` : `${o.qty} btl`;
  const parts = [what];
  if (o.mix) parts.push(`${o.mix} bières différentes`);
  if (want) parts.push(want);
  if (o.kind === 'prestige') parts.push('Excellente');
  return parts.join(' · ');
}
