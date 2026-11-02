import { EXPANSION_UNLOCKS, STARTER_BUILDINGS } from '../content/progression';
import { DEFAULT_CHOICES } from '../brewing/recipe';
import { SAVE_VERSION, type SaveFile } from './serialize';

/**
 * Migrations successives : MIGRATIONS[n] transforme une sauvegarde version n en version n+1.
 * Ne jamais modifier une migration publiée : en ajouter une nouvelle.
 */
const MIGRATIONS: Record<number, (save: any) => any> = {
  // v1 → v2 : tutoriel, statistiques et déblocages. Les parties du prototype sont considérées
  // comme ayant terminé le tutoriel, avec tout le contenu de départ débloqué.
  1: (s) => ({
    ...s,
    version: 2,
    world: {
      ...s.world,
      stats: { brews: 0, fermentations: 0, bottles: 0, crates: 0, earned: 0 },
      tutorial: { step: 0, done: true, signals: [] },
      unlocked: [...STARTER_BUILDINGS, ...EXPANSION_UNLOCKS.slice(0, s.world.expansion + 1).flat()],
      firstBeer: null,
    },
  }),
  // v2 → v3 : les choix passent des machines au brassin. Un tutoriel en cours (ancien plan du garage)
  // est considéré comme terminé ; la ligne existante reçoit un brassin par défaut et redémarre.
  2: (s) => ({
    ...s,
    version: 3,
    world: {
      ...s.world,
      tutorial: s.world.tutorial.done ? s.world.tutorial : { ...s.world.tutorial, done: true },
      unlocked: [...new Set([...s.world.unlocked, ...STARTER_BUILDINGS])],
      recipes: [{ id: 1, name: 'Ma première bière', ...DEFAULT_CHOICES }],
      production: { recipeId: 1, running: true },
    },
  }),
  // v3 → v4 : stock d'ingrédients (fournisseur) et matériel miniature débloqué.
  3: (s) => ({
    ...s,
    version: 4,
    world: { ...s.world, stock: {}, unlocked: [...new Set([...s.world.unlocked, ...STARTER_BUILDINGS])] },
  }),
  // v4 → v5 : brassins réglés aux molettes, houblon compté par 10 g, dégustation.
  4: (s) => {
    const strainTemp: Record<string, number> = { ale_us: 19, ale_uk: 19.5, saison: 26, lager: 11.5 };
    const hopsX5 = (list: { item: string }[] | undefined) =>
      list?.flatMap((u) => (u.item === 'hops' ? [u, u, u, u, u].map((x) => ({ ...x })) : [u]));
    return {
      ...s,
      version: 5,
      world: {
        ...s.world,
        tasting: null,
        stock: { ...s.world.stock, hops: (s.world.stock?.hops ?? 0) * 5 },
        recipes: s.world.recipes.map((r: any) => ({
          id: r.id, name: r.name, grainKg: r.grainKg, mashTemp: r.mashTemp, mashTime: 60,
          hopsGrams: (r.hopsItems ?? 1) * 50, boilTime: 60, strain: r.strain, fermentTemp: strainTemp[r.strain] ?? 19,
          gardeDays: r.gardeDays, status: 'validated',
        })),
        buildings: s.world.buildings.map((b: any) => ({ ...b, itemsIn: hopsX5(b.itemsIn), itemsOut: hopsX5(b.itemsOut), belt: b.belt })),
      },
    };
  },
  // v5 → v6 : réserves globales à capacité améliorable. Les bacs et silos posés disparaissent :
  // leur contenu rejoint le stock et leur prix est remboursé.
  5: (s) => {
    const stock: Record<string, number> = { ...s.world.stock };
    let money = s.world.money;
    const refunds: Record<string, number> = { storage_1: 60, storage_2: 500, storage_3: 2500 };
    const buildings = s.world.buildings.filter((b: any) => {
      if (!(b.type in refunds)) return true;
      for (const u of b.itemsOut ?? []) stock[u.item] = (stock[u.item] ?? 0) + 1;
      money += refunds[b.type];
      return false;
    });
    return {
      ...s,
      version: 6,
      world: { ...s.world, money, stock, buildings, stockLevels: {}, offline: null, unlocked: s.world.unlocked.filter((t: string) => !(t in refunds)) },
    };
  },
};

export function migrate(raw: unknown): SaveFile {
  let save = raw as { version?: number };
  if (!save || typeof save.version !== 'number') throw new Error('Sauvegarde invalide');
  if (save.version > SAVE_VERSION) throw new Error(`Sauvegarde trop récente (v${save.version})`);
  while (save.version! < SAVE_VERSION) {
    const step = MIGRATIONS[save.version!];
    if (!step) throw new Error(`Migration manquante depuis v${save.version}`);
    save = step(save);
  }
  return save as SaveFile;
}
