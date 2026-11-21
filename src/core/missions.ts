import { locale, tl } from '../i18n';

/**
 * Missions : un objectif à la fois, toujours visible dans un bandeau, avec une récompense. Elles suivent la
 * progression d'une partie, de la première commande à la médaille internationale, et donnent toujours un petit but
 * atteignable dans les minutes ou les heures qui viennent. Une mission remplie se récolte d'un geste.
 */
export interface MissionProgress {
  batches: number;
  orders: number;
  glasses: number;
  machineLevels: number;
  topMachineLevel: number;
  breweryLevel: number;
  beers: number;
  bestStars: number;
  partnersSigned: number;
  partnersDone: number;
  storageLevel: number;
  barLevel: number;
  medals: number;
  nationalMedals: number;
  internationalMedals: number;
}

export interface MissionDef {
  id: string;
  /** Le texte, avec {0} pour l'objectif chiffré. */
  text: string;
  target: number;
  progress: (p: MissionProgress) => number;
  money?: number;
  gems?: number;
}

const m = (id: string, text: string, target: number, progress: (p: MissionProgress) => number, reward: { money?: number; gems?: number }): MissionDef =>
  ({ id, text, target, progress, ...reward });

export const MISSIONS: readonly MissionDef[] = [
  m('orders3', tl('Livre {0} commandes'), 3, (p) => p.orders, { money: 80, gems: 2 }),
  m('upgrade1', tl('Améliore une machine'), 1, (p) => p.machineLevels, { money: 60 }),
  m('bar20', tl('Sers {0} verres au bar'), 20, (p) => p.glasses, { money: 100 }),
  m('brews10', tl('Lance {0} brassins'), 10, (p) => p.batches, { money: 150 }),
  m('garage', tl('Passe la brasserie au Garage'), 2, (p) => p.breweryLevel, { gems: 5 }),
  m('beers2', tl('Garde une 2e bière dans ta gamme'), 2, (p) => p.beers, { money: 300 }),
  m('orders10', tl('Livre {0} commandes'), 10, (p) => p.orders, { money: 500, gems: 3 }),
  m('stars3', tl('Fais monter une bière à {0} ★'), 3, (p) => p.bestStars, { gems: 5 }),
  m('partner1', tl('Signe un partenariat'), 1, (p) => p.partnersSigned, { gems: 5 }),
  m('storage2', tl('Agrandis le stockage'), 2, (p) => p.storageLevel, { money: 1_500 }),
  m('micro', tl('Passe à la Microbrasserie'), 3, (p) => p.breweryLevel, { gems: 10 }),
  m('medal1', tl('Gagne une médaille en concours'), 1, (p) => p.medals, { gems: 10 }),
  m('beers4', tl('Aie {0} bières dans ta gamme'), 4, (p) => p.beers, { money: 20_000 }),
  m('bar3', tl('Agrandis le bar jusqu\'au Pub'), 3, (p) => p.barLevel, { gems: 8 }),
  m('contract1', tl('Remplis un contrat de partenariat (7 livraisons)'), 1, (p) => p.partnersDone, { gems: 15 }),
  m('orders50', tl('Livre {0} commandes'), 50, (p) => p.orders, { money: 50_000, gems: 5 }),
  m('factory', tl('Passe à l\'Usine'), 4, (p) => p.breweryLevel, { gems: 20 }),
  m('national', tl('Gagne une médaille au concours national'), 1, (p) => p.nationalMedals, { gems: 15 }),
  m('stars45', tl('Fais monter une bière à 4½ ★'), 4.5, (p) => p.bestStars, { gems: 15 }),
  m('lab', tl('Passe au Labo du futur'), 5, (p) => p.breweryLevel, { gems: 50 }),
  m('international', tl('Gagne une médaille au concours international'), 1, (p) => p.internationalMedals, { gems: 30 }),
  m('level30', tl('Monte une machine au niveau {0}'), 30, (p) => p.topMachineLevel, { gems: 30 }),
  m('contracts5', tl('Remplis {0} contrats de partenariat'), 5, (p) => p.partnersDone, { gems: 40 }),
  m('level40', tl('Monte une machine au niveau {0}'), 40, (p) => p.topMachineLevel, { gems: 50 }),
];

export const missionText = (d: MissionDef) => tl(d.text, d.target);

/** Les objectifs qui se comptent (commandes, verres…) affichent « 3/10 » ; un palier à atteindre, non. */
const STEPS = new Set(['garage', 'micro', 'factory', 'lab', 'storage2', 'bar3', 'stars3', 'stars45', 'beers2']);
export const missionCounted = (d: MissionDef) => d.target > 1 && !STEPS.has(d.id);

/** La récompense en clair : « +500 € +3 💎 ». */
export const missionReward = (d: MissionDef) =>
  [d.money ? `+${d.money.toLocaleString(locale)} €` : '', d.gems ? `+${d.gems} 💎` : ''].filter(Boolean).join(' ');
