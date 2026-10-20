# Ma Cave — refonte de Mon compte, des réglages et de l'administration

Date : 20 octobre 2026. Version visée : 2.15.0.

## Intention

Les écrans de réglage sont dispersés sur trois pages construites à des moments
différents (Mon compte, Ma cave › Réglages, Administration). Franck a fait
dessiner une refonte (maquette Stitch) et veut **regrouper et afficher ces
informations de façon cohérente**.

Choix de Franck :

1. Refonte de l'**affichage seulement** : l'organisation de la maquette, avec les
   fonctions qui existent déjà. Les nouveautés de la maquette sont écartées
   (rôle « Collaborateur », invitation avec choix du rôle, création de cave par
   l'utilisateur, « Bouteilles non assignées », journal d'audit CSV, plafond
   mensuel réglable dans l'écran, sélecteur de rôle de démonstration,
   vocabulaire « souverain », accès au hub par la barre du bas).
2. **Charte actuelle** conservée (couleurs, polices, icônes) : seule la mise en
   page de la maquette est reprise.
3. Changer de cave reste possible **depuis la barre du haut et depuis « Moi »**,
   avec la même présentation et le même libellé.
4. Toutes les éditions s'ouvrent dans une **feuille du bas**.
5. Actions sur un compte dans un **menu « ⋯ »** par ligne.
6. Consommation Gemini : **chiffres clés, barres empilées par jour, détail
   repliable**.

Réussi quand : depuis l'icône de compte, Franck trouve en un toucher chaque
réglage à sa place (lui, sa cave, l'application, à propos), sans lien texte
perdu en bas de page ; les mêmes choses s'affichent de la même façon partout ;
aucune fonction existante n'a disparu.

## Hors périmètre

- Toute modification de l'api ou de la base.
- Les nouveautés listées ci-dessus.
- Les écrans hors réglages (cave, fiche vin, entrée, sortie, journal, stats).

## Navigation

| Écran | Adresse | Qui | Contenu |
|---|---|---|---|
| Hub « Mon compte » | `/compte` | tout compte connecté | profil + cartes de navigation |
| Moi | `/compte/moi` | tout compte | Mes caves, Application sur le téléphone, Se déconnecter |
| Ma cave | `/ma-cave` (inchangé) | propriétaire de la cave affichée | Nom, Plans, Zones, Membres, Sauvegarde |
| Application | `/admin` → `/admin/comptes`, `/admin/couts`, `/admin/donnees` | administrateur | trois onglets |
| À propos | `/compte/a-propos` | tout compte | version, application sur ce téléphone, Confidentialité |

- `/admin` redirige vers `/admin/comptes`. Un non-administrateur garde « Réservé
  à l'administrateur. ».
- Les barres du haut et du bas restent celles d'aujourd'hui ; la flèche retour
  des sous-écrans mène au hub (`/compte`), celle du hub à l'accueil.
- `pathAfterCaveSwitch` : `/compte/moi` et `/compte/a-propos` sont permis à
  tout rôle, comme `/compte`.

## Hub « Mon compte »

- **Profil** : médaillon aux initiales (nom affiché, sinon e-mail), nom, e-mail.
- **Cartes de navigation** (lien pleine largeur, 48 px au moins, icône, titre,
  résumé, chevron) :

| Carte | Visible pour | Résumé |
|---|---|---|
| Moi | tous | « 1 cave » / « N caves » |
| Ma cave | propriétaire de la cave affichée | « N plans · N zones · N membres » (pluriels corrects ; « Aucun plan » si zéro plan) |
| Application | administrateur | « N inscriptions en attente » en badge warn s'il y en a, sinon « Comptes, coûts de l'IA, données du vin » |
| À propos | tous | « Version 2.15.0 » (valeur de `APP_VERSION`) |

Les résumés lisent les requêtes existantes (`me`, `plans`, `zones`, `members`,
`admin/registrations`), seulement quand la carte est visible. Pendant le
chargement, le résumé est vide ; en erreur, il est omis (la carte reste
utilisable).

## Moi

- **Mes caves** : une ligne par cave (nom, badge de rôle « Propriétaire » ok ou
  « Lecture seule » warn), badge « Cave affichée » ou bouton contour
  « Afficher ».
- **Application sur le téléphone** : les quatre états actuels, textes
  inchangés.
- **Se déconnecter** : bouton sombre (fer forgé) pleine largeur.

## Ma cave

Cartes actuelles dans le même ordre (Nom, Plans, Zones, Membres), plus
**Sauvegarde** en dernier : texte « Toute la cave dans un classeur Excel :
stock, journal, cotes. » et bouton « Télécharger la sauvegarde Excel »
(icône `download`). Changements d'affichage :

- **Plans** : les actions du plan affiché passent dans un menu « ⋯ » à côté des
  onglets : *Renommer* (feuille du bas « Nom du plan »), *Remplacer la photo*
  (ouvre le choix de fichier), *Supprimer le plan* (confirmation inchangée).
  Le reste (onglets, toucher le plan, nommer l'endroit, raccourcis, repères,
  Déplacer, Retirer le repère, clavier) est inchangé.
- **Zones** : *Modifier* ouvre une feuille du bas (Nom, Indication,
  « Enregistrer », « Annuler »). Le formulaire d'ajout (sans plan) reste dans
  la carte.
- **Membres** : la ligne de personne commune (voir Motifs) ; badges
  « Propriétaire », « Lecture seule », « Invitation en attente ».

## Application

Rangée d'onglets en haut (`role="tablist"`, lien par onglet) : « Comptes »,
« Coûts de l'IA », « Données du vin ». L'onglet Comptes porte un badge warn avec
le nombre d'inscriptions en attente s'il y en a.

### Comptes

- **Inscriptions** (carte, titre « Inscriptions ») : inchangé, *Valider* et
  *Refuser* directs.
- **Comptes** (carte, titre « Comptes ») : ligne de personne commune ; badges
  « Administrateur », « Bloqué », « En attente » ; dates de création et de
  dernière connexion ; menu « ⋯ » avec, selon le compte, *Bloquer* /
  *Réactiver*, *Promouvoir administrateur* / *Retirer les droits*, *Créer sa
  cave*. *Bloquer* et *Retirer les droits* demandent une confirmation
  (« Bloquer camille@example.fr ? Le compte ne pourra plus se connecter. »,
  « Retirer les droits d'administrateur de camille@example.fr ? »). Sa propre
  ligne : pas de menu, mention « votre compte ».

### Coûts de l'IA

- **Budget** : jauge « Dépensé ce mois : 3,42 € sur 10,00 € » (barre
  horizontale, `role="meter"`), puis les deux parts et « Enregistrer » comme
  aujourd'hui.
- **Consommation Gemini** : pastilles 7 / 30 jours, bandeau de pause inchangé,
  puis
  - trois chiffres clés : « Coût » (€), « Réussis », « Refusés » (en % des
    appels) ;
  - barres empilées par jour, une couleur par usage (5 usages), légende sous
    le graphique ; en CSS comme les barres de la page Statistiques, sans
    bibliothèque ; chaque jour accessible (texte alternatif « 18/10 : 14
    appels, 0,35 € ») ;
  - « Détail par jour » dans un `<details>` replié : le tableau actuel ;
  - total et texte d'aide inchangés.

### Données du vin

Qualité de la lecture, Qualité des millésimes, Gardes : contenu inchangé, une
carte chacune. Gardes : *Ajuster* ouvre une feuille du bas (Couleur, Garde
minimale, Garde maximale, « Enregistrer la garde », « Annuler »).

## À propos

- « Version 2.15.0 » (avec le suffixe de build s'il existe).
- « Application installée sur cet appareil » ou « Application non installée »
  (même détection que Moi).
- Lien « Règles de confidentialité » vers `/confidentialite`.

Le lien « Confidentialité » quitte le bas de l'Administration.

## Écrans d'état

- **Inscription en attente** : ajout d'un bouton contour « Actualiser » qui
  relit la session (`me`) ; si le compte a été validé, l'application s'ouvre.
- **Pas de cave** : inchangé.

## Motifs communs

- **Feuille du bas** : composant `BottomSheet` sur `<dialog>` natif
  (`showModal`), titre, contenu, fermeture par « Annuler », Échap ou toucher
  hors du panneau ; focus rendu à l'élément d'origine ; respect de
  `prefers-reduced-motion`.
- **Menu « ⋯ »** : composant `ActionMenu` (bouton `aria-haspopup="menu"`,
  liste `role="menu"`, fermeture par Échap et toucher extérieur, cibles de 48 px).
- **Ligne de personne** : composant `PersonRow` (titre = nom affiché ou
  e-mail, e-mail en dessous si le nom existe, badges, métadonnées, zone
  d'action à droite), utilisé par Membres et Comptes.
- **Libellé du rôle invité** : « Lecture seule » partout (barre du haut,
  menu des caves, Moi, Membres). Le menu déroulant de la barre du haut affiche
  « Cave de Paul · Lecture seule ».
- Un seul bouton principal par carte ; les autres en contour ou lien.

## Erreurs et états

Messages de l'api affichés tels quels, comme aujourd'hui. Chaque carte garde ses
états vides et d'erreur actuels.

## Tests

- Vitest pour chaque écran : visibilité des cartes du hub par rôle, résumés,
  redirections `/admin` → `/admin/comptes`, onglets, menu « ⋯ » et
  confirmations, feuilles du bas (ouverture, enregistrement, annulation),
  graphique (une barre par jour, segments par usage, détail replié), À propos,
  « Actualiser ».
- Les tests actuels des sections sont adaptés, aucun comportement retiré.
- Vérification dans le navigateur à 375 px (aucun défilement horizontal) et à
  640 px.
