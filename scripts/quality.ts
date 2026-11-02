/**
 * Distribution des verdicts selon le niveau des appareils (Monte-Carlo).
 *   npm run quality
 */
import { brew, verdictOf, GASTON_RECIPE, type Levels, type Recipe } from '../src/core/brewing/model';
import { executeAll } from '../src/core/brewing/execution';
import { Rng } from '../src/core/rng';
import { BOT_RECIPES } from './recipes';

const N = 3000;
const VERDICTS = ['Imbuvable', 'Médiocre', 'Correcte', 'Bonne', 'Excellente'] as const;
const recipes: [string, Recipe][] = [
  ['Gaston (blonde)', GASTON_RECIPE],
  ['Gamme du bot', BOT_RECIPES[1]!],
  ['Lager', BOT_RECIPES[2]!],
  ['Réglages limites', { ...GASTON_RECIPE, mashTemp: 70, fermentTemp: 21, priming: 9, boilTime: 35 }],
  ['Mauvaise recette', { ...GASTON_RECIPE, mashTemp: 76, fermentTemp: 25, boilTime: 20 }],
];
const rng = new Rng(42);
const rand = () => rng.next();
console.log('niveau  recette              ' + VERDICTS.map((v) => v.slice(0, 9).padStart(10)).join('') + '   moyenne');
for (const [name, r] of recipes) {
  for (let lv = 1; lv <= 5; lv++) {
    const levels = { mill: lv, mash: lv, boil: lv, cooler: lv, fermenter: lv, conditioning: lv, bottling: lv } as Levels;
    const count: Record<string, number> = {};
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const t = brew(r, levels, executeAll(r, levels, rand));
      count[verdictOf(t.quality)] = (count[verdictOf(t.quality)] ?? 0) + 1;
      sum += t.quality;
    }
    console.log(`  ${lv}     ${name.padEnd(20)} ${VERDICTS.map((v) => `${Math.round(((count[v] ?? 0) / N) * 100)} %`.padStart(10)).join('')}   ${(sum / N).toFixed(2)}`);
  }
}
