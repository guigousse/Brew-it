import './ui/style.css';
import { FixedStepLoop, Game, simulateOffline } from './core/game';
import { SaveManager } from './core/save';
import { clientTypeById } from './core/orders';
import { TRENDS } from './core/trends';
import { onAppLifecycle, tapFeedback } from './platform/lifecycle';
import { createStorage } from './platform/storage';
import { App } from './ui/app';

const AUTOSAVE_SECONDS = 20;

async function boot() {
  const saves = new SaveManager(createStorage());
  let game: Game;
  try {
    const loaded = await saves.load();
    game = loaded?.game ?? new Game();
    if (loaded) simulateOffline(game, loaded.elapsedSeconds);
  } catch (err) {
    console.error('Sauvegarde illisible, nouvelle partie', err);
    game = new Game();
  }
  let loop = new FixedStepLoop(() => game);

  const app = new App(document.getElementById('app')!, () => game, {
    getSpeed: () => loop.speed,
    setSpeed: (s) => (loop.speed = s),
    newGame: () => start(new Game()),
  });

  app.onTasteReady = () => tapFeedback(true);
  app.onSent = () => tapFeedback(true);
  let unsubscribe = () => {};
  let muted = false;
  function start(g: Game) {
    unsubscribe();
    game = g;
    loop = new FixedStepLoop(() => game);
    unsubscribe = game.events.on((e) => {
      if (muted) return; // rattrapage hors-ligne : pas de rafale de notifications
      if (e.type === 'stage') app.scene.onStage(e.stage, performance.now() / 1000);
      if (e.type === 'trend') app.toast(`Tendance : ${TRENDS.find((t) => t.id === e.id)?.short}`, 'info');
      if (e.type === 'batchRuined') app.toast(`Lot de « ${game.beers.find((b) => b.id === e.beerId)?.name} » raté`, 'bad');
      if (e.type === 'breweryLevel') {
        app.scene.flash();
        app.openBrewery(true);
        tapFeedback(true);
      }
      if (e.type === 'clientAvailable') app.toast(`Nouveaux clients : ${clientTypeById(e.id)?.label}`, 'good');
      if (e.type === 'order') {
        app.toast(`📨 ${e.client}`, 'good');
        tapFeedback(false);
      }
    });
    app.update();
    if (game.offline) app.openOffline();
    void saves.save(game);
  }
  start(game);

  let last = performance.now();
  let uiTimer = 0;
  let saveTimer = 0;
  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    loop.advance(dt);
    app.frame(now / 1000);
    if ((uiTimer += dt) > 0.25) {
      uiTimer = 0;
      app.update();
    }
    if ((saveTimer += dt) > AUTOSAVE_SECONDS) {
      saveTimer = 0;
      void saves.save(game);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  let pausedAt = 0;
  onAppLifecycle(
    () => {
      pausedAt = Date.now();
      void saves.save(game);
    },
    () => {
      if (!pausedAt) return;
      app.scene.invalidate();
      app.storageRoom.invalidate();
      app.barRoom.invalidate();
      muted = true;
      simulateOffline(game, (Date.now() - pausedAt) / 1000);
      muted = false;
      last = performance.now();
      if (game.offline) app.openOffline();
    },
  );

  (window as unknown as { brewit: unknown }).brewit = { get game() { return game; }, app, saves };
}

void boot();
