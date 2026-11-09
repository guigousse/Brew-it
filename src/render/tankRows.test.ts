import { describe, expect, it } from 'vitest';
import { layoutTankRows } from './scene';
import { SPRITES } from './sprites';

/** Ce qu'il faut d'écart pour voir la jauge d'une cuve de derrière (au moins une partie de son hublot). */
const gauge = (d: (typeof SPRITES.fermenter)[number]) => (d.window ? d.window.x + Math.min(d.window.w, 4) + 1 : 6);

describe('rangées de cuves de fermentation et de garde', () => {
  // le plan seul (écran aussi étroit que possible), puis un téléphone en portrait
  for (const [lo, hi, wide] of [[2, 153, false], [-24, 177, true]] as const) {
    it(`ne se chevauchent jamais et restent à l'écran (de ${lo} à ${hi})`, () => {
      for (let fl = 1; fl <= 5; fl++)
        for (let cl = 1; cl <= 5; cl++)
          for (let n = 1; n <= 4; n++)
            for (let m = 1; m <= 4; m++) {
              const fd = SPRITES.fermenter[fl - 1]!;
              const cd = SPRITES.conditioning[cl - 1]!;
              const { fx, gf, cx, gc } = layoutTankRows(fd, n, cd, m, lo, hi);
              const ctx = `fermentation ${fl}×${n}, garde ${cl}×${m}`;
              expect(fx + fd.w + 3, ctx).toBeLessThanOrEqual(cx - (m - 1) * gc);
              expect(fx - (n - 1) * gf, ctx).toBeGreaterThanOrEqual(lo);
              expect(cx + cd.w, ctx).toBeLessThanOrEqual(hi);
              // sur un téléphone, la jauge de chaque cuve de derrière reste visible
              if (wide) {
                if (n > 1) expect(gf, ctx).toBeGreaterThanOrEqual(gauge(fd));
                if (m > 1) expect(gc, ctx).toBeGreaterThanOrEqual(gauge(cd));
              }
            }
    });
  }
});
