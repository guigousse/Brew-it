/**
 * Formules de brassage (simplifiées mais inspirées des vraies) — fonctions pures, testées unitairement.
 * Ce module ne connaît ni la grille ni les bâtiments : il transforme des réglages en profil de bière.
 */
import { STRAINS, type StrainId } from '../content/strains';
import { clamp, clamp01 } from '../math';

/** Conversion des durées « brassicoles » en secondes réelles de jeu. Réglages d'équilibrage. */
export const TIME_SCALE = {
  /** 1 minute d'empâtage/ébullition = 0.5 s réelle (60 min → 30 s). */
  brewMinute: 0.5,
  /** 1 jour de fermentation/garde = 20 s réelles. */
  brewDay: 20,
};

const POINTS_PER_KG_PER_L = 307; // ~5 kg de malt dans 23 L à 75 % d'efficacité ≈ 1.050
const GRAIN_ABSORPTION_L_PER_KG = 1;
const HOPS_ALPHA = 0.1;
const EVAPORATION_PER_HOUR = 0.1;

export interface MashInput {
  grainKg: number;
  waterL: number;
  mashTemp: number;
  mashTimeMin: number;
}

export interface MashOutput {
  og: number;
  fermentability: number;
  volume: number;
  quality: number;
}

export function mash({ grainKg, waterL, mashTemp, mashTimeMin }: MashInput): MashOutput {
  const volume = Math.max(0, waterL - grainKg * GRAIN_ABSORPTION_L_PER_KG);
  if (volume <= 0) return { og: 0, fermentability: 0, volume: 0, quality: 0 };
  // Hors de la plage d'activité des enzymes (60–75 °C), la conversion s'effondre.
  const enzymeActivity = mashTemp < 60 ? clamp01(1 - (60 - mashTemp) * 0.1) : mashTemp > 75 ? clamp01(1 - (mashTemp - 75) * 0.15) : 1;
  const efficiency = 0.75 * clamp01(mashTimeMin / 60) * enzymeActivity;
  const og = (grainKg * POINTS_PER_KG_PER_L * efficiency) / volume;
  // Basse température → bêta-amylase → moût très fermentescible (bière sèche). Haute → corps, sucres résiduels.
  const fermentability = clamp(0.85 - (mashTemp - 64) * 0.033, 0.5, 0.9);
  // Un empâtage trop épais (< 2.5 L/kg) ou trop dilué (> 5 L/kg) pénalise la qualité.
  const ratio = waterL / Math.max(grainKg, 0.001);
  const quality = ratio < 2.5 ? 0.85 : ratio > 5 ? 0.9 : 1;
  return { og, fermentability, volume, quality };
}

export interface BoilInput {
  og: number;
  volume: number;
  hopsGrams: number;
  boilMin: number;
}

export interface BoilOutput {
  og: number;
  volume: number;
  ibu: number;
  quality: number;
}

/** Amertume selon Tinseth : dépend de la densité, du temps d'ébullition et de la dose de houblon. */
export function boil({ og, volume, hopsGrams, boilMin }: BoilInput): BoilOutput {
  const bigness = 1.65 * Math.pow(0.000125, og / 1000);
  const timeFactor = (1 - Math.exp(-0.04 * boilMin)) / 4.15;
  const ibu = volume > 0 ? (bigness * timeFactor * HOPS_ALPHA * hopsGrams * 1000) / volume : 0;
  const outVolume = volume * Math.max(0.5, 1 - (EVAPORATION_PER_HOUR * boilMin) / 60);
  const outOg = outVolume > 0 ? (og * volume) / outVolume : 0;
  // Ébullition trop courte : DMS (goût de maïs cuit).
  const quality = boilMin < 30 ? 0.8 : 1;
  return { og: outOg, volume: outVolume, ibu, quality };
}

export interface FermentInput {
  og: number;
  fermentability: number;
  strain: StrainId;
  temp: number;
  gardeDays: number;
}

export interface FermentOutput {
  abv: number;
  fg: number;
  fruity: number;
  /** Durée de fermentation primaire (jours brassicoles), hors garde. */
  days: number;
  quality: number;
}

export function ferment({ og, fermentability, strain, temp, gardeDays }: FermentInput): FermentOutput {
  const s = STRAINS[strain];
  const attenuation = clamp(s.attenuation * (fermentability / 0.75), 0.4, 0.95);
  const fg = og * (1 - attenuation);
  const abv = (og - fg) * 0.131;

  let quality = 1;
  let days = s.baseDays;
  if (temp > s.tempMax) quality *= Math.max(0.3, 1 - (temp - s.tempMax) * 0.08); // alcools de fusel
  if (temp < s.tempMin) days *= 1 + (s.tempMin - temp) * 0.15; // levure paresseuse

  const tNorm = clamp01((temp - s.tempMin) / (s.tempMax - s.tempMin));
  const fruity = clamp01(s.esterFactor * (0.3 + 0.7 * tNorm) + (temp > s.tempMax ? 0.05 * (temp - s.tempMax) : 0));

  // La garde affine la bière ; une lager en a besoin de beaucoup plus.
  const idealGarde = strain === 'lager' ? 14 : 3;
  quality *= 0.85 + 0.15 * clamp01(gardeDays / idealGarde);

  return { abv, fg, fruity, days, quality };
}
