import { EXPANSION_UNLOCKS, STARTER_BUILDINGS } from '../content/progression';
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
