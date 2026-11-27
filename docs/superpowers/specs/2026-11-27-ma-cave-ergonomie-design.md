# Ma Cave — refonte ergonomique de cinq écrans

Date : 27 novembre 2026. Version de départ : 2.50.1.

## Intention

Une analyse de l'application au format téléphone a relevé trois faiblesses :

- ce qui attend une action se voit mal ;
- la fiche vin est trop longue ;
- plusieurs écrans répètent la même information.

Franck a choisi, maquette par maquette, une proposition pour chacun des cinq
écrans concernés. Le but est que chaque écran réponde d'abord à sa question
principale :

| Écran | Question principale |
|---|---|
| Accueil | Qu'est-ce qui m'attend ? |
| Liste | Où est ce vin, combien m'en reste-t-il ? |
| Fiche vin | Est-ce que je l'ouvre ? |
| Mouvements | Je rentre ou je sors du vin |
| Statistiques | À quoi ressemble ma cave ? |

## Objectifs

- Ce qui attend une action (« à confirmer ») est visible depuis tous les écrans.
- Sur la fiche vin, l'information qui sert à décider tient dans le premier écran.
- Il n'y a plus de doublon d'information ni de bouton.
- Aucun bloc vide ni ligne à zéro n'occupe de place.
- Le vocabulaire est celui d'un amateur de vin, pas d'un comptable.

## Non-objectifs

- Pas de nouvelle fonctionnalité métier : on réorganise l'existant.
- La charte reste celle d'aujourd'hui (couleurs, polices, composants `Button`,
  `BottomSheet`, `Icon`).
- Une seule modification de l'API : les emplacements sur toutes les lignes de
  la liste (voir les décisions de Claude).
- Pas de bascule « vue compacte / vue détaillée » sur la liste : la vue
  compacte est la seule.

## Anti-objectifs

Chacun de ces cas serait un échec, même si l'écran fonctionne :

- une action qui demandait un toucher en demande deux, sauf celles listées
  plus bas ;
- un membre en lecture seule voit un bouton qu'il ne peut pas utiliser ;
- une adresse existante (`/entree`, `/sortie`, `/a-confirmer`, `/journal`,
  `/cave?region=…`, `/accords?plat=…`) mène à une erreur 404 ;
- l'application devient plus lente à ouvrir ;
- une information disparaît de l'application, au lieu d'être seulement
  déplacée ou repliée.

Les actions qui gagnent un toucher, acceptées par Franck :

- les statistiques détaillées : ouvrir une rubrique repliée ;
- les blocs repliés de la fiche vin.

## Contraintes

- PWA React/Vite (`web/`) : chaque page monte elle-même `<TopBar>` et
  `<BottomNav>`.
- Tous les tests existants restent verts ou sont adaptés au nouveau
  comportement. Chaque changement visible a son test.
- README, CHANGELOG et `docs/guide-detaille.md` sont mis à jour en français à
  chaque version.
- Le chantier sort en trois versions. Chacune est utilisable seule et passe par
  « fusionne et publie ».
- Lisible à 375 px de large, cibles tactiles d'au moins 44 px.
- La couleur n'est jamais le seul signal.

## Décisions de Franck

### 1. Barre du bas : onglet « Mouvements » (version 1)

Pour un propriétaire, la barre compte cinq onglets :

> Cave · Mouvements · Accords · Stats · Réglages

Entrée et Sortie disparaissent de la barre.

**L'onglet Mouvements** (`/mouvements`) affiche, de haut en bas :

1. Deux grands boutons côte à côte, *Rentrer* et *Sortir*. Ils mènent aux
   écrans actuels `/entree` et `/sortie`, qui ne changent pas.
2. Une ligne *À confirmer* avec le nombre de vins en attente. Elle mène à
   `/a-confirmer` et n'est affichée que si ce nombre est supérieur à zéro.
3. Les derniers mouvements (ceux de l'accueil actuel), puis le lien
   *Voir le journal complet*.

**La pastille** portée par l'onglet Mouvements est le nombre « à confirmer »
de l'accueil actuel (`toConfirm + failed` de l'entrée). Elle se relit toutes
les 30 s, comme aujourd'hui.

**L'onglet Mouvements est allumé** sur `/mouvements`, `/entree…`, `/sortie…`,
`/a-confirmer` et `/journal`. C'est la même règle que l'onglet Réglages sur
ses sous-pages.

**Membre en lecture seule :** pas d'onglet Mouvements, puisqu'il ne rentre ni
ne sort rien. Sa barre devient Cave · Accords · Stats · Réglages.

**Vocabulaire** (dans la même version) :

- « MA CAVE » disparaît au-dessus du titre des pages (sur-titre de `TopBar`).
- Dans le journal et les derniers mouvements, « Ajustement » devient
  « Annulation » pour l'annulation d'un mouvement, et « Inventaire » pour une
  correction de stock.
- « btl » s'écrit « bouteille(s) » partout où la place le permet. Il reste
  abrégé dans les colonnes étroites (liste compacte, pastilles).

### 2. Accueil : « chiffres et carte » (version 2)

De haut en bas :

1. Le bandeau *N vins à confirmer*, s'il y en a. Il s'affiche comme
   aujourd'hui (couleur d'action) et mène à `/a-confirmer`.
2. Trois tuiles chiffrées :
   - *bouteilles* (total en stock) ;
   - *références* (vins en stock) ;
   - *à boire vite* (bouteilles des vins « à boire en priorité »). Cette tuile
     mène à `/a-boire`.
3. La carte de France, réduite à environ la moitié de sa hauteur actuelle.
   Les régions à zéro restent dessinées, mais sans leur chiffre « 0 ». Sous
   la carte, les pastilles de régions (les plus fournies d'abord) se
   comportent comme aujourd'hui : un toucher ouvre le volet des domaines.
4. Le bouton *Voir mes N bouteilles* vers `/cave`.

Ce qui sort de l'accueil :

- le titre « Ma cave en France · 28 btl », qui doublait les tuiles ;
- la carte *Derniers mouvements*, qui passe dans l'onglet Mouvements ;
- la carte *À boire prochainement*, remplacée par la tuile *à boire vite*.

Les bannières actuelles restent : inscriptions à valider, file hors ligne,
analyse en cours.

**Membre en lecture seule :** pas de bandeau « à confirmer », mêmes tuiles,
même carte.

### 3. Liste de la cave : « compacte » (version 2)

- **Un seul champ de recherche :** *Chercher un vin ou un plat…*. Il remplace
  les deux champs actuels (texte et accords).
  - La recherche porte d'abord sur le vin, comme le champ texte actuel.
  - Si le texte saisi correspond à un plat de la base d'accords
    (`findDishes`), une ligne *Vins pour « {plat} »* s'ajoute en tête des
    résultats et applique le filtre plat actuel.
- L'icône appareil photo du champ de recherche reste. Franck ne l'a pas
  retirée.
- **Pastilles sous la recherche :** *Tous · Rouge · Blanc · Rosé · Pétillant ·
  À boire*, puis *Tri : {critère} ▾*. Les filtres actuels restent dans le
  panneau *Filtres* : arômes, millésime, tanin, emplacement, région.
- **Une ligne par vin**, sur trois colonnes : nom (domaine, cuvée, millésime),
  emplacement court, nombre de bouteilles.
  - L'emplacement court est le libellé de la case (« C15 ») si le vin est à un
    seul endroit, sinon « 2 endroits ». « — » signifie sans emplacement.
  - La couleur n'est plus portée par un point : la pastille de filtre suffit,
    et la fiche la donne en toutes lettres.
  - L'apogée et la note ne sont plus sur la ligne : elles sont sur la fiche.
- Le bouton flottant *Ajouter un vin* disparaît.
- Le compteur « 28 bouteilles · 6 références » reste au-dessus de la liste.

### 4. Fiche vin : sections repliées et étiquette en grand (version 3)

De haut en bas :

1. **L'étiquette en grand :** la vignette du vin en pleine largeur, environ
   180 px de haut, recadrée.
   - Sans vignette, un bandeau bas de la couleur du vin, sans image.
   - *Chercher une image* passe dans le menu du crayon d'édition.
2. **L'identité :** nom, appellation, couleur en toutes lettres, format.
3. **Deux tuiles :**
   - *{N} bouteilles* avec l'emplacement ;
   - *{année}* avec « fin d'apogée », ou « sans apogée ».
   - *Corriger le stock* reste un lien sous la tuile du stock.
4. **Note et accords :** la note personnelle, puis les accords conseillés
   (plats cliquables, comme aujourd'hui).
5. **Blocs repliés**, fermés à l'ouverture de la fiche :
   - *Le domaine* ;
   - *Caractéristiques et apogée* : tanin, arômes, cépages, région, détail de
     l'apogée et ses *Corriger* ;
   - *Accords vécus* ;
   - *Cote et valeur* ;
   - *Mouvements et emplacements* : derniers mouvements, emplacements,
     *Ranger / déplacer*.
6. La barre *Sortir une bouteille* collée en bas ne change pas.

**Blocs vides :** un bloc dont tout le contenu est « en préparation » ou absent
reste replié, et son titre porte la mention « (en préparation) » ou
« (vide) ». Il ne s'ouvre pas sur un contenu vide.

**Membre en lecture seule :** ni crayon, ni *Corriger*, ni *Sortir* (comme
aujourd'hui). Pas de bloc *Cote et valeur*, puisque la cote lui est cachée.

### 5. Statistiques : tuiles et graphiques, par thème (version 3)

1. **Trois tuiles :** *bouteilles*, *références*, *bues en {année}*
   (consommation de l'année civile).
2. **La rubrique *Stock*, ouverte par défaut :**
   - un anneau des couleurs, avec la légende chiffrée à côté ;
   - des colonnes par millésime, avec « Non millésimé » en dernier ;
   - les barres par région.
3. **Quatre rubriques repliées**, que l'on ouvre d'un toucher :
   - *Garde et apogée* : barres trop jeune, à boire, à boire vite, passée, sans
     estimation, en masquant les lignes à zéro ;
   - *Consommation* : colonnes des mouvements sur 12 mois, rythme mensuel,
     classement des plus bus ;
   - *Palais* : tanin des rouges et arômes les plus présents ;
   - *Valeur et cote* (propriétaire seulement) : valeur au prix d'achat, valeur
     à la cote, plus chères, mieux notés. La rubrique n'apparaît pas tant
     qu'aucun prix ni aucune cote n'est saisi.
4. **Partout, une ligne à zéro est masquée.** Une rubrique entièrement vide
   n'apparaît pas.

Les graphiques sont dessinés en SVG ou en CSS, sans nouvelle dépendance.

## Décisions prises par Claude (à valider en relisant)

- **Tuiles de l'accueil et des statistiques différentes.** L'accueil montre ce
  qui demande une action (*à boire vite*), les statistiques le bilan (*bues
  dans l'année*).
- **Journal.** Il reste accessible depuis Réglages (sa carte actuelle) et
  depuis l'onglet Mouvements. Le double accès est assumé : Réglages est le
  rangement, Mouvements l'usage.
- **Ancienne carte « À boire prochainement » de l'accueil.** Elle disparaît
  au profit de la tuile. La page `/a-boire` reste complète.
- **Recherche unique.** Quand le texte est à la fois un vin et un plat (par
  exemple « Bourgogne »), les vins trouvés s'affichent normalement. La ligne
  *Vins pour « … »* n'apparaît que si un plat de la base est reconnu.
- **Emplacement sur la liste : seule modification de l'API.**
  - Aujourd'hui, `GET /api/cave` ne renvoie les endroits (`places`) que pour
    la liste « à boire en priorité » (`CaveService.list`, filtre `drinkSoon`).
  - La version 2 les renvoie pour toutes les lignes, avec la même lecture
    groupée (`LocationsService.placesByWine`, une seule requête pour tous les
    vins).
  - La ligne affiche le libellé court de l'unique endroit, ou « {n} endroits »,
    ou « — ».
  - Le surcoût est une requête par chargement de liste : à mesurer, il doit
    rester négligeable pour quelques centaines de vins.
- **Tuile « bues en {année} ».**
  - C'est la somme des sorties des mois de l'année civile en cours, prise dans
    la série sur 12 mois déjà fournie (`Stats.months`). Elle couvre toujours
    janvier à aujourd'hui.
  - Elle compte les sorties comme la courbe et le rythme de consommation, avec
    exactement la même définition, pour que les chiffres ne se contredisent
    jamais.
- **Tuile « à boire vite » de l'accueil.** Elle compte les bouteilles de la
  liste `/a-boire` (`GET /api/cave?drinkSoon=true`), puisqu'elle y mène. Son
  chiffre est donc toujours celui de la page.
- **L'onglet Cave mène toujours à l'accueil** (choix de la 2.48.0) et reste
  allumé sur `/cave…`.
- **Retour du journal.** Le retour du journal mène à `/mouvements`. Depuis
  Réglages, la flèche retour du navigateur suffit.
- **Annulation ou Inventaire.** Un mouvement `ADJUST` avec `reversesId` est une
  « Annulation », sans `reversesId` un « Inventaire ». Le libellé est
  harmonisé partout : journal, derniers mouvements, et mouvements de la fiche,
  qui disent aujourd'hui « Correction » (`WinePage`, `lib/movement-note.ts`).
- **Pastille sur toutes les pages.**
  - La lecture « à confirmer » (`GET /api/photos/entry-inbox`, toutes les
    30 s) passe de l'accueil à la barre du bas, pour un propriétaire
    seulement.
  - Une seule requête partagée par React Query (même clé `['entry-inbox']`),
    donc pas de lecture en double.
  - La pastille reste visible sur `/a-confirmer`, où elle diminue à chaque
    validation.
- **Pastilles de la liste.**
  - *À boire* applique le filtre `drinkSoon` existant.
  - *Sans apogée* (`noApogee`) reste dans le panneau Filtres.
  - Les anciennes adresses `?filtre=priorite` et `?filtre=sans-apogee` restent
    valables.
- **Découpage en trois versions** :
  - version 1 : barre du bas, onglet Mouvements, vocabulaire ;
  - version 2 : accueil et liste ;
  - version 3 : fiche vin et statistiques.

## Laissé au bâtisseur

- La hauteur exacte de la carte réduite et celle de l'étiquette en grand.
- Le composant de section repliable, à partager entre la fiche et les
  statistiques. `<details>` natif ou bouton avec `aria-expanded`.
- Le tracé de l'anneau et des colonnes.
- L'icône de l'onglet Mouvements, prise dans Material Symbols comme les
  autres.
- La mémorisation de l'état ouvert des rubriques. Par défaut, pas de
  mémorisation : tout se replie à chaque visite.
