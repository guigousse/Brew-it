import type { StrainId } from '../content/strains';

export type BatchId = number;

/**
 * Profil d'un lot de bière/moût. Chaque fluide de brassage et chaque bouteille référence un lot par son id :
 * c'est ce qui permet des recettes libres (pas de bière « figée » dans le contenu du jeu).
 */
export interface BatchProfile {
  /** Densité en points de gravité (50 = 1.050). */
  og: number;
  /** Part de sucres fermentescibles (0..1), fixée par la température d'empâtage. */
  fermentability: number;
  ibu: number;
  abv: number;
  /** Fruité / esters (0..1). */
  fruity: number;
  /** Qualité globale (0..1). */
  quality: number;
  strain: StrainId | null;
  gardeDays: number;
}

export const NUMERIC_KEYS = ['og', 'fermentability', 'ibu', 'abv', 'fruity', 'quality', 'gardeDays'] as const;

const BLEND_EPSILON = 0.02;
const TOLERANCE: Record<(typeof NUMERIC_KEYS)[number], number> = {
  og: 0.5, fermentability: 0.005, ibu: 0.5, abv: 0.05, fruity: 0.005, quality: 0.005, gardeDays: 0.01,
};

export function profilesClose(a: BatchProfile, b: BatchProfile): boolean {
  if (a.strain !== b.strain) return false;
  return NUMERIC_KEYS.every((k) => Math.abs(a[k] - b[k]) <= TOLERANCE[k]);
}

export class BatchRegistry {
  constructor(
    public next = 1,
    public batches: Record<number, BatchProfile> = {},
  ) {}

  create(p: BatchProfile): BatchId {
    const id = this.next++;
    this.batches[id] = { ...p };
    return id;
  }

  get(id: BatchId | null): BatchProfile | undefined {
    return id == null ? undefined : this.batches[id];
  }

  /** Mélange deux lots (pondéré par volume) : résultat dans un nouveau lot. */
  blend(a: BatchId | null, va: number, b: BatchId | null, vb: number): BatchId | null {
    if (a === b) return a;
    const pa = this.get(a);
    const pb = this.get(b);
    if (!pa) return b;
    if (!pb) return a;
    // Même recette (ex. deux brassins identiques successifs) : pas besoin de nouveau lot.
    if (profilesClose(pa, pb)) return va >= vb ? a : b;
    const total = va + vb;
    if (total <= 0) return a;
    // Traces négligeables : on garde le lot dominant (évite de créer un lot à chaque tick dans un tuyau).
    if (vb / total < BLEND_EPSILON) return a;
    if (va / total < BLEND_EPSILON) return b;
    const mixed: BatchProfile = { ...pa, strain: va >= vb ? pa.strain : pb.strain };
    for (const k of NUMERIC_KEYS) mixed[k] = (pa[k] * va + pb[k] * vb) / total;
    // Un assemblage non maîtrisé dégrade légèrement la qualité.
    mixed.quality *= 0.95;
    return this.create(mixed);
  }

  /** Supprime les lots qui ne sont plus référencés nulle part (appelé avant sauvegarde). */
  gc(referenced: ReadonlySet<BatchId>): void {
    for (const key of Object.keys(this.batches)) {
      if (!referenced.has(Number(key))) delete this.batches[Number(key)];
    }
  }
}
