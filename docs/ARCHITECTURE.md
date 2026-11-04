# Architecture

**TypeScript + Canvas 2D (pixel art à résolution native) + interface DOM, packagé pour iOS avec Capacitor.**

```
src/
├── core/                 logique pure, testée (Vitest)
│   ├── brewing/model.ts  modèle de brassage réaliste (recette + niveaux + températures réelles → dégustation)
│   ├── brewing/strains.ts levures
│   ├── stations.ts       les 7 machines : réglages, niveaux, durées
│   ├── market.ts         niveaux du bar, fûts, prix
│   ├── orders.ts         tableau de commandes : profils de clients, types de commandes, grossiste
│   ├── trends.ts         tendances du moment et popularité (bières, marque)
│   ├── shop.ts           catalogues : boosts, personnel, mobilier du bar, déblocages d'étiquettes
│   ├── warehouse.ts      niveaux du stockage, places de la gamme
│   ├── game.ts           état de la partie : lots dans la chaîne, gamme, bar, commandes, améliorations, hors-ligne
│   └── save.ts           sauvegarde JSON (emplacement « brewit-sim-1 »)
├── render/
│   ├── painter.ts        peintre pixel « 32-bit » (palettes, tramage, contours colorés)
│   ├── sprites.ts        les 21 sprites (7 machines × 3 niveaux) et leurs points d'accroche
│   ├── scene.ts          l'atelier : la brasserie verticale (canvas 160 × 300 agrandi au pixel près)
│   ├── rooms.ts          le stockage et le bar (salle en haut, cave à fûts en bas), 5 décors chacun
│   ├── bottleArt.ts      bouteilles de l'étagère, caisses
│   ├── officeRoom.ts     le bureau : fenêtre sur l'atelier (en direct), panneau des commandes, présentoir de la gamme, ordinateur ; 5 décors
│   ├── shopRoom.ts       le magasin : étagères, objet en vente, comptoir du marchand
│   ├── icons.ts          icônes en pixel art (actions, enveloppe, objets du magasin)
│   └── space.ts          profondeur : sols en perspective (point de fuite), ombrage tramé, ombres portées
├── ui/                   interface DOM : header, barre de navigation en bas (pièces, magasin), boutons d'action carrés et objets du décor à toucher, glissement, panneaux,
│                         ordinateur du bureau (menu d'applications, tableau de bord, messages…), dégustation, Gaston
├── platform/             Capacitor : stockage fichier, cycle de vie, haptique
└── main.ts               boucle à pas fixe (20 ticks/s), sauvegarde auto, production hors-ligne
```

- **Simulation :** à pas fixe, déterministe (PRNG sérialisé). Chaque lot porte une copie de sa recette. La température réelle de chaque étape est tirée à l'entrée dans la machine, selon la précision de son niveau.
- **Pièces :** les canvas (bureau, atelier, stockage, bar, magasin) sont posés côte à côte sur une piste qui glisse au doigt. Seule la pièce affichée est redessinée, et ses voisines pendant un glissement ; au bureau, l'atelier l'est aussi, car on le voit par la fenêtre. Un glissement « avale » le clic qui suit, pour ne pas ouvrir la machine sous le doigt.
- **Rendu :** chaque pièce a un plan de 160 × 300 px, agrandi au pixel près (`image-rendering: pixelated`) pour tenir entier à l'écran. Son canvas couvre tout l'écran : le décor (murs, sols, passerelles) est peint d'un seul tenant jusqu'aux bords, plus large ou plus haut que le plan selon le format, sans rien recopier. Les sols de toutes les pièces fuient vers un point à hauteur des yeux ; l'ombrage (coins, pied des murs, lampes, ombres portées) est tramé au pixel, une fois, quand le décor est mis en cache. Les sprites sont peints une seule fois puis mis en cache, et les effets sont redessinés à chaque image.
- **iOS :** `.github/workflows/testflight.yml`, lancé à la demande depuis l'onglet Actions, compile, signe et envoie le build sur TestFlight (voir `docs/TESTFLIGHT.md`).
