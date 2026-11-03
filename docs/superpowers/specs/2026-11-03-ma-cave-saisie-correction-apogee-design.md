# Ma Cave — saisie fiable, correction des vins, filtres, stats et apogée par l'IA

Date : 3 novembre 2026. Origine : retours d'un utilisateur, transmis par Franck.

## Pourquoi

Un même défaut produit la plupart des retours : quand l'appellation saisie
n'est pas reconnue par le référentiel (`appellation`, résolution par
similarité trigramme dans `AppellationsService.resolve`), le vin est enregistré
avec `appellationId = null`, **sans le dire**. Il n'a alors ni région (stats
« Sans région », carte, filtre) ni apogée (« sans estimation »). Et un vin mal
saisi ne peut pas être corrigé : aucune route ni écran de modification.

Retours couverts :

1. Quantité dès la prise de photo.
2. Saisie bloquée quand l'IA n'a pas trouvé une info : pouvoir forcer, ou que
   l'appli cherche mieux.
3. Cave : filtre région ; filtre millésime sur une seule année.
4. Pouvoir modifier un vin mal saisi.
5. Stats : « bug sur les millésimes », stats régions peu fiables, trop de vins
   dont l'apogée est « sans estimation ».

## Objectifs

- Aucun vin ne reste silencieusement sans région ni apogée.
- Toute donnée devinée (par la règle ou l'IA) reste corrigeable à la main, et la
  correction manuelle n'est jamais écrasée par une génération automatique.
- Un vin mal saisi se corrige depuis sa fiche.

## Non-objectifs

- Enrichir le référentiel d'appellations (on ajoute une région/une garde
  devinées par vin, pas des appellations).
- Plusieurs quantités ou plusieurs vins dans une même photo.
- Modifier l'historique des mouvements d'un vin (seule l'identité change).

## Anti-objectifs

- Une saisie qui refuse un vin parce que l'IA ou le référentiel ne le connaît
  pas.
- Une estimation de l'IA présentée comme une certitude : elle est toujours
  signalée (« estimée par l'IA »).
- Une fusion de doublons qui perd des bouteilles, des mouvements, une note ou
  un emplacement.

## Décisions (prises avec Franck)

### 1. Quantité à la prise de photo

- Écran de capture (`EntreeCapturePage`, route `/entree`) : un sélecteur
  « Bouteilles : 1 » (− / +, mêmes bornes que `QuantityPicker`) réglé **avant**
  de déclencher.
- Le nombre voyage avec la photo (file hors ligne `enqueuePhoto`, puis champ
  multipart de `POST /photos`) et est stocké sur la photo.
- À la confirmation (`/a-confirmer` et `/entree/:photoId`), la quantité est
  pré-remplie : **le nombre choisi à la photo l'emporte** sur
  `detectedQuantity` (lu par l'IA sur le carton) **s'il est différent de 1** ;
  à 1 (non touché), l'ordre actuel reste (`detectedQuantity ?? 1`). Toujours
  modifiable.
- Après chaque photo, le sélecteur revient à 1.

### 2. Appellation non reconnue : suggestions, et la région devinée par l'IA

- Champ appellation de la confirmation (les deux écrans) et du formulaire de
  modification : **suggestions du référentiel pendant la frappe** (nouvelle
  route de recherche, mêmes similarités que `resolve`). Choisir une suggestion
  pose le nom canonique.
- Le texte libre reste accepté (« forcer »). Si le référentiel ne le reconnaît
  pas, un message l'indique sous le champ : « Appellation inconnue du
  référentiel : la région et l'apogée seront estimées par l'IA. » La saisie
  n'est **jamais** bloquée pour ça (producteur et appellation non vides restent
  les seules exigences).
- **Région devinée par l'IA, corrigeable** (choix de Franck : « l'IA devine, je
  corrige si besoin ») : la caractérisation par lots existante (`wine_traits`,
  usage `CARACTERISATION`, qui donne déjà tanin, arômes et pays) renvoie aussi
  une **région**, choisie dans la liste fermée des régions du référentiel (les
  valeurs distinctes de `appellation.region`), ou rien pour un vin hors de
  France.
- Région publiée d'un vin, partout (cave, filtre, carte, stats) : correction
  manuelle > région du référentiel > région devinée par l'IA ; pays « autre » →
  « Hors de France ». La région de l'IA est marquée comme estimée sur la fiche.
- Correction sur la fiche (propriétaire) : choix de la région dans la liste,
  plus « Hors de France », comme les traits (`manualFields`).

### 3. Modifier un vin

- Bouton « Modifier » sur la fiche (`WinePage`), propriétaire seulement (comme
  `PUT wines/:id/traits`).
- Champs : domaine, cuvée, appellation (avec suggestions), millésime, couleur,
  format. La région se corrige à part (point 2).
- Validation : mêmes règles que la saisie (`api/src/movements/dto.ts`).
- Après enregistrement : `matchKey` recalculé, appellation re-résolue, apogée
  recalculée (sauf apogée `MANUEL`), caractéristiques et descriptif de domaine
  remis en file si le domaine ou l'appellation ont changé (sans écraser les
  champs corrigés à la main).
- **Doublon** (choix de Franck : fusionner) : si la nouvelle identité
  correspond à un autre vin de la même cave (même `matchKey`), l'écran le dit
  (« Ce vin existe déjà : Pommard 2018, 3 bouteilles ») et propose de
  **fusionner**. Fusionner = une seule fiche (celle qui existait déjà) qui
  reçoit : les bouteilles (somme), les mouvements, les emplacements, la note
  (la plus récente si les deux en ont une), les photos, les corrections
  manuelles (celles du vin cible priment en cas de conflit). L'autre fiche
  disparaît ; l'URL de l'ancienne fiche mène à la fiche fusionnée (ou à la
  cave). Une seule transaction.

### 4. Filtres de la cave

- **Millésime** : un seul champ « Millésime » (année exacte) remplace « de…
  à… ». Choix de Claude, d'après le retour « renseigner juste une année ».
- **Région** : pastilles des régions présentes dans la cave, plus « Hors de
  France » ; le paramètre d'URL `region` existant (carte de l'accueil) est
  repris tel quel. Position : après « Millésime » dans l'ordre actuel des
  filtres. Choix de Claude.

### 5. Stats

- **Millésimes** : aucun calcul faux trouvé ; le graphique s'intitule
  « Millésime » mais groupe par décennie (« Années 2010 »), d'où la confusion
  probable. Affichage **année par année**, « Non millésimé » en dernier. Choix
  de Claude (Franck ne connaît pas le détail du bug signalé).
- **Régions** : région publiée (point 2), avec une ligne « Hors de France » ;
  « Sans région » ne reste que pour les vins pas encore caractérisés.

### 6. Apogée estimée par l'IA

- Quand la règle ne sait pas (`APPELLATION_INCONNUE`, `GARDE_INCONNUE`), la
  caractérisation par lots renvoie aussi une **garde** (années min et max
  après le millésime). L'apogée devient millésime + garde, source `IA`,
  confiance faible, libellé « estimée par l'IA » sur la fiche.
- **Non millésimés** (choix de Franck : « l'IA estime à partir de la date
  d'entrée ») : même garde, comptée à partir de l'année de la première entrée
  en cave du vin.
- Ordre : apogée manuelle > règle du référentiel > estimation de l'IA. Une
  correction manuelle reste possible comme aujourd'hui (`PUT
  wines/:id/apogee`).
- Les vins existants : ceux sans apogée ni région sont remis en file de
  caractérisation par la migration, pour rattraper le stock actuel.

## Contraintes

- Modèles Gemini Flash / Flash-Lite seulement, jamais Pro ; tout nouvel usage
  Gemini doit figurer dans la contrainte `gemini_call_usage_check` (ici :
  aucun nouvel usage, la caractérisation est étendue).
- Une analyse IA qui échoue ne bloque jamais la saisie.
- Tout sur `main`, commits signés djkix ; README, guide détaillé et CHANGELOG
  en français mis à jour.
- Pas de données personnelles dans le dépôt.

## Laissé au constructeur

- Noms de colonnes, forme exacte des routes (recherche d'appellations,
  modification, fusion), découpage des migrations.
- Détails visuels, en suivant les écrans existants (pastilles de filtres,
  `QuantityPicker`, formulaire de stock dans l'en-tête de la fiche).

## Précisions (relecture du constructeur)

Réponses tirées du code :

- **Un vin appartient à une cave** (`wine.cave_id`, `match_key` unique par
  cave) : modifier et fusionner ne touchent que la cave du propriétaire.
- **Emplacements** : aucune quantité stockée, le stock d'un emplacement est la
  somme des mouvements qui le désignent. Fusionner = rattacher les mouvements
  au vin cible ; les emplacements s'additionnent d'eux-mêmes, sans conflit.
- **Régions du référentiel** : 12 valeurs propres dans `api/data/appellations.json`
  (Alsace, Beaujolais, Bordeaux, Bourgogne, Champagne, Jura,
  Languedoc-Roussillon, Loire, Provence, Rhône, Savoie, Sud-Ouest), identiques
  aux régions de la carte. Liste fermée de l'IA = ces 12 valeurs. Le
  référentiel ne compte que 145 appellations, d'où le grand nombre de vins
  « inconnus » : les suggestions et l'IA comblent ce manque.

Choix de Claude, à vérifier par Franck :

- **On stocke la garde, pas l'apogée** : l'IA renvoie une garde (min, max en
  années) rangée dans `wine_traits` ; l'apogée est calculée à la lecture, dans
  l'ordre manuelle > règle > IA. Corriger l'appellation vers une appellation
  connue fait donc passer la règle devant l'IA sans rien recalculer, et une
  fusion qui change la première entrée d'un non-millésimé est prise en compte
  d'elle-même.
- **Non millésimés** : la règle ne s'applique jamais (elle a besoin du
  millésime) ; seule l'estimation de l'IA, comptée depuis l'année de la
  première entrée (premier mouvement IN non annulé ; à défaut, la date de
  création du vin).
- **Région manuelle** : n'empêche pas la caractérisation des autres traits
  (même mécanique `manualFields` que tanin et arômes).
- **« Sans région »** = vin dont la caractérisation n'est pas encore faite (ou a
  échoué) et sans région du référentiel ; un vin caractérisé a une région ou
  « Hors de France ».
- **Rattrapage du stock** : la migration remet en file de caractérisation tout
  vin **sans apogée OU sans région**, sans écraser les champs manuels.
- **Quantité de la photo** : stockée sur la photo ; si elle vaut 1 et que l'IA
  lit 6 sur le carton, la confirmation propose 6.
- **Après une fusion** : l'écran va sur la fiche cible ; l'ancienne adresse
  donne « vin introuvable » avec un lien vers la cave (pas de table de
  redirection).
- **Filtre millésime** : l'api garde `vintageMin`/`vintageMax` ; l'écran envoie
  la même année aux deux. Les stats renvoient une répartition par année (la
  réponse de l'api change, l'écran suit).
