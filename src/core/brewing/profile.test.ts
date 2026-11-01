import { boil, ferment, mash } from './profile';

describe('formules de brassage', () => {
  it('empâtage : ~5 kg dans 24 L donne une densité autour de 1.045', () => {
    const r = mash({ grainKg: 5, waterL: 24, mashTemp: 66, mashTimeMin: 60 });
    expect(r.volume).toBe(19);
    expect(r.og).toBeGreaterThan(40);
    expect(r.og).toBeLessThan(50);
  });

  it('empâtage plus chaud → moût moins fermentescible', () => {
    const cold = mash({ grainKg: 5, waterL: 24, mashTemp: 63, mashTimeMin: 60 });
    const hot = mash({ grainKg: 5, waterL: 24, mashTemp: 70, mashTimeMin: 60 });
    expect(hot.fermentability).toBeLessThan(cold.fermentability);
  });

  it('ébullition : amertume Tinseth réaliste et concentration par évaporation', () => {
    const r = boil({ og: 50, volume: 20, hopsGrams: 50, boilMin: 60 });
    expect(r.ibu).toBeGreaterThan(50);
    expect(r.ibu).toBeLessThan(65);
    expect(r.volume).toBeCloseTo(18);
    expect(r.og).toBeGreaterThan(50);
  });

  it('fermentation : ABV cohérent, plus chaud = plus fruité mais pénalisé hors plage', () => {
    const ok = ferment({ og: 55, fermentability: 0.75, strain: 'ale_us', temp: 19, gardeDays: 3 });
    expect(ok.abv).toBeGreaterThan(5);
    expect(ok.abv).toBeLessThan(6);
    const hot = ferment({ og: 55, fermentability: 0.75, strain: 'ale_us', temp: 26, gardeDays: 3 });
    expect(hot.fruity).toBeGreaterThan(ok.fruity);
    expect(hot.quality).toBeLessThan(ok.quality);
  });
});
