# Publier sur TestFlight (sans Mac)

L'app est compilée sur un Mac de GitHub Actions (`.github/workflows/testflight.yml`), puis envoyée sur TestFlight.
Tout se règle depuis un navigateur. Sur iPhone, Safari en « version ordinateur » (aA → Site pour ordinateur) facilite les pages Apple.

## 0. Prérequis
- Adhésion au **Apple Developer Program** (99 €/an) : developer.apple.com → Account → Enroll. La validation prend de quelques heures à 2 jours.

## 1. Choisir et enregistrer le Bundle ID
developer.apple.com → Certificates, IDs & Profiles → **Identifiers** → ＋ → App IDs → App
- Description : `Brew It`
- Bundle ID (Explicit) : `com.guigousse.brewit`

## 2. Créer l'app dans App Store Connect
appstoreconnect.apple.com → **Apps** → ＋ → Nouvelle app
- Plateforme : iOS · Nom : `Brew It` (le nom doit être libre sur l'App Store ; sinon `Brew It – Brasserie`)
- Langue : Français · Bundle ID : `com.guigousse.brewit` · UGS (SKU) : `brewit` (référence interne libre, non modifiable ensuite)

## 3. Créer une clé API App Store Connect
appstoreconnect.apple.com → **Utilisateurs et accès** → **Intégrations** → Clés API d'équipe → ＋
- Nom : `GitHub CI` · Accès : **Admin**. C'est nécessaire pour que Xcode crée lui-même le certificat de distribution.
- Noter le **Key ID** et l'**Issuer ID** affichés en haut de la page.
- **Télécharger** le fichier `AuthKey_XXXX.p8`. Il n'est téléchargeable qu'une seule fois : l'ouvrir dans l'app Fichiers et copier tout son texte.

Le **Team ID** se trouve dans developer.apple.com → Account → Membership details.

## 4. Ajouter les secrets GitHub
github.com/guigousse/brew-it → Settings → Secrets and variables → **Actions** → New repository secret

| Nom | Valeur |
|---|---|
| `APPLE_TEAM_ID` | Team ID (10 caractères) |
| `ASC_KEY_ID` | Key ID |
| `ASC_ISSUER_ID` | Issuer ID (UUID) |
| `ASC_KEY_P8` | tout le contenu du `.p8`, lignes `-----BEGIN PRIVATE KEY-----` et `-----END…` comprises |
| `IOS_BUNDLE_ID` | facultatif : `com.guigousse.brewit` est déjà la valeur par défaut |

## 5. Lancer le build
Le build se lance **à la demande** : github.com/guigousse/brew-it → **Actions** → TestFlight → **Run workflow** (choisir la branche). On peut aussi demander un build en modifiant le fichier `.github/testflight-request` (une ligne avec la date suffit) et en le poussant. Les autres pushes ne déclenchent plus de build : une machine macOS consomme le quota d'Actions dix fois plus vite qu'une machine Linux.
Le build prend environ 10 min, puis Apple le traite pendant 5 à 30 min.

## 6. Installer sur l'iPhone
1. App Store Connect → ton app → **TestFlight** → Testeurs internes → ＋ → t'ajouter (ton Apple ID).
2. Installer l'app **TestFlight** depuis l'App Store, puis accepter l'invitation reçue par e-mail.
3. Chaque nouveau build apparaît automatiquement dans TestFlight.

## 7. Achats intégrés : la boutique de diamants

Le jeu vend des diamants (achats consommables) avec StoreKit 2, via l'extension `@capgo/native-purchases`. Il n'y a ni serveur ni compte tiers. Pour que la boutique fonctionne :

1. **Accords** : dans App Store Connect, *Accords, taxes et banques*, signer l'accord **Apps payantes** et renseigner les coordonnées bancaires et fiscales. Sans lui, aucun produit ne se charge, même en test.
2. **Produits** : dans l'app, *Monétisation → Achats intégrés*, créer **5 achats consommables** avec exactement ces identifiants :

| Identifiant du produit | Diamants | Prix de référence |
|---|---|---|
| `com.guigousse.brewit.gems.starter` | 500 (pack de démarrage, une fois par partie) | 1,99 € |
| `com.guigousse.brewit.gems.80` | 80 | 0,99 € |
| `com.guigousse.brewit.gems.450` | 450 | 4,99 € |
| `com.guigousse.brewit.gems.1000` | 1 000 | 9,99 € |
| `com.guigousse.brewit.gems.2200` | 2 200 | 19,99 € |

   Pour chacun : un nom affiché et une description (en français), un prix, et une capture de la boutique pour la revue d'Apple. Les identifiants sont dans `src/core/shop.ts` (`GEM_PACKS`).
3. **Tester** : les achats faits depuis un build TestFlight passent par le bac à sable d'Apple et ne sont pas facturés. Le prix affiché vient de l'App Store, dans la devise du testeur ; tant que les produits ne répondent pas, le jeu affiche les prix de référence.
4. **Première soumission** : les achats intégrés doivent être joints à la version de l'app envoyée en revue.

Sécurité des achats : les diamants sont crédités, puis la partie sauvegardée, **avant** que la transaction soit terminée auprès d'Apple. Si l'app est tuée pendant un achat, Apple rend la transaction au lancement suivant et le jeu la crédite alors ; une même transaction n'est jamais créditée deux fois.

## En cas d'échec
- *No profiles / No signing certificate* : vérifier que la clé API a bien le rôle **Admin**.
- *No suitable application records were found* : l'app de l'étape 2 n'existe pas, ou son Bundle ID diffère de `IOS_BUNDLE_ID`.
- *The bundle version must be higher* : relancer simplement le workflow, le numéro de build suit le numéro d'exécution.
