import { simulate, GASTON_RECIPE } from './recipe';
import { boil, conversion, ferment, mash, verdictOf } from './profile';

const ids = (r: { defects: { id: string }[] }) => r.defects.map((d) => d.id);

describe('formules de brassage', () => {
  it('empâtage : ~5 kg dans 24 L donne une densité autour de 1.045', () => {
    const r = mash({ grainKg: 5, waterL: 24, mashTemp: 66, mashTimeMin: 60 });
    expect(r.volume).toBe(19);
    expect(r.og).toBeGreaterThan(40);
    expect(r.og).toBeLessThan(50);
    expect(r.defects).toEqual([]);
  });

  it('les enzymes du malt travaillent entre 60 et 72 °C, et meurent au-delà de 78 °C', () => {
    expect(conversion(66)).toBe(1);
    expect(conversion(55)).toBeLessThan(0.6);
    expect(conversion(80)).toBeLessThan(0.1);
  });

  it('empâtage plus chaud → moût moins fermentescible', () => {
    const cold = mash({ grainKg: 5, waterL: 24, mashTemp: 63, mashTimeMin: 60 });
    const hot = mash({ grainKg: 5, waterL: 24, mashTemp: 70, mashTimeMin: 60 });
    expect(hot.fermentability).toBeLessThan(cold.fermentability);
  });

  it('ébullition : amertume Tinseth réaliste ; trop courte → goût de maïs cuit', () => {
    const r = boil({ og: 45, volume: 19, hopsGrams: 30, boilMin: 60 });
    expect(r.ibu).toBeGreaterThan(15);
    expect(r.ibu).toBeLessThan(30);
    expect(ids(boil({ og: 45, volume: 19, hopsGrams: 30, boilMin: 10 }))).toContain('dms');
  });

  it('fermentation : trop chaud → solvant ; trop froid → bloquée ; garde courte → pomme verte', () => {
    const base = { og: 50, fermentability: 0.8, ibu: 25, strain: 'ale_us' as const, gardeDays: 3 };
    expect(ferment({ ...base, temp: 19 }).defects).toEqual([]);
    expect(ids(ferment({ ...base, temp: 30 }))).toContain('fusel');
    const cold = ferment({ ...base, temp: 8 });
    expect(ids(cold)).toContain('stuck');
    expect(cold.abv).toBeLessThan(ferment({ ...base, temp: 19 }).abv / 2);
    expect(ids(ferment({ ...base, temp: 19, gardeDays: 0 }))).toContain('green');
    expect(ids(ferment({ ...base, strain: 'lager', temp: 11, gardeDays: 3 }))).toContain('green'); // une lager veut une longue garde
  });
});

describe('recettes complètes', () => {
  it('la recette de Gaston est excellente', () => {
    const t = simulate(GASTON_RECIPE);
    expect(verdictOf(t.quality)).toBe('Excellente');
    expect(t.abv).toBeGreaterThan(4.5);
    expect(t.abv).toBeLessThan(6);
  });

  it('un empâtage à 82 °C donne une bière aqueuse et farineuse : imbuvable', () => {
    const t = simulate({ ...GASTON_RECIPE, mashTemp: 82 });
    expect(ids(t)).toEqual(expect.arrayContaining(['starch', 'watery']));
    expect(verdictOf(t.quality)).toBe('Imbuvable');
  });

  it('300 g de houblon dans une petite bière : amertume agressive', () => {
    const t = simulate({ ...GASTON_RECIPE, grainKg: 3, hopsGrams: 300 });
    expect(ids(t)).toContain('harsh');
  });

  it('une lager bien menée : froide et longue garde', () => {
    const t = simulate({ ...GASTON_RECIPE, strain: 'lager', fermentTemp: 11, gardeDays: 21 });
    expect(t.defects).toEqual([]);
    expect(t.fruity).toBeLessThan(0.1);
  });

  it('une saison fermentée à 28 °C reste propre et fruitée', () => {
    const t = simulate({ ...GASTON_RECIPE, strain: 'saison', fermentTemp: 28 });
    expect(t.defects).toEqual([]);
    expect(t.fruity).toBeGreaterThan(0.5);
  });

  it('beaucoup de malt avec une levure peu tolérante : elle abandonne', () => {
    const t = simulate({ ...GASTON_RECIPE, grainKg: 10, strain: 'ale_uk' });
    expect(ids(t)).toContain('tolerance');
  });
});
