import { tl } from '../i18n';

/**
 * Partenariats : le grand débouché pour les gros volumes. La brasserie sponsorise un club ou un événement et choisit
 * sa bière officielle. Une jauge se remplit toute seule depuis le stock (la bière officielle d'abord, puis les autres
 * assez bonnes) ; pleine, on touche « Livrer » : les bières partent chez le partenaire, payées bien plus que chez le
 * grossiste. Puis il faut attendre le lendemain (24 h de jeu) pour que la jauge se remplisse à nouveau.
 * Au bout de 7 livraisons, le contrat est rempli : une prime en diamants. La bière officielle gagne de la popularité
 * tant que le contrat dure. On tient 1 contrat à la fois au début, 2 à l'usine, 3 au labo du futur (un partenaire
 * une seule fois à la fois) ; les jauges se remplissent dans l'ordre de signature.
 *
 * Chaque partenaire s'ouvre avec un niveau de la brasserie et un palier de popularité de la marque (30, 50, 60, 70,
 * 80 puis 90 sur 100, sans la pub en cours). Volumes et prix calés avec le joueur simulé (voir BALANCE.md).
 */

export type PartnerId = 'rugby' | 'rock' | 'foot' | 'stadium' | 'festival' | 'games';

export interface PartnerDef {
  id: PartnerId;
  name: string;
  /** Une phrase : ce que l'on sponsorise. */
  text: string;
  /** Niveau de la brasserie qui l'ouvre. */
  level: number;
  /** Litres à livrer chaque jour. */
  daily: number;
  /** Qualité minimale des bières livrées. */
  minQuality: number;
  /** Prix payé, en multiple du prix du grossiste. */
  pay: number;
  /** Prix du contrat (payé à la signature). */
  fee: number;
  /** Prime en diamants si toutes les journées sont remplies. */
  gems: number;
  /** Popularité de la marque exigée (score sur 100, sans la campagne de pub en cours). */
  brand: number;
  /** Il faut une médaille au concours international. */
  medal?: boolean;
  /** Points de popularité de la bière officielle tant que le contrat dure. */
  visibility: number;
}

/** Contrats tenus en même temps, par niveau de la brasserie : 1 jusqu'à la microbrasserie, 2 à l'usine, 3 au labo du futur. */
export const PARTNER_SLOTS = [1, 1, 1, 2, 3] as const;
/** Livraisons d'un contrat. */
export const PARTNER_DAYS = 7;
/** Après une livraison, la jauge se remplit de nouveau au bout de 24 h de jeu. */
export const PARTNER_COOLDOWN_S = 86400;
/** La jauge se remplit depuis le stock toutes les 30 s de jeu. */
export const PARTNER_ROUND_S = 30;

export const PARTNERS: readonly PartnerDef[] = [
  { id: 'rugby', name: tl('Club de rugby du village'), text: tl('La buvette du stade, chaque week-end et après l\'entraînement.'), level: 2, brand: 30, daily: 1_800, minQuality: 0.5, pay: 1.2, fee: 10_000, gems: 10, visibility: 5 },
  { id: 'rock', name: tl('Festival Rock en Fût'), text: tl('Une semaine de concerts en plein air.'), level: 3, brand: 50, daily: 9_000, minQuality: 0.5, pay: 1.25, fee: 40_000, gems: 15, visibility: 10 },
  { id: 'foot', name: tl('FC des Remparts'), text: tl('Le club de foot de la ville : tribunes, loges et buvettes.'), level: 3, brand: 60, daily: 15_000, minQuality: 0.7, pay: 1.3, fee: 80_000, gems: 20, visibility: 10 },
  { id: 'stadium', name: tl('Finale de la Coupe au Grand Stade'), text: tl('80 000 places, la finale et toute la semaine de fête autour.'), level: 4, brand: 70, daily: 60_000, minQuality: 0.7, pay: 1.4, fee: 300_000, gems: 30, visibility: 15 },
  { id: 'festival', name: tl('Festival des Mille Fûts'), text: tl('Le plus grand festival de bière du monde.'), level: 5, brand: 80, daily: 240_000, minQuality: 0.7, pay: 1.5, fee: 1_200_000, gems: 50, visibility: 20 },
  { id: 'games', name: tl('Jeux mondiaux'), text: tl('Les athlètes du monde entier, des millions de spectateurs : la bière officielle des Jeux.'), level: 5, brand: 90, daily: 450_000, minQuality: 0.85, pay: 1.6, fee: 4_000_000, gems: 100, medal: true, visibility: 25 },
];

export const partnerById = (id: string) => PARTNERS.find((p) => p.id === id);

/** Un partenariat en cours. */
export interface Partnership {
  id: PartnerId;
  /** La bière officielle (prise en premier pour la jauge, et qui gagne la visibilité). */
  beerId: number;
  /** Signature (s de jeu). */
  start: number;
  /** Livraisons faites. */
  deliveries: number;
  /** La jauge : les litres déjà mis de côté pour la prochaine livraison, par bière. */
  gauge: { beerId: number; liters: number }[];
  /** La jauge se remplit de nouveau à partir de ce moment (s de jeu) : le lendemain d'une livraison. */
  readyAt: number;
  /** Argent gagné depuis la signature. */
  earned: number;
}
