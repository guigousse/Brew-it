import { tl } from '../i18n';

/**
 * Partenariats : le grand débouché en volume, au milieu et à la fin de la partie. La brasserie sponsorise un club
 * ou un événement pendant une semaine et choisit sa **bière officielle**. Chaque jour, le partenaire a besoin d'une
 * quantité de litres : elle part toute seule du stock (la bière officielle d'abord, puis les autres assez bonnes),
 * au prix annoncé, bien au-dessus du grossiste. La bière officielle gagne de la visibilité (des points de popularité)
 * tant que le contrat dure. Ce qui manque un jour est perdu ; toutes les journées remplies : une prime en diamants.
 * Un seul partenariat à la fois.
 *
 * Chaque partenaire s'ouvre avec un niveau de la brasserie (pour pouvoir fournir son volume) et un palier de
 * popularité de la marque (30, 50, 60, 70, 80 puis 90 sur 100). La pub en cours ne compte pas.
 *
 * Volumes et prix calés avec le joueur simulé (fin de partie vers le 33e jour, comme avant) : un partenaire
 * prend plusieurs fois ce que le grossiste reprend à plein prix au même niveau, et le paie 1,2 à 1,6 fois plus.
 * Le contrat coûte environ une demi-journée de revenus de son niveau.
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

export const PARTNER_DAYS = 7;
/** Livraison automatique : toutes les 30 s de jeu. */
export const PARTNER_ROUND_S = 30;

export const PARTNERS: readonly PartnerDef[] = [
  { id: 'rugby', name: tl('Club de rugby du village'), text: tl('La buvette du stade, chaque week-end et après l\'entraînement.'), level: 2, brand: 30, daily: 1_800, minQuality: 0.5, pay: 1.2, fee: 5_000, gems: 10, visibility: 5 },
  { id: 'rock', name: tl('Festival Rock en Fût'), text: tl('Une semaine de concerts en plein air.'), level: 3, brand: 50, daily: 9_000, minQuality: 0.5, pay: 1.25, fee: 20_000, gems: 15, visibility: 10 },
  { id: 'foot', name: tl('FC des Remparts'), text: tl('Le club de foot de la ville : tribunes, loges et buvettes.'), level: 3, brand: 60, daily: 15_000, minQuality: 0.7, pay: 1.3, fee: 40_000, gems: 20, visibility: 10 },
  { id: 'stadium', name: tl('Finale de la Coupe au Grand Stade'), text: tl('80 000 places, la finale et toute la semaine de fête autour.'), level: 4, brand: 70, daily: 60_000, minQuality: 0.7, pay: 1.4, fee: 150_000, gems: 30, visibility: 15 },
  { id: 'festival', name: tl('Festival des Mille Fûts'), text: tl('Le plus grand festival de bière du monde.'), level: 5, brand: 80, daily: 240_000, minQuality: 0.7, pay: 1.5, fee: 600_000, gems: 50, visibility: 20 },
  { id: 'games', name: tl('Jeux mondiaux'), text: tl('Les athlètes du monde entier, des millions de spectateurs : la bière officielle des Jeux.'), level: 5, brand: 90, daily: 450_000, minQuality: 0.85, pay: 1.6, fee: 2_000_000, gems: 100, medal: true, visibility: 25 },
];

export const partnerById = (id: string) => PARTNERS.find((p) => p.id === id);

/** Un partenariat en cours. */
export interface Partnership {
  id: PartnerId;
  /** La bière officielle (livrée en premier, et qui gagne la visibilité). */
  beerId: number;
  /** Signature (s de jeu) : chaque journée dure 24 h de jeu à partir de là. */
  start: number;
  /** Litres livrés chaque journée. */
  delivered: number[];
  /** Argent gagné depuis la signature. */
  earned: number;
}
