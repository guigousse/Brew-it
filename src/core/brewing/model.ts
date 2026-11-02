/**
 * Modèle de brassage — fonctions pures, inspirées des vraies pratiques brassicoles.
 * Chaque étape produit ses mesures et ses défauts ; la qualité finale = 1 − somme des pénalités.
 * Tout est exprimé pour un lot de référence de 20 L (24 L d'eau d'empâtage).
 */
import { clamp, clamp01 } from '../math';
import { STRAINS, YEAST_DEATH_TEMP, type StrainId } from './strains';
import { INFECTION, OXIDATION } from '../stations';

export interface Defect {
  id: string;
  /** Ce que le dégustateur perçoit, et pourquoi. */
  label: string;
  penalty: number;
}
const defect = (id: string, label: string, penalty: number): Defect => ({ id, label, penalty: clamp(penalty, 0, 1) });

/** Réglages d'un brassin (la « recette »), pour 20 L. */
export interface Recipe {
  grainKg: number;
  crush: number; // finesse de mouture, 1 (grossière) → 10 (farine)
  mashTemp: number;
  mashTime: number;
  hopsBitter: number; // g, ajoutés en début d'ébullition
  hopsAroma: number; // g, ajoutés en fin d'ébullition
  boilTime: number;
  pitchTemp: number; // °C du moût envoyé au fermenteur
  strain: StrainId;
  fermentTemp: number;
  fermentDays: number;
  gardeTemp: number;
  gardeDays: number;
  priming: number; // g/L de sucre de refermentation en bouteille
}

/** Niveau (1 à 5) de chaque appareil : il module précision, risques et finesse. */
export interface Levels {
  mill: number;
  mash: number;
  boil: number;
  cooler: number;
  fermenter: number;
  conditioning: number;
  bottling: number;
}

/** Ce que les appareils ont réellement fait (températures avec leur imprécision, tirage au sort de l'infection). */
export interface Actual {
  mashTemp: number;
  pitchTemp: number;
  fermentTemp: number;
  gardeTemp: number;
  /** Tirage 0..1 pour le risque d'infection au refroidissement. */
  infectionRoll: number;
  /** Doses réellement mises (sinon celles de la recette). */
  grainKg?: number;
  crush?: number;
  hopsBitter?: number;
  hopsAroma?: number;
  priming?: number;
  /** Petits défauts cumulés du matériel (pénalité de qualité). */
  rough?: number;
  /** Chance du brassin (0 = bon jour, 1 = mauvais jour). */
  luck?: number;
}

export interface Tasting {
  abv: number;
  ibu: number;
  og: number;
  fg: number;
  aroma: number; // 0..1, houblon aromatique
  fruity: number; // 0..1
  clarity: number; // 0..1
  co2: number; // volumes de CO2
  quality: number;
  defects: Defect[];
  /** Part des bouteilles perdues (bouteilles qui explosent). */
  lost: number;
  style: string;
  color: string;
}

export const REF_LITERS = 20;
const WATER_L = 24;
const POINTS_PER_KG_PER_L = 230;
const HOPS_ALPHA = 0.06;

/** Activité des enzymes : β-amylase vers 60-65 °C, α-amylase vers 68-72 °C, détruites au-delà de 78 °C. */
export function conversion(temp: number): number {
  if (temp <= 50) return 0.05;
  if (temp < 60) return 0.05 + 0.85 * ((temp - 50) / 10);
  if (temp <= 70) return 0.9 + 0.1 * Math.min(1, (temp - 60) / 4);
  if (temp <= 78) return 1 - 0.9 * ((temp - 70) / 8);
  return 0.05;
}

/** Rendement selon la mouture : trop grossière, l'eau n'atteint pas l'amidon. */
export const crushEfficiency = (c: number) => (c <= 1 ? 0.6 : c < 6 ? 0.6 + 0.4 * ((c - 1) / 5) : c <= 8 ? 1 : 1.03);

const tinseth = (og: number, minutes: number, grams: number, liters: number) =>
  liters > 0 ? (1.65 * Math.pow(0.000125, og / 1000) * ((1 - Math.exp(-0.04 * minutes)) / 4.15) * HOPS_ALPHA * grams * 1000) / liters : 0;

export function brew(r: Recipe, lv: Levels, a: Actual): Tasting {
  const defects: Defect[] = [];
  const s = STRAINS[r.strain];
  // Ce que les appareils ont réellement dosé (imprécision du matériel).
  const grainKg = a.grainKg ?? r.grainKg;
  const crush = a.crush ?? r.crush;
  const hopsBitter = a.hopsBitter ?? r.hopsBitter;
  const hopsAroma = a.hopsAroma ?? r.hopsAroma;
  const priming = a.priming ?? r.priming;
  if ((a.rough ?? 0) >= 0.02) defects.push(defect('rough', 'Manque de netteté : matériel rudimentaire, chaque étape un peu approximative', a.rough ?? 0));

  // --- Écarts entre ta recette et ce que les appareils ont réellement fait (précision du matériel)
  let small = 0;
  const drift = (id: string, label: string, penalty: number) => {
    if (penalty >= 0.025) defects.push(defect(id, label, penalty));
    else small += penalty;
  };
  const deg = (x: number) => `${Math.round(x)} °C`;
  const pct = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)} %`;
  const dMash = a.mashTemp - r.mashTemp;
  drift('driftMash', `Empâtage à ${deg(a.mashTemp)} au lieu de ${deg(r.mashTemp)} : le corps n'est pas celui de ta recette`, 0.012 * dMash * dMash);
  const dFerm = a.fermentTemp - r.fermentTemp;
  drift('driftFerm', `Fermentation à ${deg(a.fermentTemp)} au lieu de ${deg(r.fermentTemp)} : arômes de levure brouillés`, 0.012 * dFerm * dFerm);
  const dPitch = a.pitchTemp - r.pitchTemp;
  const dGarde = a.gardeTemp - r.gardeTemp;
  drift('driftCold', 'Températures de refroidissement et de garde imprécises', 0.004 * dPitch * dPitch + 0.005 * dGarde * dGarde);
  const fGrain = grainKg / r.grainKg - 1;
  drift('dosGrain', `Malt mal pesé (${pct(fGrain)}) : densité différente de ta recette`, 1.2 * fGrain * fGrain);
  const fHops = r.hopsBitter + r.hopsAroma > 0 ? (hopsBitter + hopsAroma) / (r.hopsBitter + r.hopsAroma) - 1 : 0;
  drift('dosHops', `Houblon mal dosé (${pct(fHops)}) : amertume et arômes déséquilibrés`, 1.0 * fHops * fHops);
  const fSugar = r.priming > 0 ? priming / r.priming - 1 : 0;
  drift('dosSugar', `Sucre de refermentation approximatif (${pct(fSugar)}) : bulles irrégulières`, 0.8 * fSugar * fSugar);
  if (small >= 0.01) defects.push(defect('small', 'Petites imprécisions des appareils', small));

  // --- Concassage et empâtage
  if (crush >= 9) defects.push(defect('crush', 'Âpre et astringente : mouture trop fine, la filtration a colmaté', (0.12 + (crush - 9) * 0.1) / (lv.mill >= 5 ? 4 : lv.mill >= 4 ? 2 : 1)));
  const volume = Math.max(1, WATER_L - grainKg);
  const timeFactor = (1 - Math.exp(-r.mashTime / 25)) / (1 - Math.exp(-60 / 25));
  const converted = clamp(conversion(a.mashTemp) * timeFactor, 0, 1.05);
  let og = (grainKg * POINTS_PER_KG_PER_L * 0.75 * converted * crushEfficiency(crush)) / volume;
  const fermentability = a.mashTemp <= 62 ? 0.88 : clamp(0.88 - (a.mashTemp - 62) * 0.028, 0.5, 0.88);
  if (converted < 0.4) defects.push(defect('starch', 'Trouble, goût de farine crue : l\'amidon n\'a presque pas été converti en sucre', 0.45));
  else if (converted < 0.7) defects.push(defect('starch', 'Farineuse et trouble : conversion de l\'amidon incomplète', 0.2));

  // --- Ébullition
  const evap = 1 - (0.1 * r.boilTime) / 60;
  const boiled = volume * Math.max(0.5, evap);
  og = (og * volume) / boiled;
  const ibu = tinseth(og, r.boilTime, hopsBitter, boiled) + tinseth(og, 5, hopsAroma, boiled);
  const aroma = clamp01(1 - Math.exp(-hopsAroma / 40));
  const dmsLimit = lv.boil >= 3 ? 20 : 30;
  if (r.boilTime < dmsLimit) defects.push(defect('dms', 'Goût de maïs cuit (DMS) : ébullition trop courte', 0.1 + 0.3 * ((dmsLimit - r.boilTime) / dmsLimit)));

  // --- Refroidissement et ensemencement
  if (a.pitchTemp > YEAST_DEATH_TEMP) {
    defects.push(defect('dead', `Levure morte : le moût était à ${Math.round(a.pitchTemp)} °C quand on l'a ajoutée. Pas de fermentation.`, 1));
    return finish({ og, fg: og, abv: 0, ibu, aroma, fruity: 0, clarity: 0.2, co2: 0, defects, lost: 0, strain: r.strain });
  }
  if (a.pitchTemp > s.tempMax + 5) defects.push(defect('hotpitch', 'Démarrage trop chaud : notes de solvant dès les premières heures', 0.12));
  const infectionRisk = INFECTION[lv.cooler] ?? 0;
  if (a.infectionRoll < infectionRisk) defects.push(defect('infection', 'Aigre et vinaigrée : contamination pendant un refroidissement trop lent', 0.3));

  // --- Fermentation
  let attenuation = clamp(s.attenuation * (fermentability / 0.75), 0.3, 0.95);
  let needed: number = s.baseDays;
  const t = a.fermentTemp;
  if (t < s.tempMin) {
    const lag = s.tempMin - t;
    attenuation *= Math.max(0.15, 1 - 0.12 * lag);
    needed *= 1 + 0.25 * lag;
    if (lag >= 6) defects.push(defect('stuck', 'Fermentation bloquée : trop froid pour cette levure, sucrée et plate', 0.45));
    else if (lag >= 2) defects.push(defect('sluggish', 'Fermentation paresseuse : un peu trop sucrée', 0.12));
  }
  if (t > s.tempMax) {
    const over = t - s.tempMax;
    if (over >= 4) defects.push(defect('fusel', 'Goût de solvant et alcool qui brûle (fusel) : fermentation beaucoup trop chaude', 0.12 * over));
    else defects.push(defect('esters', 'Fruité excessif, notes de banane : fermentation un peu chaude', 0.05 * over));
  }
  if (r.fermentDays < needed) {
    const done = r.fermentDays / needed;
    attenuation *= Math.max(0.2, done);
    if (done < 0.7) defects.push(defect('unfinished', 'Fermentation arrêtée trop tôt : sucrée et peu alcoolisée', 0.25));
    else defects.push(defect('young', 'Un peu jeune : la levure n\'a pas tout à fait fini', 0.06));
  }
  let fg = og * (1 - attenuation);
  let abv = (og - fg) * 0.131;
  if (abv > s.tolerance) {
    abv = s.tolerance;
    fg = og - abv / 0.131;
    defects.push(defect('tolerance', 'Sirupeuse : trop de sucre, la levure a abandonné avant la fin', 0.25));
  }
  const tNorm = clamp01((t - s.tempMin) / (s.tempMax - s.tempMin));
  const fruity = clamp01(s.esterFactor * (0.3 + 0.7 * tNorm) + (t > s.tempMax ? 0.06 * (t - s.tempMax) : 0));

  // --- Garde
  if (r.gardeDays < s.gardeNeeded) {
    const p = 0.3 * (1 - r.gardeDays / s.gardeNeeded);
    if (p > 0.03) defects.push(defect('green', 'Goût de pomme verte et de beurre : la bière n\'a pas eu le temps de mûrir', p));
  }
  if (r.strain === 'lager' && a.gardeTemp > 12) defects.push(defect('sulfur', 'Lager gardée trop chaude : notes soufrées', 0.15));
  const cold = a.gardeTemp <= 4 ? 1 : a.gardeTemp <= 10 ? 0.5 : 0;
  const clarity = clamp01(0.35 + 0.35 * cold + 0.2 * Math.min(1, r.gardeDays / 7) + (lv.conditioning >= 5 ? 0.2 : lv.conditioning >= 4 ? 0.1 : 0) - (converted < 0.7 ? 0.3 : 0));

  // --- Équilibre
  const bugu = og > 0 ? ibu / og : 0;
  if (bugu > 1.6) defects.push(defect('harsh', 'Amertume agressive : beaucoup trop de houblon pour le corps de la bière', Math.min(0.5, 0.1 + (bugu - 1.6) * 0.4)));
  else if (bugu < 0.12 && og > 20) defects.push(defect('cloying', 'Écœurante : pas assez de houblon pour équilibrer le sucre', fg > 15 ? 0.2 : 0.12));
  if (abv < 2.5) defects.push(defect('watery', 'Aqueuse, sans goût : pas assez de sucre extrait du malt', abv < 1 ? 0.45 : 0.25));
  if (abv > 10) defects.push(defect('hot', 'Très forte en alcool, chaude en bouche', 0.1));

  // --- Embouteillage et refermentation
  const co2 = 0.85 + priming * 0.27;
  let lost = 0;
  if (co2 < 1.8) defects.push(defect('flat', 'Plate : pas assez de sucre pour faire les bulles en bouteille', 0.15));
  else if (co2 > 4.2) {
    defects.push(defect('bombs', 'Des bouteilles explosent ! Beaucoup trop de sucre de refermentation', 0.35));
    lost = 0.4;
  } else if (co2 > 3.2) defects.push(defect('gushing', 'La mousse déborde à l\'ouverture : trop de sucre de refermentation', 0.15));
  const oxidation = OXIDATION[lv.bottling] ?? 0;
  if (oxidation > 0) defects.push(defect('oxidation', 'Léger goût de carton : un peu d\'oxygène à l\'embouteillage', oxidation));

  return finish({ og, fg, abv, ibu, aroma, fruity, clarity, co2, defects, lost, strain: r.strain });
}

function finish(x: Omit<Tasting, 'quality' | 'style' | 'color'> & { strain: StrainId }): Tasting {
  const quality = clamp01(1 - x.defects.reduce((s, d) => s + d.penalty, 0));
  const { strain, ...rest } = x;
  return { ...rest, quality, style: styleOf(x.abv, x.ibu, x.aroma, x.fruity, strain), color: colorOf(x.og) };
}

export function colorOf(og: number): string {
  if (og < 35) return 'Paille';
  if (og < 50) return 'Blonde';
  if (og < 65) return 'Cuivrée';
  return 'Ambrée';
}

export function styleOf(abv: number, ibu: number, aroma: number, fruity: number, strain: StrainId): string {
  if (abv < 1) return 'Moût non fermenté';
  if (strain === 'lager') return abv > 6 ? 'Bock' : 'Lager';
  if (strain === 'saison') return 'Saison';
  if (ibu >= 45 && aroma >= 0.5) return abv >= 7 ? 'Double IPA' : 'IPA';
  if (abv >= 8) return fruity > 0.4 ? 'Triple' : 'Forte';
  if (ibu >= 35) return 'Pale Ale';
  if (abv < 4.2) return 'Session';
  return fruity > 0.4 ? 'Ale fruitée' : 'Blonde';
}

export type Verdict = 'Imbuvable' | 'Médiocre' | 'Correcte' | 'Bonne' | 'Excellente';
export function verdictOf(q: number): Verdict {
  if (q < 0.3) return 'Imbuvable';
  if (q < 0.5) return 'Médiocre';
  if (q < 0.7) return 'Correcte';
  if (q < 0.85) return 'Bonne';
  return 'Excellente';
}
export const DRINKABLE_MIN = 0.3;

/** La recette de Gaston : une blonde simple et réussie, préréglée au démarrage. */
export const GASTON_RECIPE: Recipe = {
  grainKg: 4.5, crush: 6, mashTemp: 66, mashTime: 60, hopsBitter: 25, hopsAroma: 10, boilTime: 60,
  pitchTemp: 20, strain: 'ale_us', fermentTemp: 19, fermentDays: 6, gardeTemp: 4, gardeDays: 4, priming: 6,
};
