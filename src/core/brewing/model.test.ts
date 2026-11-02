import { brew, conversion, GASTON_RECIPE, verdictOf, type Actual, type Levels, type Recipe } from './model';
import { executeAll } from './execution';
import { Rng } from '../rng';

const L1: Levels = { mill: 1, mash: 1, boil: 1, cooler: 1, fermenter: 1, conditioning: 1, bottling: 1 };
const L3: Levels = { mill: 4, mash: 4, boil: 4, cooler: 4, fermenter: 4, conditioning: 4, bottling: 4 };
const exact = (r: Recipe, roll = 0.99): Actual => ({ mashTemp: r.mashTemp, pitchTemp: r.pitchTemp, fermentTemp: r.fermentTemp, gardeTemp: r.gardeTemp, infectionRoll: roll });
const taste = (patch: Partial<Recipe> = {}, lv = L3) => {
  const r = { ...GASTON_RECIPE, ...patch };
  return brew(r, lv, exact(r));
};
const ids = (t: { defects: { id: string }[] }) => t.defects.map((d) => d.id);

describe('modèle de brassage', () => {
  it('la recette de Gaston est excellente avec du bon matériel', () => {
    const t = taste();
    expect(verdictOf(t.quality)).toBe('Excellente');
    expect(t.abv).toBeGreaterThan(4.3);
    expect(t.abv).toBeLessThan(5.8);
    expect(t.style).toBe('Blonde');
  });

  it('avec le matériel de départ, un léger goût d\'oxydation à l\'embouteillage', () => {
    expect(ids(taste({}, L1))).toEqual(['oxidation']);
  });

  it('enzymes : actives entre 60 et 72 °C, détruites au-delà de 78 °C', () => {
    expect(conversion(66)).toBe(1);
    expect(conversion(80)).toBeLessThan(0.1);
    const t = taste({ mashTemp: 82 });
    expect(ids(t)).toEqual(expect.arrayContaining(['starch', 'watery']));
    expect(verdictOf(t.quality)).toBe('Imbuvable');
  });

  it('mouture : trop grossière = faible rendement ; trop fine = âpre', () => {
    expect(taste({ crush: 2 }).abv).toBeLessThan(taste().abv * 0.85);
    expect(ids(taste({ crush: 10 }, L1))).toContain('crush');
  });

  it('houblon : l\'ajout tardif donne l\'arôme, l\'ajout précoce l\'amertume', () => {
    const bitter = taste({ hopsBitter: 80, hopsAroma: 0 });
    const aroma = taste({ hopsBitter: 0, hopsAroma: 80 });
    expect(bitter.ibu).toBeGreaterThan(aroma.ibu * 3);
    expect(aroma.aroma).toBeGreaterThan(0.8);
    expect(taste({ grainKg: 4, hopsBitter: 120, hopsAroma: 80 }).style).toBe('IPA');
  });

  it('ensemencer un moût trop chaud tue la levure', () => {
    const t = taste({ pitchTemp: 50 });
    expect(ids(t)).toContain('dead');
    expect(t.abv).toBe(0);
    expect(t.quality).toBe(0);
  });

  it('un serpentin lent peut contaminer le moût, pas un échangeur double étage', () => {
    const r = GASTON_RECIPE;
    expect(ids(brew(r, L1, exact(r, 0.05)))).toContain('infection');
    expect(ids(brew(r, L3, exact(r, 0.05)))).not.toContain('infection');
  });

  it('fermentation trop chaude → fusel ; trop courte → sucrée', () => {
    expect(ids(taste({ fermentTemp: 30 }))).toContain('fusel');
    expect(ids(taste({ fermentDays: 2 }))).toContain('unfinished');
  });

  it('garde au froid → bière limpide ; lager gardée au chaud → soufrée', () => {
    expect(taste({ gardeTemp: 2 }).clarity).toBeGreaterThan(taste({ gardeTemp: 16 }).clarity);
    expect(ids(taste({ strain: 'lager', fermentTemp: 11, fermentDays: 12, gardeTemp: 15, gardeDays: 20 }))).toContain('sulfur');
    const lager = taste({ strain: 'lager', pitchTemp: 10, fermentTemp: 11, fermentDays: 12, gardeTemp: 2, gardeDays: 20 });
    expect(lager.defects).toEqual([]);
    expect(lager.style).toBe('Lager');
  });

  it('sucre de refermentation : plate, débordante, puis bouteilles qui explosent', () => {
    expect(ids(taste({ priming: 1 }))).toContain('flat');
    expect(ids(taste({ priming: 10 }))).toContain('gushing');
    const bombs = taste({ priming: 15 });
    expect(ids(bombs)).toContain('bombs');
    expect(bombs.lost).toBeGreaterThan(0);
  });
});

describe('précision du matériel', () => {
  const levels = (lv: number): Levels => ({ mill: lv, mash: lv, boil: lv, cooler: lv, fermenter: lv, conditioning: lv, bottling: lv });
  const stats = (r: Recipe, lv: number, n = 1500) => {
    const rng = new Rng(7);
    let excellent = 0;
    let poor = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const q = brew(r, levels(lv), executeAll(r, levels(lv), () => rng.next())).quality;
      sum += q;
      if (verdictOf(q) === 'Excellente') excellent++;
      if (q < 0.5) poor++;
    }
    return { mean: sum / n, excellent: excellent / n, poor: poor / n };
  };

  it('niveau 1 : beaucoup de bières médiocres, presque jamais excellentes', () => {
    const s = stats(GASTON_RECIPE, 1);
    expect(s.excellent).toBeLessThan(0.05);
    expect(s.poor).toBeGreaterThan(0.15);
  });

  it('la qualité monte avec le niveau des appareils', () => {
    const means = [1, 2, 3, 4, 5].map((lv) => stats(GASTON_RECIPE, lv).mean);
    for (let i = 1; i < 5; i++) expect(means[i]!).toBeGreaterThan(means[i - 1]!);
  });

  it('niveau 5 : précision moléculaire, une bonne recette est toujours excellente', () => {
    const s = stats(GASTON_RECIPE, 5);
    expect(s.excellent).toBe(1);
  });

  it('niveau 5 ne rattrape pas une recette incohérente', () => {
    expect(stats({ ...GASTON_RECIPE, mashTemp: 76, fermentTemp: 25, boilTime: 20 }, 5).mean).toBeLessThan(0.3);
  });

  it('les écarts sont expliqués à la dégustation', () => {
    const r = GASTON_RECIPE;
    const t = brew(r, levels(1), { mashTemp: r.mashTemp + 4, pitchTemp: r.pitchTemp, fermentTemp: r.fermentTemp, gardeTemp: r.gardeTemp, infectionRoll: 1, grainKg: r.grainKg * 1.25 });
    expect(ids(t)).toContain('driftMash');
    expect(ids(t)).toContain('dosGrain');
  });
});
