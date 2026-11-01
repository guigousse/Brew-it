# Brew It 🍺

Jeu mobile de gestion et d'automatisation de brasserie en pixel art : on part d'un garage et on finit avec une usine.
On construit des chaînes de production (convoyeurs, tuyaux, cuves), on règle librement ses recettes et on vend sur un marché qui change.

**Plateforme prioritaire : iOS (App Store).** Android viendra ensuite avec le même code.

## Démarrage

```bash
npm install
npm run dev          # http://localhost:5173 — ajouter ?demo pour charger une brasserie complète
npm test             # tests de la simulation (Vitest)
npm run typecheck
```

## iOS

Il faut un Mac avec Xcode 16 ou plus récent. Le projet Xcode se trouve dans `ios/` et utilise Swift Package Manager, donc CocoaPods n'est pas nécessaire.

```bash
npm run ios:sync     # build web + copie dans le projet Xcode
npm run ios:open     # ouvre Xcode → choisir l'équipe de signature → Run sur iPhone
```

Avant la première soumission :
1. remplacer `appId` dans `capacitor.config.ts` par le Bundle ID créé dans App Store Connect, puis relancer `npx cap sync ios` ;
2. configurer les icônes et le launch screen dans `ios/App/App/Assets.xcassets` ;
3. Product → Archive → Distribute → TestFlight.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) : choix de la stack, structure du code, état, sauvegarde, boucle de jeu
- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) : piliers, mécaniques déjà en place et feuille de route
