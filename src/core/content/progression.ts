import { BUILDINGS, type BuildingDef, type BuildingType, type Unlock } from './buildings';

/** Ce qui est disponible à la fin du tutoriel : tout ce qui n'a pas de condition de déblocage. */
export const STARTER_BUILDINGS: readonly BuildingType[] = (Object.keys(BUILDINGS) as BuildingType[]).filter((t) => {
  const d = BUILDINGS[t] as BuildingDef;
  return !d.unlock && !d.hidden;
});

/** Déblocages à chaque agrandissement (conservé pour la migration des anciennes sauvegardes). */
export const EXPANSION_UNLOCKS: readonly (readonly BuildingType[])[] = [[], ['tank', 'pump'], [], [], []];

export const unlockMet = (u: Unlock | undefined, stats: { crates: number; expansion: number }) =>
  !u || ((u.crates ?? 0) <= stats.crates && (u.expansion ?? 0) <= stats.expansion);

/** Texte de la condition, pour le magasin. */
export function unlockText(u: Unlock): string {
  const parts: string[] = [];
  if (u.crates) parts.push(`${u.crates} caisses livrées`);
  if (u.expansion) parts.push(`agrandir le local (${['', 'Arrière-cour', 'Entrepôt', 'Micro-brasserie', 'Usine'][u.expansion] ?? ''})`);
  return `Débloqué après : ${parts.join(' et ')}`;
}
