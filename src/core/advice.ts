/**
 * Le conseil de Gaston au comptoir du magasin : une seule phrase, utile maintenant, selon le rayon affiché.
 * Fonction pure : elle lit la partie sans rien changer.
 */
import type { Game } from './game';
import { boostById, LABEL_UNLOCKS, type BoostId } from './shop';

export type ShopTab = 'bar' | 'boosts' | 'labels';

export interface Advice {
  text: string;
  /** Ce que le conseil désigne (mis en avant dans le rayon). */
  target?: string;
}

/** Fûts pleins au stockage à partir desquels Gaston propose un happy hour. */
const KEGS_WAITING = 6;
/** Brassins programmés à partir desquels un boost des machines vaut le coup. */
const PLAN_BUSY = 10;

export function shopAdvice(g: Game, tab: ShopTab): Advice {
  if (tab === 'bar') {
    const next = g.nextDecor;
    if (!next) return { text: 'Ton bar est complet. Il ne lui manque que des clients !' };
    if (g.money >= next.cost) {
      return {
        text: next.event ? `« ${next.name} » est à ta portée : un nouvel événement au bar !` : `« ${next.name} » est à ta portée. Tes clients vont adorer.`,
        target: next.id,
      };
    }
    return { text: `Encore ${Math.ceil(next.cost - g.money).toLocaleString('fr-FR')} € et « ${next.name} » rejoint ton bar.`, target: next.id };
  }

  if (tab === 'boosts') {
    /** Un boost qu'on peut lancer maintenant : en réserve, ou à acheter avec les diamants. */
    const can = (id: BoostId) => (g.stockOf(id) > 0 || g.gems >= g.boostCost(id)) && !g.boostBlocked(id);
    const how = (id: BoostId, name: string) => (g.stockOf(id) > 0 ? `Ton ${name} en réserve, c'est le moment !` : `Un ${name} les écoulerait.`);
    const kegs = g.beers.reduce((s, b) => s + b.kegs.length, 0);
    if (kegs >= KEGS_WAITING && !g.boostOf('bar') && can('happyHour')) return { text: `${kegs} fûts attendent au stockage. ${how('happyHour', 'Happy hour')}`, target: 'happyHour' };
    if (!g.batches.length && !g.planned) return { text: 'Rien ne brasse : programme des brassins avant d\'accélérer les machines.' };
    if (g.planned >= PLAN_BUSY && !g.boostOf('brew')) {
      const owned = (['nightShift', 'cadence', 'fullSpeed', 'rush'] as const).find((id) => g.stockOf(id) > 0 && !g.boostBlocked(id));
      if (owned) return { text: `${g.planned} brassins en file : utilise ton ${boostById(owned)?.name} de la réserve !`, target: owned };
      if (can('cadence')) return { text: `${g.planned} brassins en file : une Cadence ×2 les sortirait deux fois plus vite.`, target: 'cadence' };
    }
    if (g.orders.length === 0 && can('prospect')) return { text: 'Ton tableau de commandes est vide. Une Prospection fait venir un client tout de suite.', target: 'prospect' };
    if (g.stockTotal) return { text: `${g.stockTotal} boost${g.stockTotal > 1 ? 's' : ''} en réserve : garde-les pour le bon moment, ou avant de partir.` };
    if (g.gems < (boostById('rush')?.gems ?? 0)) return { text: 'Plus assez de diamants : chaque commande livrée t\'en rapporte un.' };
    return { text: `Achète tes boosts d'avance : ils t'attendent dans la réserve. Tu as ${g.gems} diamant${g.gems > 1 ? 's' : ''}.` };
  }

  const beer = g.beers[0]?.name;
  const cheap = LABEL_UNLOCKS.filter((x) => !g.unlocked.includes(x.id) && !x.gems && g.money >= x.cost).sort((a, b) => a.cost - b.cost)[0];
  if (cheap) return { text: `${cheap.name} irait bien à ${beer ? `ta ${beer}` : 'ta prochaine bière'}. Touche son aperçu pour l'essayer !`, target: cheap.id };
  const premium = LABEL_UNLOCKS.find((x) => !g.unlocked.includes(x.id) && x.gems && g.gems >= x.gems);
  if (premium) return { text: `${premium.name}, c'est une pièce rare : elle se paie en diamants.`, target: premium.id };
  return { text: 'Touche un objet pour l\'essayer sur ta bière avant de l\'acheter.' };
}
