import { describe, expect, it } from 'vitest';
import { decorAsset, decorLights } from './decor';
import { DECOR_ASSETS } from './decorAssets';
import { applyDecor, DECOR_DEFAULT, decorLayout, resetDecor, ROOM_LEVELS, type RoomKey } from './decorLayout';

describe('décors des pièces', () => {
  it('chaque pièce a ses niveaux, et chaque décor posé existe au catalogue', () => {
    for (const room of Object.keys(ROOM_LEVELS) as RoomKey[]) {
      for (let lv = 1; lv <= ROOM_LEVELS[room]; lv++) {
        const items = DECOR_DEFAULT[room][lv];
        expect(items, `${room} ${lv}`).toBeDefined();
        for (const i of items!) expect(decorAsset(i.a), i.a).toBeDefined();
        expect(new Set(items!.map((i) => i.id)).size).toBe(items!.length);
      }
    }
    expect(new Set(DECOR_ASSETS.map((a) => a.id)).size).toBe(DECOR_ASSETS.length);
  });

  it('les lampes posées éclairent la pièce, à leur place et à leur échelle', () => {
    resetDecor();
    const [x, y, r] = decorLights('bar', 1)[0]!;
    expect([x, y, r]).toEqual([80, 18, 50]); // l'ampoule du comptoir poussiéreux
    decorLayout.bar[1]!.find((i) => i.a === 'bulb')!.s = 2;
    expect(decorLights('bar', 1)[0]![2]).toBe(100);
    resetDecor();
  });

  it('une disposition gardée est reprise, sans ce qui est mal formé', () => {
    applyDecor({ office: { 1: [{ id: 'mug-1', a: 'mug', x: 10.4, y: 20, s: 2, f: true }, { id: 'x', a: 'mug' }, null] } });
    expect(decorLayout.office[1]).toEqual([{ id: 'mug-1', a: 'mug', x: 10, y: 20, s: 2, f: true }]);
    resetDecor('office');
    expect(decorLayout.office[1]).toEqual(DECOR_DEFAULT.office[1]);
  });
});
