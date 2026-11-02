# Architecture

**TypeScript + Canvas 2D (pixel art à résolution native) + interface DOM, packagé pour iOS avec Capacitor.**

```
src/
├── core/                 logique pure, testée (Vitest)
│   ├── brewing/model.ts  modèle de brassage réaliste (recette + niveaux + températures réelles → dégustation)
│   ├── brewing/strains.ts levures
│   ├── stations.ts       les 7 machines : réglages, niveaux, durées
│   ├── market.ts         clients et commandes, niveaux du bar, fûts, prix
│   ├── trends.ts         tendances du moment et popularité (bières, marque)
│   ├── warehouse.ts      niveaux du stockage, places de la gamme
│   ├── game.ts           état de la partie : lots dans la chaîne, gamme, bar, commandes, améliorations, hors-ligne
│   └── save.ts           sauvegarde JSON (emplacement « brewit-sim-1 »)
├── render/
│   ├── painter.ts        peintre pixel « 32-bit » (palettes, tramage, contours colorés)
│   ├── sprites.ts        les 21 sprites (7 machines × 3 niveaux) et leurs points d'accroche
│   ├── scene.ts          l'atelier : la brasserie verticale (canvas 160 × 300 agrandi au pixel près)
│   ├── rooms.ts          le stockage et le bar (salle en haut, cave à fûts en bas), 5 décors chacun
│   └── bottleArt.ts      bouteilles de l'étagère, caisses
├── ui/                   interface DOM : header et onglets de pièces, glissement, barre du bas par pièce, panneaux,
│                         ordinateur des commandes, dégustation, Gaston
├── platform/             Capacitor : stockage fichier, cycle de vie, haptique
└── main.ts               boucle à pas fixe (20 ticks/s), sauvegarde auto, production hors-ligne
```

- **Simulation :** à pas fixe, déterministe (PRNG sérialisé). Chaque lot porte une copie de sa recette. La température réelle de chaque étape est tirée à l'entrée dans la machine, selon la précision de son niveau.
- **Pièces :** les trois canvas (atelier, stockage, bar) sont posés côte à côte sur une piste qui glisse au doigt. Seule la pièce affichée est redessinée, et ses voisines pendant un glissement. Un glissement « avale » le clic qui suit, pour ne pas ouvrir la machine sous le doigt.
- **Rendu :** un canvas de 160 px de large, agrandi au pixel près (`image-rendering: pixelated`). Les sprites sont peints une seule fois puis mis en cache, et les effets sont redessinés à chaque image.
- **iOS :** chaque push sur la branche lance `.github/workflows/testflight.yml`, qui compile, signe et envoie le build sur TestFlight (voir `docs/TESTFLIGHT.md`).
