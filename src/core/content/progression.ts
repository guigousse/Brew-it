import type { BuildingType } from './buildings';

/** Ce qui est disponible à la fin du tutoriel : la petite brasserie complète du garage. */
export const STARTER_BUILDINGS: readonly BuildingType[] = [
  'supplier', 'conveyor', 'mill', 'mash_tun', 'water_tap', 'kettle', 'cooler', 'fermenter', 'bottler', 'crate',
  'conduit', 'stand',
];

/** Déblocages à chaque agrandissement (index = palier). */
export const EXPANSION_UNLOCKS: readonly (readonly BuildingType[])[] = [[], ['tank', 'pump'], [], [], []];
