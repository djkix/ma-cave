# Ma Cave — propositions de zones à partir de la photo du plan

Date : 21 octobre 2026. Version visée : 2.16.0.

## Intention

Placer les zones à la main sur un plan est fastidieux quand le plan est la
photo d'un casier ou d'une étagère. djkix veut que l'application **propose par
défaut** les zones de rangement : l'IA analyse la photo, détecte les blocs
(casier, étagère) et leur grille de cases, et propose un nom cohérent.

Choix de djkix :

1. Un **bloc** détecté devient une **zone** (avec son repère) ; ses **cases**
   deviennent les valeurs proposées du champ « casier » pour ranger une
   bouteille dans cette zone.
2. L'analyse part **automatiquement** à chaque plan créé ou photo remplacée, en
   arrière-plan, sans jamais bloquer.
3. Nommage : blocs « Casier A », « Étagère B »… de gauche à droite ; cases en
   ligne × colonne, « A1, A2… » pour la première ligne, « B1, B2… » pour la
   deuxième.
4. Pour ranger : une **grille à toucher** sous le champ « casier », **et** des
   suggestions de cases dans le champ pendant la frappe.

IA : **Gemini**, déjà intégré (budget par cave, pause commune après un refus,
reprises patientes, journal des appels). Aucune autre IA.

Réussi quand : djkix photographie son casier de 24 alvéoles, quelques dizaines
de secondes plus tard le plan montre « Casier A · 24 cases » en pointillés ;
un toucher, « Accepter », et à l'entrée suivante il range une bouteille en
touchant la case « B3 ».

## Hors périmètre

- Détecter les bouteilles présentes dans les cases.
- Plans imbriqués, zones à formes libres (le cadre est un rectangle).
- Relancer l'analyse à la demande (seulement à l'envoi d'une photo).

## Données

### Plan (`cave_plan`)

- `analysis_status` : `NONE` (plans existants), `PENDING`, `DONE`, `FAILED`.
- `suggestions` (jsonb, `[]` par défaut) : propositions en attente, chacune
  `{ id, kind: 'CASIER' | 'ETAGERE' | 'AUTRE', name, box: [x0, y0, x1, y1],
  rows, cols }` — `box` en fractions de l'image (0 à 1, `x0 < x1`, `y0 < y1`),
  `rows` et `cols` entiers de 1 à 26 et de 1 à 30.
- Remplacer la photo vide `suggestions` et repasse à `PENDING`.

### Zone (`cave_zone`)

- `grid_rows`, `grid_cols` : entiers nullables (1 à 26 lignes, 1 à 30
  colonnes), tous deux nuls ou tous deux renseignés (CHECK). Les cases sont
  calculées, jamais stockées : ligne `i` → lettre `A + i`, colonne `j` → `j + 1`.

Migration : ajout seulement (`NONE`, `[]`, grilles nulles).

## Analyse (api, file d'attente)

- Après `POST /plans` et `PUT /plans/:id/image` réussis : `analysis_status =
  PENDING`, une tâche `plan-analysis` (BullMQ, file existante du worker ou file
  dédiée) avec l'id du plan.
- Le worker relit le plan (abandon silencieux s'il n'existe plus ou si sa photo
  a changé depuis — comparer `updated_at` à celui de la tâche), envoie l'image
  à Gemini avec une sortie structurée : liste de blocs `{ kind, box, rows,
  cols }`. Consigne : rangements à bouteilles seulement, cadre serré, nombre de
  cases par ligne et par colonne, au plus 12 blocs.
- Le serveur valide (bornes, cadre non dégénéré, au plus 12 blocs ; un bloc
  invalide est ignoré), trie les blocs par `x0` puis `y0`, et nomme :
  `CASIER` → « Casier X », `ETAGERE` → « Étagère X », `AUTRE` → « Rangement X »,
  `X` = prochaine lettre libre (A, B, …) en sautant toute lettre déjà employée
  par une zone active de la cave sous la forme « <Type> <lettre> » (sans
  tenir compte de la casse) ou par une proposition précédente du même lot.
- Succès : `DONE` + `suggestions`. Zéro bloc : `DONE` + `[]`.
- Appel journalisé avec l'usage `ANALYSE_PLAN` (« Analyse du plan »), coût
  imputé au budget de la cave, pause commune respectée ; refus (503, 429) et
  erreurs passagères : reprises patientes comme les autres appels ; échec
  définitif ou réponse inexploitable : `FAILED`. Jamais d'erreur visible
  ailleurs que l'état du plan.

## API

| Méthode et chemin | Rôle | Effet |
|---|---|---|
| `GET /api/caves/current/plans` | membre | chaque plan gagne `analysis` (`NONE`/`PENDING`/`DONE`/`FAILED`) et `suggestions` |
| `POST /api/caves/current/plans/:id/suggestions/:sid/accept` | propriétaire | corps `{ name, rows, cols }` (mêmes règles que le nom de zone et les bornes de grille) ; crée la zone (fin de liste), son repère au centre du cadre sur ce plan, sa grille ; retire la proposition ; 201 avec la zone ; nom pris → 409 « Une zone porte déjà ce nom » (message existant) |
| `DELETE /api/caves/current/plans/:id/suggestions/:sid` | propriétaire | retire la proposition ; 204 |
| `PATCH /api/caves/current/zones/:id` | propriétaire | accepte aussi `grid: { rows, cols } \| null` |
| `GET /api/caves/current/zones/:id/cells` | membre | `[{ casier, quantity }]` : stock > 0 par valeur de casier dans la zone (casier non vide) |

- Proposition ou plan d'une autre cave → 404 « Plan introuvable » ; proposition
  absente → 404 « Proposition introuvable ».
- `ZoneView` gagne `grid: { rows, cols } | null`.
- Toutes les nouvelles routes dans la matrice d'isolation.

## Écrans

### Ma cave › Plans

- `PENDING` : sous le plan, « Analyse du plan en cours… » ; la requête des
  plans se relit toutes les 10 s tant qu'un plan est `PENDING`.
- `FAILED` : « Les zones n’ont pas pu être proposées. Placez-les à la main. »
- `DONE` avec propositions : cadres en pointillés sur le plan (bord
  `--color-primary-container`), étiquette « Casier A · 24 cases » ; chaque
  cadre est un bouton (« Proposition Casier A ») ; au-dessus du plan, « 3 zones
  proposées : touchez-les pour les accepter. »
- Toucher un cadre : feuille du bas « Proposition » avec « Nom » (prérempli),
  « Lignes » et « Colonnes » (préremplis), aperçu « Cases A1 à F4 »,
  « Accepter » (principal) et « Rejeter » (lien). Erreurs de l'api dans la
  feuille.
- Le comportement existant (toucher le plan hors cadre, repères, Déplacer,
  clavier) est inchangé ; un toucher dans un cadre ouvre la proposition.

### Zones

- Feuille « Modifier <zone> » : champs « Lignes » et « Colonnes » (vides = pas
  de grille), aperçu des cases.

### Ranger une bouteille (champ « casier » de `LocationFields`)

- Zone choisie avec une grille : sous le champ « Casier », une grille
  `rows × cols` de boutons « A1 »… (48 px de cible ; défilement horizontal
  interne au-delà de la largeur) ; une case occupée affiche son nombre de
  bouteilles (« B3 · 2 ») d'après `GET …/zones/:id/cells` ; toucher remplit
  « Casier » ; la case choisie est mise en avant.
- Le champ « Casier » propose aussi les cases (liste de suggestions native
  `datalist`) en plus des valeurs déjà utilisées.
- Saisie libre toujours possible. Zone sans grille : inchangé.
- Vaut partout où `LocationFields` sert : entrée, Déplacer, emplacements de la
  fiche vin.

## Suivi des coûts

Le nouvel usage apparaît dans l'onglet Coûts de l'IA (libellé « Analyse du
plan », sixième couleur distincte, légende).

## Tests

- api : nommage (tri, saut des lettres prises, types), validation des blocs,
  worker (succès, zéro bloc, réponse inexploitable → FAILED, photo remplacée
  entre-temps → abandon), accepter / rejeter, grille via PATCH, cases occupées,
  matrice d'isolation, migration rejouée sur une base au format 2.15.
- web : états d'analyse, cadres et feuille de proposition, grille dans
  Modifier la zone, grille de rangement et suggestions dans `LocationFields`,
  usage dans les coûts de l'IA.
- Vérification dans le navigateur avec un plan d'essai (Gemini simulé en local
  si aucune clé).
