import { tl } from '../i18n';

/**
 * Partenariats : la brasserie sponsorise un club ou un événement pendant une semaine. Chaque jour, une jauge de
 * litres à livrer se remplit à nouveau ; ce qui n'est pas livré dans la journée est perdu. Les litres livrés sont
 * bien payés (plus que le grossiste) et font parler des bières (ils comptent double dans les ventes de la semaine).
 * Toutes les journées remplies : une prime en diamants. Un seul partenariat à la fois.
 *
 * Chaque partenaire s'ouvre avec un niveau de la brasserie (pour pouvoir fournir son volume) et un palier de
 * popularité de la marque (30, 50, 60, 70, 80 puis 90 sur 100) : plus la marque est connue, plus les partenaires
 * sont prestigieux. La pub en cours ne compte pas : on ne signe pas les Jeux mondiaux sur un coup de publicité.
 *
 * Volumes calés sur la production du joueur simulé : environ 400 L par jour au garage, 2 000 à 5 000 L à la
 * microbrasserie, 10 000 à 25 000 L à l'usine, 50 000 à 130 000 L au labo du futur. Un partenaire demande
 * à peu près le tiers de la production de son niveau.
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
}

export const PARTNER_DAYS = 7;
/** Les litres livrés à un partenaire comptent double dans les ventes de la semaine (le public voit la bière). */
export const PARTNER_POP_WEIGHT = 2;

export const PARTNERS: readonly PartnerDef[] = [
  { id: 'rugby', name: tl('Club de rugby du village'), text: tl('La buvette du stade, chaque week-end et après l\'entraînement.'), level: 2, brand: 30, daily: 150, minQuality: 0.5, pay: 1.5, fee: 1_500, gems: 10 },
  { id: 'rock', name: tl('Festival Rock en Fût'), text: tl('Une semaine de concerts en plein air.'), level: 3, brand: 50, daily: 1_500, minQuality: 0.5, pay: 1.5, fee: 15_000, gems: 15 },
  { id: 'foot', name: tl('FC des Remparts'), text: tl('Le club de foot de la ville : tribunes, loges et buvettes.'), level: 3, brand: 60, daily: 2_500, minQuality: 0.7, pay: 1.6, fee: 30_000, gems: 20 },
  { id: 'stadium', name: tl('Finale de la Coupe au Grand Stade'), text: tl('80 000 places, la finale et toute la semaine de fête autour.'), level: 4, brand: 70, daily: 8_000, minQuality: 0.7, pay: 1.7, fee: 120_000, gems: 30 },
  { id: 'festival', name: tl('Festival des Mille Fûts'), text: tl('Le plus grand festival de bière du monde.'), level: 5, brand: 80, daily: 30_000, minQuality: 0.7, pay: 1.8, fee: 500_000, gems: 50 },
  { id: 'games', name: tl('Jeux mondiaux'), text: tl('Les athlètes du monde entier, des millions de spectateurs : la bière officielle des Jeux.'), level: 5, brand: 90, daily: 70_000, minQuality: 0.85, pay: 2, fee: 2_000_000, gems: 100, medal: true },
];

export const partnerById = (id: string) => PARTNERS.find((p) => p.id === id);

/** Un partenariat en cours. */
export interface Partnership {
  id: PartnerId;
  /** Signature (s de jeu) : chaque journée dure 24 h de jeu à partir de là. */
  start: number;
  /** Litres livrés chaque journée. */
  delivered: number[];
  /** Argent gagné depuis la signature. */
  earned: number;
}
