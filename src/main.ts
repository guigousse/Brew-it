import './ui/style.css';
import { FixedStepLoop, Game, simulateOffline } from './core/game';
import { SaveManager } from './core/save';
import { clientTypeById } from './core/orders';
import { TRENDS } from './core/trends';
import { onAppLifecycle, tapFeedback } from './platform/lifecycle';
import { createStorage } from './platform/storage';
import { App } from './ui/app';
import { loadDevLayout } from './dev/layoutTool'; // DEV

const AUTOSAVE_SECONDS = 20;

async function boot() {
  loadDevLayout(); // DEV : mise en page des décors gardée par l'outil
  const saves = new SaveManager(createStorage());
  let game: Game;
  try {
    const loaded = await saves.load();
    game = loaded?.game ?? new Game();
    if (loaded) {
      // l'horloge réelle repart de la sauvegarde : le quota du grossiste se recharge si minuit est passé pendant l'absence
      loaded.game.wall = Date.now() - loaded.elapsedSeconds * 1000;
      simulateOffline(game, loaded.elapsedSeconds);
    }
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
    app.resetMessages();
    unsubscribe = game.events.on((e) => {
      if (muted) return; // rattrapage hors-ligne : pas de rafale de notifications
      const beerName = (id: number | null) => (id == null ? 'Essai' : game.beers.find((b) => b.id === id)?.name ?? 'Essai');
      if (e.type === 'stage') app.scene.onStage(e.stage, performance.now() / 1000);
      if (e.type === 'trend') {
        const tr = TRENDS.find((t) => t.id === e.id);
        app.toast(`Tendance : ${tr?.short}`, 'info');
        app.log(`Nouvelle tendance : ${tr?.text ?? tr?.short}`, 'info', 'trend');
      }
      if (e.type === 'batchRuined') {
        app.toast(`Lot de « ${beerName(e.beerId)} » raté`, 'bad');
        app.log(`Lot de « ${beerName(e.beerId)} » raté : il part à l'égout`, 'bad', 'brew');
      }
      if (e.type === 'batchDone' && e.beerId != null) {
        app.log(`Brassin de « ${beerName(e.beerId)} » terminé : ${e.kegs ? `${e.kegs} fût${e.kegs > 1 ? 's' : ''}` : `${e.bottles} bouteilles`}`, 'good', 'crate');
      }
      if (e.type === 'breweryLevel') {
        app.scene.flash();
        app.openBrewery(true);
        tapFeedback(true);
        app.log(`La brasserie passe au niveau ${e.level} !`, 'good', 'up');
      }
      if (e.type === 'clientAvailable') {
        app.toast(`Nouveaux clients : ${clientTypeById(e.id)?.label}`, 'good');
        app.log(`Nouveaux clients : ${clientTypeById(e.id)?.label}`, 'good', 'bubble');
      }
      if (e.type === 'order') {
        app.toast(`📨 ${e.client}`, 'good');
        app.log(`Nouvelle commande : ${e.client}`, 'good', 'envelope');
        tapFeedback(false);
      }
      if (e.type === 'autoSent') app.log(`Livreur : commande « ${e.client} » livrée, +${Math.round(e.amount).toLocaleString('fr-FR')} €`, 'good', 'courier');
      if (e.type === 'orderExpired') app.log(`Commande expirée : ${e.client}`, 'bad', 'clipboard');
    });
    app.update();
    void saves.save(game);
  }
  start(game);

  let last = performance.now();
  let uiTimer = 0;
  let saveTimer = 0;
  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    game.wall = Date.now();
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
      game.wall = pausedAt;
      simulateOffline(game, (Date.now() - pausedAt) / 1000);
      muted = false;
      last = performance.now();
      },
  );

  (window as unknown as { brewit: unknown }).brewit = { get game() { return game; }, app, saves };
}

void boot();
