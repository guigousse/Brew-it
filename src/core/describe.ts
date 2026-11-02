import { countItems, type Building } from './building';
import { BUILDINGS, kindOf, type BuildingDef } from './content/buildings';
import { hopsFor, yeastFor } from './systems/machines';
import { ITEMS, type ItemId } from './content/items';
import { STRAINS, type StrainId } from './content/strains';
import { CRATE_SIZE, waterFor } from './systems/machines';
import type { World } from './world';

export interface MachineInfo {
  /** Ce qui se passe, en langage simple. */
  status: string;
  /** Progression 0..1 de l'étape en cours, si pertinent. */
  progress?: number;
  /** Ce qui manque encore pour lancer le prochain lot. */
  needs: { label: string; have: number; want: number; unit: string }[];
}

const pct = (b: Building) => (b.machine && b.machine.duration > 0 ? Math.min(1, b.machine.timer / b.machine.duration) : undefined);
/** Raison pour laquelle une machine de brassage ne démarre pas, si c'est la production. */
const idleReason = (world: World) =>
  !world.activeRecipe ? 'Aucun brassin : crée ton premier brassin' : !world.production.running ? 'Production en pause' : null;

/** Description d'une machine pour l'inspecteur et pour Gaston. */
export function describe(world: World, b: Building): MachineInfo {
  const m = b.machine;
  const needs: MachineInfo['needs'] = [];
  const t = (v: number | undefined) => `${Math.round(v ?? 0)} °C`;
  const scale = (BUILDINGS[b.type] as BuildingDef).batchScale ?? 1;
  switch (kindOf(b.type) ?? b.type) {
    case 'water_tap':
      return { status: 'Eau du réseau à 12 °C', needs };
    case 'supplier': {
      const item = String(b.params.item) as ItemId;
      return { status: `Livre : ${ITEMS[item]?.name ?? item}`, needs };
    }
    case 'conveyor':
      return { status: `${b.belt?.length ?? 0} objet(s) en transit`, needs };
    case 'conduit':
    case 'pump':
    case 'tank':
      return { status: b.fluid?.fluid ? `${b.fluid.amount.toFixed(1)} L à ${t(b.fluid.temp)}` : 'Vide', needs };
    case 'cooler':
    case 'cooler_2':
      return { status: b.fluid?.fluid ? `Le liquide ressort refroidi (≈ ${t(b.params.targetTemp as number)})` : 'En attente de liquide chaud', needs };
    case 'mill':
      return { status: m?.phase === 'processing' ? 'Concassage du malt' : 'En attente de malt', progress: pct(b), needs };
    case 'mash_tun': {
      const grain = (world.activeRecipe?.grainKg ?? 5) * scale;
      needs.push({ label: 'Malt concassé', have: countItems(b.itemsIn!, 'crushed_malt'), want: grain, unit: 'kg' });
      needs.push({ label: 'Eau', have: Math.floor(b.fluidIn!.amount), want: waterFor(grain) * scale, unit: 'L' });
      if (m?.phase === 'heating') return { status: `L'eau chauffe : ${t(m.temp)} → ${t(Number(m.data?.mashTemp))}`, needs };
      if (m?.phase === 'processing') return { status: 'Empâtage : l\'amidon du malt devient du sucre', progress: pct(b), needs };
      if (m?.phase === 'blocked') return { status: 'Moût prêt : la sortie est bloquée', needs };
      return { status: idleReason(world) ?? 'En attente des ingrédients', needs };
    }
    case 'kettle': {
      needs.push({ label: 'Houblon', have: countItems(b.itemsIn!, 'hops'), want: hopsFor(world.activeRecipe?.hopsItems ?? 1, b.fluidIn!.amount || 19 * scale), unit: '× 50 g' });
      if (m?.phase === 'heating') return { status: `Montée à ébullition : ${t(m.temp)}`, needs };
      if (m?.phase === 'processing') return { status: `Ébullition avec ${Math.round(Number(m.data?.hopsGrams ?? 0))} g de houblon`, progress: pct(b), needs };
      if (m?.phase === 'blocked') return { status: 'Moût houblonné prêt : la sortie est bloquée', needs };
      const wort = b.fluidIn!.amount;
      return { status: wort > 0 ? `Le moût arrive : ${wort.toFixed(0)} L` : idleReason(world) ?? 'En attente du moût', needs };
    }
    case 'fermenter': {
      needs.push({ label: 'Levure', have: countItems(b.itemsIn!, 'yeast'), want: yeastFor(b.fluidIn!.amount || 19 * scale), unit: 'sachet' });
      const strain = STRAINS[(world.batches.get(m?.batch ?? null)?.strain ?? world.activeRecipe?.strain ?? 'ale_us') as StrainId]?.name ?? '';
      if (m?.phase === 'processing') {
        const fermenting = m.timer < Number(m.data?.fermentDuration ?? 0);
        return {
          status: fermenting ? `Fermentation (${strain}) : la levure fabrique l'alcool et les bulles` : 'Garde : la bière se repose et s\'affine',
          progress: pct(b),
          needs,
        };
      }
      if (m?.phase === 'blocked') return { status: 'Bière prête : il faut l\'embouteiller', needs };
      if (m?.phase === 'failed') return { status: 'Lot perdu : le moût était trop chaud pour la levure', needs };
      const wort = b.fluidIn!.amount;
      return { status: wort > 0 ? `Le moût arrive : ${wort.toFixed(0)} L à ${t(b.fluidIn!.temp)}` : idleReason(world) ?? 'En attente du moût refroidi', needs };
    }
    case 'bottler':
      needs.push({ label: 'Bouteilles vides', have: countItems(b.itemsIn!, 'bottle'), want: 1, unit: '' });
      return {
        status: m?.phase === 'processing' ? 'Mise en bouteille' : b.fluidIn!.amount > 0.3 ? 'En attente de bouteilles vides' : 'En attente de bière',
        needs,
      };
    case 'crate':
      return {
        status: m?.phase === 'processing' ? 'En route vers le bar du coin…' : `${b.itemsIn!.length} / ${CRATE_SIZE} bouteilles${b.itemsIn![0] ? ` de « ${world.batches.get(b.itemsIn![0].batch)?.name ?? 'bière'} »` : ''}`,
        progress: m?.phase === 'processing' ? pct(b) : b.itemsIn!.length / CRATE_SIZE,
        needs,
      };
    case 'stand':
      return { status: b.itemsIn!.length ? `Vend aux passants (${b.itemsIn!.length} en stock)` : 'Plus rien à vendre', needs };
    default:
      return { status: '', needs };
  }
}
