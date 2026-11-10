import './ui/style.css';
import { FixedStepLoop, Game, simulateOffline } from './core/game';
import { SaveManager } from './core/save';
import { clientTypeById } from './core/orders';
import { GEM_PACKS } from './core/shop';
import { TRENDS } from './core/trends';
import { onAppLifecycle, tapFeedback } from './platform/lifecycle';
import { createGemStore, type Purchase } from './platform/purchases';
import { createStorage } from './platform/storage';
import { sfx } from './platform/audio';
import { App } from './ui/app';

const AUTOSAVE_SECONDS = 20;

async function boot() {
  sfx.install();
  sfx.preload();
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

  // Boutique de diamants : un achat est crédité et sauvegardé avant d'être terminé auprès de l'App Store,
  // pour qu'il ne se perde jamais (l'App Store le rend au prochain lancement tant qu'il n'est pas terminé).
  const store = createGemStore();
  const credit = async (p: Purchase) => {
    const r = game.grantPurchase(p.productId, p.transactionId);
    if (r.ok || r.reason === 'Achat déjà crédité') {
      await saves.save(game);
      await store.finish(p.transactionId);
    }
    return r;
  };

  const app = new App(document.getElementById('app')!, () => game, {
    getSpeed: () => loop.speed,
    setSpeed: (s) => (loop.speed = s),
    newGame: () => start(new Game()),
    storeKind: () => store.kind,
    gemPrices: () => store.prices(GEM_PACKS.map((p) => p.productId)),
    buyGems: async (productId) => {
      try {
        const p = await store.buy(productId);
        if (!p) return { ok: false, cancelled: true };
        return await credit(p);
      } catch (e) {
        console.error('Achat de diamants', e);
        return { ok: false, reason: e instanceof Error ? e.message : 'Achat impossible pour le moment' };
      }
    },
  });

  app.onTasteReady = () => {
    tapFeedback(true);
    sfx.play('notif');
  };
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
        sfx.play('newspaper');
        app.toast(`Tendance : ${tr?.short}`, 'info');
        app.log(`Nouvelle tendance : ${tr?.text ?? tr?.short}`, 'info', 'trend');
      }
      if (e.type === 'batchRuined') {
        sfx.play('break');
        app.toast(`Lot de « ${beerName(e.beerId)} » raté`, 'bad');
        app.log(`Lot de « ${beerName(e.beerId)} » raté : il part à l'égout`, 'bad', 'brew');
      }
      if (e.type === 'batchDone' && e.beerId != null) {
        app.log(`Brassin de « ${beerName(e.beerId)} » terminé : ${e.kegs ? `${e.kegs} fût${e.kegs > 1 ? 's' : ''}` : `${e.bottles} bouteilles`}`, 'good', 'crate');
      }
      if (e.type === 'breweryLevel') {
        sfx.play('levelUp');
        app.scene.flash();
        app.openBrewery(true);
        tapFeedback(true);
        app.log(`La brasserie passe au niveau ${e.level} !`, 'good', 'up');
      }
      if (e.type === 'clientAvailable') {
        sfx.play('carillon');
        app.toast(`Nouveaux clients : ${clientTypeById(e.id)?.label}`, 'good');
        app.log(`Nouveaux clients : ${clientTypeById(e.id)?.label}`, 'good', 'bubble');
      }
      if (e.type === 'order') {
        sfx.play('paper');
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

  // achats payés mais pas encore crédités (app tuée pendant l'achat, achat approuvé plus tard)
  const recover = async (p: Purchase) => {
    const r = await credit(p);
    if (r.ok) app.toast(`Achat reçu : +${r.gems} diamants`, 'good');
  };
  store.onUpdate((p) => void recover(p));
  void store.pending().then(async (list) => {
    for (const p of list) await recover(p);
  });

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
