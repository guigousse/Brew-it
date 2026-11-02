import { brew, conversion, GASTON_RECIPE, verdictOf, type Actual, type Levels, type Recipe } from './model';

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
