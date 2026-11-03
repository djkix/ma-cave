# Brief de maquette — Ma Cave (version 2.41.0)

Tout ce qu'il faut pour refaire la maquette de l'application telle qu'elle est
aujourd'hui : produit, utilisateurs, charte, composants, navigation et écrans,
avec les libellés exacts. Les maquettes d'origine (`01` à `04` dans ce dossier)
datent des premières versions et ne montrent plus l'application actuelle.

> **Mise à jour :** la charte décrite plus bas (bronze/doré, Noto Serif +
> Manrope) a été remplacée par la charte « Ma Cave Design Language »
> (`05-design-language.md`) ; les jetons à jour sont dans
> `web/src/design-tokens/tokens.json`.

## 1. Le produit

- **Ma Cave** : application web installable (PWA) pour gérer une cave à vin
  personnelle. En français, pensée **d'abord pour le téléphone** (375 px de
  large), utilisable sur ordinateur (contenu centré, 640 px au plus).
- Usage typique : on photographie un carton ou une étiquette pour **rentrer**
  du vin, l'IA (Gemini) lit l'étiquette ; on photographie une bouteille pour la
  **sortir** ; on consulte la cave, les apogées (« à boire quand »), des
  **accords mets-vins**, une carte de France et des statistiques.
- Fonctionne hors ligne pour la prise de photo (file d'envoi).
- **Trois profils** :
  - **Propriétaire** (O) : tout, y compris entrées, sorties, journal, prix, réglages de la cave.
  - **Membre en lecture seule** (M) : voit la cave, les fiches, les accords et les stats, sans prix ni journal, ne modifie rien.
  - **Administrateur** (A) : en plus, gestion des comptes, coûts de l'IA, référentiel.
- Plusieurs caves possibles par compte (sélecteur dans la barre du haut).

## 2. Charte « Bastide provençale & travertin doré »

Ambiance : cave en pierre claire, chêne doré, ferronnerie noire. Sobre,
chaleureuse, beaucoup de crème et de brun ; pas de couleurs vives.

### Couleurs (source : `web/src/design-tokens/tokens.json`)

| Rôle | Valeur | Usage |
|---|---|---|
| primary | `#7A5522` | titres, texte de marque, onglet actif |
| primary-action | `#8B612C` (survol `#6B491D`) | fond des boutons principaux, texte blanc |
| primary-container | `#A37943` | doré chêne : badges, aplats, pastille active |
| primary-fixed | `#FFDDB7` | fond d'une pastille de filtre active |
| ferronnerie | `#2B2621` (survol `#3D3730`) | bouton « dark » : sortir, valider, enregistrer |
| background / surface | `#FCF9F3` | fond crème de l'app |
| surface-lowest | `#FFFFFF` | cartes et listes |
| surface-container | `#F0EEE8` | fond des pilules de filtre, des sélecteurs |
| surface-container-low | `#F6F3ED` | bannières, pastilles de plats |
| surface-container-high | `#EBE8E2` | pistes de barres, de progression |
| outline-variant | `#D3C4B5` | bordure des boutons contour |
| outline-subtle | `#E6DFD3` | bordures de cartes, séparateurs |
| secondary | `#635D5A` | texte atténué (métas) |
| on-surface | `#1C1C18` | texte courant |
| error / container | `#BA1A1A` / `#FFDAD6` | erreurs, « apogée dépassée » |
| warning / container | `#B4653A` / `#FCE2D0` | confiance faible, file hors ligne, « à boire vite » |
| success | `#4B6459` | « à son apogée » |
| Vin rouge / blanc / rosé / pétillant | `#5C2423` / `#E6C77A` / `#E8A598` / `#D8CFA8` | barres « Couleur » des stats, sorties du graphique mensuel |
| Carte de France | dégradé bordeaux `--map-0` (aucune bouteille) → `--map-4` (maximum) | heatmap de l'accueil |

### Typographie

- **Noto Serif** : noms de vins et de domaines, titres de cartes et de pages,
  grands chiffres (stats).
- **Manrope** : tout le reste (texte, libellés, boutons, chiffres tabulaires).
- Tailles repères : titre de page 20, titre de carte 18 (ou 16), corps 15-16,
  méta 11-13, intertitre de section 14 en MAJUSCULES espacées (0,08 em, gris).

### Grille et formes

- Espacements : 4, 8, 16, 24, 40. Rayons : 4, 8, 12, 16, pilule 999.
- Cible tactile 48 px minimum. Barre du haut 56 px, barre du bas 64 px (+ zones
  sûres iOS). Boutons d'action 56 px.
- Page : colonne centrée de 640 px max, marge 16, espacement vertical 16.
- Icônes : **Material Symbols Outlined** (non remplies, épaisseur 400).

## 3. Composants

- **Carte** : fond blanc, bordure 1 px `#E6DFD3`, rayon 16, marge interne 16.
- **Liste** : bloc blanc à bord arrondi 16, lignes séparées par 1 px. Ligne de vin
  (`cave-row`) : vignette à gauche, titre serif « Producteur — Cuvée 2018 », métas
  en dessous, **quantité en gras 18 brun à droite** ; ligne grisée (55 %) si stock 0.
- **Vignette de vin** : photo de l'étiquette au format 4:5, rayon 8 ; sans photo,
  cadre vide avec l'icône `wine_bar`. Tailles 44 (liste), 64, 88, 96 (fiche).
- **Boutons** (hauteur 48, rayon 12, Manrope 600 15, icône + texte) :
  - *primary* : fond `#8B612C`, texte blanc ;
  - *dark* : fond ferronnerie, **pleine largeur**, hauteur 56, rayon 16 (actions qui écrivent) ;
  - *outline* : transparent, bordure, texte brun ;
  - *link* : texte gris souligné ;
  - *tuile d'action* (accueil membre) : 72 de haut, icône + titre + sous-titre + flèche.
- **Pilule de filtre** : hauteur 40, rayon 999, fond `#F0EEE8` ; active : fond
  `#FFDDB7`, bordure `#A37943`, texte brun. Sert aussi aux `select`.
- **Sélecteur de quantité** : carte « Quantité à intégrer », 5 grandes pastilles
  « 1 btl », « 6 Carton », « 12 Caisse », « 18 Lot », « Autre » (champ libre).
- **Badge** : petite pilule 11 px (ok doré, warn orange pâle, error).
- **Bannière** : bandeau crème bordé, icône, texte 13, bouton à droite ; variante
  orange.
- **Dock** : barre collée au-dessus de la barre du bas (crème translucide floutée)
  qui porte le bouton d'action principal d'un écran de saisie + une aide 11 px.
- **Volet du bas** (bottom sheet) : monte du bas, pleine largeur, rayon 16 en
  haut, fond assombri, titre 18.
- **Barres de stats** : libellé à gauche, « n · x % » à droite, piste de 8 px.
- **Barre de progression** : 6 px, remplissage qui glisse en boucle.
- **Pastilles de plats** : pilules 13 px fond crème, bordure.
- **Champ éditable** : libellé 12 gris au-dessus, saisie 18, trait dessous ; fond
  orange pâle si l'IA a lu la valeur avec une confiance faible, badge de
  confiance (`verified` ou `help` + %).
- **Mention « (estimée par l'IA) »** à côté de toute valeur devinée par l'IA
  (région, apogée).

## 4. Structure de navigation

- **Barre du haut** (sticky, crème floutée) : retour `arrow_back` ou logo
  (lien vers l'accueil) ; titre serif 20 brun ; sélecteur de cave si plusieurs ;
  badge « Lecture seule » pour un membre ; numéro de version dans les réglages.
- **Barre du bas**, 6 onglets icône + libellé 11 px (actif brun gras) :
  1. `shelves` **Cave**
  2. `add_circle` **Entrée** (O)
  3. `remove_circle_outline` **Sortie** (O)
  4. `restaurant` **Accords**
  5. `bar_chart` **Stats**
  6. `settings` **Réglages** (badge orange : inscriptions à valider, A)

  Un membre voit 4 onglets. L'accueil s'ouvre par le logo. La barre du bas est
  masquée sur les écrans de saisie (entrée, à confirmer, sortie), la connexion,
  « À boire », « Moi », « À propos ».
- **Bannières globales** : « Nouvelle version disponible (x.y) » + « Recharger » ;
  « n photo(s) en cours d'envoi » (`cloud_off`) + « Forcer l'envoi » ;
  « n photo(s) en attente d'analyse » (`hourglass_top`) + « Voir la liste ».

## 5. Écrans (ordre du parcours)

### 5.1 Connexion `/login`
Logo 72, « Ma Cave » serif 28, bouton primary « Se connecter avec Google ».
Messages d'erreur centrés (« La connexion n'a pas abouti »). Écrans de compte
sur le même gabarit : « Inscription en attente de validation », « Vous n'avez
pas encore de cave », bouton contour « Se déconnecter ».

### 5.2 Accueil `/`
- (A) bouton contour `how_to_reg` « n inscriptions à valider ».
- (O) bannière d'analyse ; **carte de France** « MA CAVE EN FRANCE · n bouteilles »
  (12 régions + case « Hors de France », heatmap bordeaux, régions cliquables) ;
  bouton contour `fact_check` « n vins à confirmer » ; carte **« À boire
  prochainement »** (3 lignes + « Tout voir (n) ») ; intertitre « DERNIERS
  MOUVEMENTS » (3 lignes) ; liens « Voir le journal », « Ma cave › Réglages ».
- (M) deux tuiles : brune « Voir la cave » / « Fiches, apogées, accords mets-vins »,
  noire « Statistiques » / « Couleurs, régions, millésimes » ; carte de France ;
  « À boire prochainement ».
- Volet d'une région : « Bourgogne · 10 bouteilles », liste des domaines (→ page
  domaine), lien « Voir ces n vins dans la cave → ».

### 5.3 Cave `/cave`
- Filtres en pilules qui passent à la ligne, dans cet ordre : recherche
  « Domaine, cuvée, appellation… » ; « Couleur : toutes » ; « Arômes : tous »
  (volet de 20 arômes) ; champ « Millésime » (une année) ; **pastilles de
  régions** présentes + « Hors de France » ; « Tanin : tous » ; « Emplacement :
  tous » ; bascules « À boire en priorité », « Sans apogée », « Vins épuisés » ;
  champ plat « Agneau, comté, poisson… ».
- Liste de vins : vignette 44, « Producteur — Cuvée 2018 », « Appellation ·
  Rouge », apogée courte, note « 16,5 », quantité à droite. Vide : « Aucun vin ne
  correspond. »

### 5.4 Fiche vin `/cave/:id`
Cartes dans l'ordre :
1. **En-tête** : vignette 96, nom serif 20, « Appellation · 2018 · 75 cl »,
   « **6 en stock** » 22 avec crayon (O, corriger le stock), lien « Modifier »
   (O), icône `location_on` (emplacement). Volets intégrés : correction du stock
   (− / nombre / +, « D'où sortent-elles ? », bouton dark « Enregistrer le
   stock ») ; **modification du vin** (Domaine, Cuvée, Appellation avec
   suggestions, Millésime, Couleur, Format ; doublon : « Ce vin existe déjà : … »
   + « Fusionner les deux ») ; image du web (« Chercher une image »).
2. **Le domaine** : extrait de l'histoire + « Voir le domaine ».
3. **Accords mets-vins** : pastilles de plats.
4. **Caractéristiques** : tanin, arômes (pastilles), « Région : Bourgogne
   (estimée par l'IA) » ; « Corriger » (O) avec un sélecteur unique « Région »
   (Inconnue, 12 régions, Hors de France).
5. **Apogée** : « À boire entre 2022 et 2032 (estimée par l'IA) », badge de
   confiance, statut ; « Corriger » (O).
6. **Ma note** : « 16,5 » sur 20.
7. **Cote** (O) : valeur, valeur de cession, « Saisir la cote ».
8. **Emplacements** : « Cave 1 / A3 × 4 », « Ranger / déplacer » (O).
9. Intertitre « DERNIERS MOUVEMENTS » + « Plus d'historique (n) ».

### 5.5 Domaine `/domaine/:key`
Titre = nom du domaine. Cinq cartes **Histoire, Terroir, Cépages, Style, Nez**
(corrigeables par A), puis carte « Vos vins » (lignes vers les fiches).

### 5.6 Entrée (O, sans barre du bas)
- **`/entree` « Rentrer du vin »** : consigne, compteur 40 « n photos prises »,
  sélecteur **« Bouteilles »** réglé avant la photo, gros bouton primary
  `photo_camera` « Prendre une photo » / « Photo suivante », bouton contour « Voir
  les vins à confirmer ».
- **`/a-confirmer` « À confirmer »** : sections « À valider (n) » (une carte par
  photo : vignette, badge « confiance 87 % », champs Producteur, Cuvée,
  Appellation avec suggestions et message « Appellation inconnue du
  référentiel : la région et l'apogée seront estimées par l'IA. », Millésime,
  quantité, emplacement, boutons « Écarter » / « Valider ») ; « En cours
  d'analyse (n) » ; « Lecture impossible (n) » (« Saisir à la main »). Dock :
  « Tout valider (n) ».
- **`/entree/:photo` « Nouvelle entrée »** : analyse en cours (barre de
  progression) ou formulaire (Producteur, Cuvée, Appellation, Millésime, Couleur,
  Format, quantité, emplacement par zone ou sur le plan, « Détails optionnels » :
  prix). Dock dark « Confirmer l'entrée (+6 bouteilles) ». Écran de succès
  « Entrée enregistrée » : « Rentrer un autre vin » / « Retour à l'accueil ».

### 5.7 Sortie (O, sans barre du bas)
- **`/sortie`** : « Photographiez l'étiquette de la bouteille. », bouton dark
  « Prendre la photo ».
- **`/sortie/:photo`** : aperçu de la photo ; lecture en cours ; « Lequel
  est-ce ? » (grille 2 colonnes de candidats : vignette 88, millésime 24) ;
  « Ce vin n'est pas dans la cave » ; confirmation : vignette, « D'où sort-elle ? »,
  − / nombre 28 / +, bouton dark « Sortir 1 bouteille » ; puis « Sorti — il en
  reste 5 » + « Annuler ».

### 5.8 Accords `/accords`
- Deux boutons segmentés « J'ai un plat » / « J'ai un vin ».
- **Plat** : « Qu'est-ce qu'on mange ? », gros micro rond 112 (dictée, sur
  téléphone), « Écrire plutôt », champ « Le plat » + « Proposer des vins ».
- **Vin** : recherche dans la cave, puis « Plats conseillés » en pastilles.
- **Résultats** : progression « Je cherche dans votre cave… 12 s » ; « Ce que
  l'IA a compris » (pastilles) ; « Vue d'ensemble » repliable (matrice accord ×
  moment : lignes Excellent / Bon / Correct, colonnes Trop jeune / À point / À
  boire vite / Passé, un point numéroté par vin) ; trois groupes **« À ouvrir ce
  soir »**, **« À surveiller : apogée dépassée »**, **« Bel accord, mais à
  garder »**. Chaque vin : numéro coloré, nom, métas, « ●●● Excellent accord —
  raison », **frise d'apogée** (fenêtre colorée, trait « aujourd'hui »), libellé
  coloré (« À son apogée, jusqu'en 2032 » vert, « À boire vite » orange,
  « Apogée dépassée depuis 2025 » rouge, « Trop jeune, attendre 2029 » gris).

### 5.9 À boire `/a-boire`
« Vins dont l'apogée se termine au plus tard l'an prochain, rangés par
emplacement. » Un groupe par zone (nom en majuscules, indication, mini-plan),
lignes de vins.

### 5.10 Stats `/stats`
- En-tête 3 colonnes : « n bouteilles · n références · ~x € au prix d'achat »
  (2 colonnes pour un membre) ; valeur à la cote (O).
- Barres : **Apogée** (Trop jeune, À boire, À boire vite, Passée, Sans
  estimation — cliquables), **Couleur** (couleurs de vin), **Région** (top 8,
  dont « Hors de France »), **Millésime** (année par année, « Non millésimé » en
  dernier).
- « Mouvements sur 12 mois » (histogramme entrées brun / sorties rouge vin).
- Classements : « Les plus bus », « Producteurs », « Les plus chères » (O),
  « Les mieux notés ».

### 5.11 Réglages `/compte` et sous-pages
- Profil (avatar rond 56 à initiales serif, nom, e-mail), puis cartes de
  navigation (icône brune, titre serif 18, résumé, chevron) : **Moi**, **Ma
  cave** (O), **Journal** (O), **Application** (A), **À propos**.
- **Moi** : installer l'application, « Mes caves » (badges Propriétaire / Lecture
  seule, « Afficher »), « Se déconnecter ».
- **Ma cave** (O) : nom de la cave ; **Plans de la cave** (onglets de plans, photo
  du plan avec repères de zones à toucher, analyse automatique du plan) ;
  **Zones** (ordre, indication, photo, cases) ; **Membres** (inviter par e-mail) ;
  **Sauvegarde** (« Télécharger la sauvegarde Excel »).
- **Journal** (O) : export Excel, « 20 DERNIERS MOUVEMENTS » avec « Annuler ».
- **Administration** (A) : onglets Comptes, Coûts de l'IA, Données du vin,
  Sauvegarde.

### 5.12 Divers
Règles de confidentialité (page publique), « Page introuvable », erreur de
rendu.

## 6. Contraintes pour la nouvelle maquette

- Téléphone d'abord : 375 × 812, tout atteignable au pouce, cibles de 48 px.
- Garder les **libellés français** ci-dessus (apostrophe typographique ’).
- Deux variantes par écran clé : **propriétaire** et **membre en lecture seule**.
- Prévoir les états : chargement, vide, erreur, hors ligne, analyse IA en cours
  ou en échec (l'échec de l'IA ne bloque jamais la saisie).
- Toute estimation de l'IA reste signalée et corrigeable.
- Écrans prioritaires : Accueil, Cave, Fiche vin, Entrée (photo + à confirmer),
  Sortie, Accords (résultats), Stats.
