import { SAVE_VERSION, type SaveFile } from './serialize';

/**
 * Migrations successives : MIGRATIONS[n] transforme une sauvegarde version n en version n+1.
 * Ne jamais modifier une migration publiée : en ajouter une nouvelle.
 */
const MIGRATIONS: Record<number, (save: any) => any> = {
  // 1: (s) => ({ ...s, version: 2, world: { ...s.world, nouveauChamp: valeurParDefaut } }),
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
