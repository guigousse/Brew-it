/**
 * Formules de brassage — inspirées des vraies pratiques, fonctions pures testées unitairement.
 * Chaque étape renvoie ses mesures (densité, amertume, alcool…) et les défauts qu'elle introduit.
 * La qualité finale = 1 − somme des pénalités des défauts.
 */
import { STRAINS, type StrainId } from '../content/strains';
import { clamp, clamp01 } from '../math';

/** Conversion des durées « brassicoles » en secondes réelles de jeu. */
export const TIME_SCALE = {
  /** 1 minute d'empâtage/ébullition = 0.5 s réelle (60 min → 30 s). */
  brewMinute: 0.5,
  /** 1 jour de fermentation/garde = 20 s réelles. */
  brewDay: 20,
};

const POINTS_PER_KG_PER_L = 230; // rendement d'un malt pâle dans notre installation
const GRAIN_ABSORPTION_L_PER_KG = 1;
const HOPS_ALPHA = 0.06; // houblon amérisant classique (6 % d'acides alpha)
const EVAPORATION_PER_HOUR = 0.1;

export interface Defect {
  id: string;
  /** Ce que le dégustateur perçoit, et pourquoi. */
  label: string;
  penalty: number;
}

const defect = (id: string, label: string, penalty: number): Defect => ({ id, label, penalty: clamp(penalty, 0, 1) });

// ------------------------------------------------------------------ empâtage

/**
 * Activité des enzymes du malt selon la température : la bêta-amylase travaille vers 60-65 °C, l'alpha-amylase
 * vers 68-72 °C ; en dessous de 60 °C la conversion est lente, au-dessus de 75 °C les enzymes sont détruites.
 */
export function conversion(temp: number): number {
  if (temp <= 50) return 0.05;
  if (temp < 60) return 0.05 + 0.85 * ((temp - 50) / 10);
  if (temp <= 70) return 0.9 + 0.1 * Math.min(1, (temp - 60) / 4);
  if (temp <= 78) return 1 - 0.9 * ((temp - 70) / 8);
  return 0.05;
}

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
  defects: Defect[];
}

export function mash({ grainKg, waterL, mashTemp, mashTimeMin }: MashInput): MashOutput {
  const volume = Math.max(0, waterL - grainKg * GRAIN_ABSORPTION_L_PER_KG);
  if (volume <= 0) return { og: 0, fermentability: 0, volume: 0, defects: [defect('nowater', 'Pâte de malt sans liquide : trop de grain pour l\'eau', 1)] };
  const timeFactor = (1 - Math.exp(-mashTimeMin / 25)) / (1 - Math.exp(-60 / 25)); // 60 min = référence
  const converted = clamp(conversion(mashTemp) * timeFactor, 0, 1.05);
  const efficiency = 0.75 * converted;
  const og = (grainKg * POINTS_PER_KG_PER_L * efficiency) / volume;
  // Basse température → sucres simples très fermentescibles (bière sèche) ; haute → dextrines (corps, douceur).
  const fermentability = mashTemp <= 62 ? 0.88 : clamp(0.88 - (mashTemp - 62) * 0.028, 0.5, 0.88);
  const defects: Defect[] = [];
  if (converted < 0.4) defects.push(defect('starch', 'Trouble, goût de farine crue : l\'amidon n\'a presque pas été converti en sucre (température ou durée d\'empâtage)', 0.45));
  else if (converted < 0.7) defects.push(defect('starch', 'Légèrement trouble et farineuse : conversion de l\'amidon incomplète', 0.2));
  const ratio = waterL / Math.max(grainKg, 0.001);
  if (ratio < 2.5) defects.push(defect('thick', 'Empâtage trop épais : rendement médiocre', 0.05));
  return { og, fermentability, volume, defects };
}

// ------------------------------------------------------------------ ébullition

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
  defects: Defect[];
}

/** Amertume selon Tinseth : dépend de la densité, du temps d'ébullition et de la dose de houblon. */
export function boil({ og, volume, hopsGrams, boilMin }: BoilInput): BoilOutput {
  const bigness = 1.65 * Math.pow(0.000125, og / 1000);
  const timeFactor = (1 - Math.exp(-0.04 * boilMin)) / 4.15;
  const ibu = volume > 0 ? (bigness * timeFactor * HOPS_ALPHA * hopsGrams * 1000) / volume : 0;
  const outVolume = volume * Math.max(0.5, 1 - (EVAPORATION_PER_HOUR * boilMin) / 60);
  const outOg = outVolume > 0 ? (og * volume) / outVolume : 0;
  const defects: Defect[] = [];
  // Le DMS (goût de maïs cuit) s'évacue avec la vapeur : il faut une ébullition franche et assez longue.
  if (boilMin < 30) defects.push(defect('dms', 'Goût de maïs cuit (DMS) : ébullition trop courte', 0.1 + 0.3 * ((30 - boilMin) / 30)));
  return { og: outOg, volume: outVolume, ibu, defects };
}

// ------------------------------------------------------------------ fermentation et garde

export interface FermentInput {
  og: number;
  fermentability: number;
  ibu: number;
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
  defects: Defect[];
}

export function ferment({ og, fermentability, ibu, strain, temp, gardeDays }: FermentInput): FermentOutput {
  const s = STRAINS[strain];
  const defects: Defect[] = [];
  let attenuation = clamp(s.attenuation * (fermentability / 0.75), 0.3, 0.95);
  let days: number = s.baseDays;

  // Trop froid : la levure ralentit, puis s'endort.
  if (temp < s.tempMin) {
    const lag = s.tempMin - temp;
    attenuation *= Math.max(0.15, 1 - 0.12 * lag);
    days *= 1 + 0.25 * lag;
    if (lag >= 6) defects.push(defect('stuck', 'Fermentation bloquée : trop froid pour cette levure, la bière reste sucrée et plate', 0.45));
    else if (lag >= 2) defects.push(defect('sluggish', 'Fermentation incomplète : un peu trop sucrée (température trop basse)', 0.12));
  }
  // Trop chaud : esters puis alcools de fusel.
  if (temp > s.tempMax) {
    const over = temp - s.tempMax;
    if (over >= 4) defects.push(defect('fusel', 'Goût de solvant et alcool qui brûle (fusel) : fermentation beaucoup trop chaude', 0.12 * over));
    else defects.push(defect('esters', 'Fruité excessif, notes de banane : fermentation un peu chaude', 0.05 * over));
  }

  let fg = og * (1 - attenuation);
  let abv = (og - fg) * 0.131;
  if (abv > s.tolerance) {
    abv = s.tolerance;
    fg = og - abv / 0.131;
    defects.push(defect('tolerance', 'Sirupeuse : trop de sucre, la levure a abandonné avant la fin', 0.25));
  }

  const tNorm = clamp01((temp - s.tempMin) / (s.tempMax - s.tempMin));
  const fruity = clamp01(s.esterFactor * (0.3 + 0.7 * tNorm) + (temp > s.tempMax ? 0.06 * (temp - s.tempMax) : 0));

  // Garde : les arômes de jeunesse (acétaldéhyde = pomme verte, diacétyle = beurre) disparaissent avec le temps.
  if (gardeDays < s.gardeNeeded) {
    const missing = 1 - gardeDays / s.gardeNeeded;
    const p = 0.3 * missing;
    if (p > 0.03) defects.push(defect('green', 'Goût de pomme verte et de beurre : la bière n\'a pas eu le temps de mûrir (garde trop courte)', p));
  }

  // Équilibre amertume / sucre (rapport BU:GU des brasseurs).
  const bugu = og > 0 ? ibu / og : 0;
  if (bugu > 1.6) defects.push(defect('harsh', 'Amertume agressive : beaucoup trop de houblon pour le corps de la bière', Math.min(0.5, 0.1 + (bugu - 1.6) * 0.4)));
  else if (bugu < 0.12 && og > 20) defects.push(defect('cloying', 'Écœurante : pas assez de houblon pour équilibrer le sucre', fg > 15 ? 0.2 : 0.12));

  if (abv < 2.5) defects.push(defect('watery', 'Aqueuse, sans goût : pas assez de sucre extrait du malt', abv < 1 ? 0.45 : 0.25));
  if (abv > 10) defects.push(defect('hot', 'Très forte en alcool, chaude en bouche', 0.1));

  return { abv, fg, fruity, days, defects };
}

// ------------------------------------------------------------------ verdict

export const qualityFrom = (defects: readonly Defect[]) => clamp01(1 - defects.reduce((s, d) => s + d.penalty, 0));

export type Verdict = 'Imbuvable' | 'Médiocre' | 'Correcte' | 'Bonne' | 'Excellente';

export function verdictOf(quality: number): Verdict {
  if (quality < 0.3) return 'Imbuvable';
  if (quality < 0.5) return 'Médiocre';
  if (quality < 0.7) return 'Correcte';
  if (quality < 0.85) return 'Bonne';
  return 'Excellente';
}

/** Une bière imbuvable ne se vend pas. */
export const DRINKABLE_MIN = 0.3;

export function colorLabel(og: number): string {
  if (og < 35) return 'Paille';
  if (og < 50) return 'Blonde dorée';
  if (og < 65) return 'Cuivrée';
  return 'Ambrée foncée';
}
