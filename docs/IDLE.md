# Brew It Idle (prototype, branche `claude/idle-prototype`)

Essai d'un **jeu incrémental** sur le thème de la bière, à côté de Brew It. Si l'essai ne convainc pas, on revient
à la branche `claude/project-foundation`, intacte.

- Point d'entrée : `src/idle/main.ts` (choisi dans `index.html`) ; le jeu d'origine reste dans `src/main.ts`.
- Modèle pur et testé : `src/idle/model.ts` ; joueur simulé : `npm run idle-balance [heures]`.
- **Sauvegarde à part** (`brewit-idle-1`) : installer ce build ne touche pas la partie de Brew It.

## Le jeu
- **10 activités**, de la cuve du garage à la brasserie orbitale. On touche le dessin pour lancer un cycle ;
  il rapporte à la fin. Acheter des exemplaires multiplie les gains (×1, ×10, ×100, jusqu'au palier, Max).
- **Paliers** à 25, 50, 100, 200… exemplaires : le cycle va 2× plus vite (les machines de l'atelier grandissent
  avec). Quand toutes les activités passent un palier (25, 50, 100…), tous les gains doublent.
- **Maîtres brasseurs** (Gaston, Lucie, Lulu…) : ils font tourner une activité sans toi, même appli fermée.
- **Améliorations** (recettes et matériel) : ×3 sur une activité ou sur toutes, en trois vagues.
- **Levure mère** : repartir de zéro lègue des levures mères (√(gains de toutes les parties / 10⁸)), +2 % de
  gains chacune, pour toujours.
- **Absence** : les activités automatisées tournent sans plafond ; la bourse attend en haut, à récolter.
- **Gaston** guide les premiers pas en une bulle à la fois.

## Rythme mesuré (`npm run idle-balance 24`)
Fûts au marché vers 40 s, 5 activités et 4 maîtres brasseurs en 10 min, le festival vers 12 min, l'usine vers
40 min, la chaîne de bars vers 2 h, l'export vers 5 h, la brasserie orbitale vers 18 h. Repartir de zéro vaut
+20 % vers 2 h 20, +40 % vers 4 h, +80 % vers 8 h.

## Pas encore fait
Pubs et diamants, missions, notifications, traductions (le prototype est en français), sons propres au jeu.
