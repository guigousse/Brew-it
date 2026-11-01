import './ui/style.css';
import { SaveManager } from './core/save/storage';
import { FixedStepLoop, simulateOffline } from './core/sim/loop';
import { buildReferenceBrewery } from './core/testing/scenarios';
import { World } from './core/world';
import { createStorage } from './platform/storage';
import { onAppLifecycle, tapFeedback } from './platform/lifecycle';
import { GameRenderer } from './render/renderer';
import { Hud } from './ui/hud';
import { InputController } from './ui/input';

const AUTOSAVE_SECONDS = 30;

async function boot() {
  const saves = new SaveManager(createStorage());
  let world: World;
  let offlineEarned = 0;
  const demo = new URLSearchParams(location.search).has('demo') || import.meta.env.VITE_DEMO === '1';
  try {
    if (demo) throw new Error('demo');
    const loaded = await saves.load();
    world = loaded?.world ?? new World();
    if (loaded && loaded.elapsedSeconds > 5) offlineEarned = simulateOffline(world, loaded.elapsedSeconds).earned;
  } catch (err) {
    // ?demo : charge la brasserie de référence (pratique pour tester le rendu dans un navigateur).
    if (!demo) console.error('Sauvegarde illisible, nouvelle partie', err);
    world = demo ? buildReferenceBrewery({ money: 5_000 }) : new World();
  }

  const renderer = new GameRenderer();
  await renderer.init(document.getElementById('game')!);
  // Cadre la zone constructible entre la barre du haut et la barre d'outils.
  const fitView = () => {
    const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
    const bottom = document.querySelector('.toolbar')?.getBoundingClientRect().top ?? renderer.app.screen.height;
    renderer.camera.fit(world.grid.unlockedW, world.grid.unlockedH, { x: 0, y: top, w: renderer.app.screen.width, h: bottom - top });
  };

  const input = new InputController(renderer.app.canvas, renderer, () => world, {
    onSelect: (id) => {
      hud.select(id);
      renderer.selectedId = id;
    },
    onBuilt: (count, reason) => {
      if (count > 0) tapFeedback();
      else if (reason) hud.toast(reason, 'bad');
    },
  });
  const hud = new Hud(document.getElementById('hud')!, () => world, input);
  world.events.on((e) => {
    hud.onEvent(e);
    if (e.type === 'expanded') fitView();
  });
  requestAnimationFrame(fitView);
  void document.fonts?.ready.then(() => requestAnimationFrame(fitView)); // les polices changent la hauteur des barres
  window.addEventListener('resize', () => requestAnimationFrame(fitView)); // rotation de l'écran
  if (offlineEarned > 0) hud.toast(`Pendant votre absence : +${offlineEarned.toFixed(0)} €`, 'good');

  const loop = new FixedStepLoop(world);
  let hudTimer = 0;
  let saveTimer = 0;
  renderer.app.ticker.add((t) => {
    const dt = t.deltaMS / 1000;
    loop.advance(dt);
    renderer.selectedId = hud.selectedId;
    renderer.draw(world);
    if ((hudTimer += dt) > 0.25) {
      hudTimer = 0;
      hud.update();
    }
    if ((saveTimer += dt) > AUTOSAVE_SECONDS) {
      saveTimer = 0;
      if (!demo) void saves.save(world);
    }
  });

  let pausedAt = 0;
  onAppLifecycle(
    () => {
      pausedAt = Date.now();
      renderer.app.ticker.stop();
      void saves.save(world);
    },
    () => {
      if (pausedAt) {
        const { earned } = simulateOffline(world, (Date.now() - pausedAt) / 1000);
        if (earned > 1) hud.toast(`Pendant votre absence : +${earned.toFixed(0)} €`, 'good');
      }
      renderer.app.ticker.start();
    },
  );

  // Accès console pour le debug
  (window as unknown as { brewit: unknown }).brewit = { get world() { return world; }, saves, renderer };
}

void boot();
