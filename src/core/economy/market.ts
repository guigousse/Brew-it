import type { BatchProfile } from '../brewing/batches';
import type { ItemId } from '../content/items';
import { clamp01 } from '../math';
import type { Rng } from '../rng';

/** Prix d'achat des matières premières (livraisons). */
export const ITEM_PRICES: Partial<Record<ItemId, number>> = {
  malt: 1.2,
  hops: 2,
  yeast: 4,
  bottle: 0.3,
};

/** Profil recherché par le marché à un instant donné. */
export interface Trend {
  name: string;
  ibu: number;
  abv: number;
  fruity: number;
}

export interface Label {
  name: string;
  multiplier: number;
  expiresAt: number; // temps de jeu (s)
}

export interface MarketState {
  trend: Trend;
  nextTrendAt: number;
  labels: Label[];
}

const TRENDS: readonly Trend[] = [
  { name: 'IPA mania', ibu: 60, abv: 6.5, fruity: 0.4 },
  { name: 'Session légère', ibu: 25, abv: 4, fruity: 0.2 },
  { name: 'Fruitée & ronde', ibu: 15, abv: 5.5, fruity: 0.8 },
  { name: 'Triple de caractère', ibu: 30, abv: 9, fruity: 0.6 },
  { name: 'Lager désaltérante', ibu: 20, abv: 4.8, fruity: 0.05 },
];

const TREND_DURATION = 300; // s

export const initialMarket = (): MarketState => ({ trend: TRENDS[1]!, nextTrendAt: TREND_DURATION, labels: [] });

export function updateMarket(m: MarketState, time: number, rng: Rng): void {
  if (time >= m.nextTrendAt) {
    m.trend = TRENDS[Math.floor(rng.next() * TRENDS.length)]!;
    m.nextTrendAt = time + TREND_DURATION;
  }
  m.labels = m.labels.filter((l) => l.expiresAt > time);
}

/** Adéquation d'un profil à la tendance (0..1). */
export function trendMatch(p: BatchProfile, t: Trend): number {
  const d = Math.hypot((p.ibu - t.ibu) / 40, (p.abv - t.abv) / 4, (p.fruity - t.fruity) / 0.6);
  return clamp01(1 - d / 2);
}

/** Attrait commercial (0..1) : adéquation à la tendance × qualité. Pilote la demande en point de vente. */
export const appeal = (p: BatchProfile, m: MarketState): number => (0.4 + 0.6 * trendMatch(p, m.trend)) * p.quality;

export function salePrice(p: BatchProfile, m: MarketState, basePrice: number): number {
  const labelBonus = m.labels.reduce((acc, l) => acc * l.multiplier, 1);
  return basePrice * (0.6 + 0.8 * trendMatch(p, m.trend)) * (0.5 + 0.5 * p.quality) * labelBonus;
}
