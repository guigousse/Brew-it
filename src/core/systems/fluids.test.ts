import { Alert } from '../building';
import { World } from '../world';

const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) w.step();
};
const get = (w: World, r: { ok: boolean; id?: number }) => w.buildings.get(r.id!)!;

describe('réseau de fluides', () => {
  it('l’eau coule le long des tuyaux jusqu’à une cuve', () => {
    const w = new World({ tutorial: false, money: 1e4 });
    w.place('water_tap', 0, 0);
    for (let x = 1; x <= 4; x++) w.place('conduit', x, 0, 0);
    const tank = w.place('tank', 5, 0);
    run(w, 20);
    const t = get(w, tank).fluid!;
    expect(t.fluid).toBe('water');
    expect(t.amount).toBeGreaterThan(40); // 80 L produits, le reste est en transit dans les tuyaux
  });

  it('le débit d’un tuyau est plafonné (goulot d’étranglement)', () => {
    const w = new World({ tutorial: false, money: 1e4 });
    const tap = w.place('water_tap', 0, 0);
    w.setParam(tap.id!, 'rate', 1000);
    w.place('conduit', 1, 0, 0);
    const tank = w.place('tank', 2, 0);
    run(w, 5);
    expect(get(w, tank).fluid!.amount).toBeLessThanOrEqual(20 * 5 + 1e-6);
  });

  it('une pompe qui pousse dans un tuyau bouché crée une surpression puis une casse avec fuite', () => {
    const w = new World({ tutorial: false, money: 1e4 });
    w.place('water_tap', 0, 0);
    w.place('pump', 1, 0, 0);
    const pipe = w.place('conduit', 2, 0, 0); // impasse
    const broken: number[] = [];
    w.events.on((e) => e.type === 'broken' && broken.push(e.buildingId));
    run(w, 30);
    const p = get(w, pipe);
    expect(p.health).toBe(0);
    expect(p.alerts & Alert.Broken).toBeTruthy();
    expect(broken).toEqual([pipe.id]);
  });

  it('deux fluides différents ne se mélangent pas', () => {
    const w = new World({ tutorial: false, money: 1e4 });
    w.place('water_tap', 0, 0);
    w.place('conduit', 1, 0, 0);
    const pipe = get(w, w.place('conduit', 2, 0, 0));
    pipe.fluid = { fluid: 'beer', amount: 5, temp: 4, batch: null };
    run(w, 1);
    expect(pipe.fluid.fluid).toBe('beer');
    expect(get(w, { ok: true, id: 2 }).alerts & Alert.MixedFluids).toBeTruthy();
  });

  const coolLine = (coolers: number) => {
    const w = new World({ tutorial: false, money: 1e4 });
    const src = get(w, w.place('tank', 0, 0));
    src.fluid = { fluid: 'hopped_wort', amount: 100, temp: 100, batch: null };
    for (let i = 0; i < coolers; i++) w.place('cooler', 2 + i, 0, 0);
    w.place('conduit', 2 + coolers, 0, 0);
    const dst = get(w, w.place('tank', 3 + coolers, 0));
    run(w, 10);
    return dst.fluid!;
  };

  it('un refroidisseur abaisse fortement la température du moût qui le traverse', () => {
    const out = coolLine(1);
    expect(out.amount).toBeGreaterThan(10);
    expect(out.temp).toBeLessThan(40);
  });

  it('deux refroidisseurs en série refroidissent au moins aussi bien qu’un seul', () => {
    expect(coolLine(2).temp).toBeLessThanOrEqual(coolLine(1).temp + 1e-9);
  });
});
