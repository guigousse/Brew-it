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
  const demo = new URLSearchParams(location.search).has('demo') || import.meta.env.VITE_DEMO === '1';
  let world: World;
  let offlineEarned = 0;
  try {
    const loaded = demo ? null : await saves.load();
    world = loaded?.world ?? (demo ? buildReferenceBrewery({ money: 5_000 }) : new World());
    if (loaded && loaded.elapsedSeconds > 5) offlineEarned = simulateOffline(world, loaded.elapsedSeconds).earned;
  } catch (err) {
    console.error('Sauvegarde illisible, nouvelle partie', err);
    world = new World();
  }

  const renderer = new GameRenderer();
  await renderer.init(document.getElementById('game')!);
  let loop = new FixedStepLoop(world);

  const input = new InputController(renderer.app.canvas, renderer, () => world, {
    onSelect: (id) => {
      hud.select(id);
      renderer.selectedId = id;
    },
    onBuilt: (count, reason) => {
      if (count > 0) tapFeedback();
      else if (reason) hud.toast(world.tutorial.done ? reason : 'Touche la case qui clignote', 'bad');
    },
  });

  // Cadre la zone constructible entre la barre du haut et Gaston / la barre d'outils.
  const fitView = () =>
    renderer.camera.fit(world.grid.unlockedW, world.grid.unlockedH, {
      x: 0, y: hud.topInset, w: renderer.app.screen.width, h: hud.bottomInset - hud.topInset,
    });

  const hud = new Hud(document.getElementById('hud')!, () => world, input, {
    setSpeed: (s) => (loop.speed = s),
    getSpeed: () => loop.speed,
    newGame: () => startWorld(new World()),
    layoutChanged: () => requestAnimationFrame(fitView),
  });

  let unsubscribe = () => {};
  function startWorld(w: World) {
    unsubscribe();
    world = w;
    loop = new FixedStepLoop(world);
    renderer.selectedId = null;
    hud.select(null);
    unsubscribe = world.events.on((e) => {
      hud.onEvent(e);
      if (e.type === 'expanded') fitView();
      if (e.type === 'crateDelivered' || e.type === 'tutorialDone') tapFeedback(true);
    });
    hud.update();
    requestAnimationFrame(fitView);
    if (!demo) void saves.save(world);
  }
  startWorld(world);

  void document.fonts?.ready.then(() => requestAnimationFrame(fitView)); // les polices changent la hauteur des barres
  window.addEventListener('resize', () => requestAnimationFrame(fitView)); // rotation de l'écran
  if (offlineEarned > 0) hud.toast(`Pendant ton absence : +${offlineEarned.toFixed(0)} €`, 'good');

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
      if (!demo) void saves.save(world);
    },
    () => {
      if (pausedAt) {
        const { earned } = simulateOffline(world, (Date.now() - pausedAt) / 1000);
        if (earned > 1) hud.toast(`Pendant ton absence : +${earned.toFixed(0)} €`, 'good');
      }
      renderer.app.ticker.start();
    },
  );

  // Accès console pour le debug
  (window as unknown as { brewit: unknown }).brewit = { get world() { return world; }, saves, renderer, hud };
}

void boot();
