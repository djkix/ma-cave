# Ergonomie, version 3 : fiche vin repliée et statistiques par thème — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :**
- **Fiche vin :** dans le premier écran, l'étiquette en grand, l'identité, deux
  tuiles (stock et emplacement, fin d'apogée), la note et les accords
  conseillés. Le reste est replié.
- **Statistiques :**
  - trois tuiles (bouteilles, références, bues dans l'année) ;
  - la rubrique *Stock* ouverte, avec un anneau des couleurs, des colonnes par
    millésime et les régions ;
  - quatre rubriques repliées ;
  - plus aucune ligne à zéro.

**Architecture :**
- Web seulement, sans modification de l'API ni nouvelle dépendance.
- Un composant `Fold` (`<details>` natif) est partagé entre la fiche et les
  statistiques.
- Les blocs existants de la fiche (`DomaineBlock`, `TraitsBlock`,
  `ApogeeBlock`, `TastedPairingsBlock`, `QuoteBlock`, `LocationsBlock`) sont
  réutilisés tels quels, rangés dans des `Fold`.
- Les graphiques nouveaux (anneau, colonnes) sont en SVG ou CSS.

**Tech Stack :** React 18, React Router 6, TanStack Query 5, Vitest et
Testing Library.

**Spec :** `docs/superpowers/specs/2026-11-27-ma-cave-ergonomie-design.md`.
Sections concernées : « 4. Fiche vin », « 5. Statistiques », et les décisions
de Claude sur la tuile « bues en {année} ».

## Global Constraints

- Tout le texte visible est en français. Lisible à 375 px de large, cibles
  tactiles d'au moins 44 px. La couleur n'est jamais le seul signal : l'anneau
  a une légende chiffrée en texte.
- Aucune modification de l'API, aucune nouvelle dépendance.
- **Membre en lecture seule :**
  - ni crayon, ni *Corriger*, ni *Sortir*, ni bloc *Cote et valeur* sur la
    fiche ;
  - pas de rubrique *Valeur et cote* dans les statistiques, puisque les clés de
    prix sont absentes de sa réponse.
- Rien ne disparaît, tout au plus déplacé ou replié :
  - chaque bloc actuel de la fiche reste accessible ;
  - chaque graphique actuel des statistiques reste dans une rubrique.
- La barre *Sortir une bouteille* collée en bas de la fiche ne change pas.
- Les rubriques et blocs repliés le sont à chaque visite, sans mémorisation.
- **Commits :**
  - zsh :
    `g(){ git -c user.name=djkix -c user.email=202098449+djkix@users.noreply.github.com "$@"; }`
  - message terminé par
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ;
  - travail sur `main`.
- **Vérification :**
  - `cd web && npx vitest run`, puis `npx tsc --noEmit -p .` et
    `npx eslint <fichiers>` ;
  - un contrôle au format mobile (375 × 812) dans le navigateur local pour
    chaque écran.

## Review Focus

1. **Vin sans photo.** Le bandeau de couleur remplace l'étiquette, sans image
   cassée ni grand vide. Test en tâche 2.
2. **Vin sans apogée** (non millésimé, garde inconnue). La tuile dit « sans
   apogée », jamais « null » ni « NaN ». Tâche 2.
3. **Statistiques d'une cave sans mouvement cette année.** La tuile « bues en
   {année} » vaut 0, et la rubrique *Consommation* garde son message actuel
   au lieu d'une courbe vide. Tâche 3.
4. **Cave d'un seul vin, ou toutes les bouteilles non millésimées.** L'anneau
   à 100 % est un cercle plein, et la colonne « Non millésimé » est seule,
   sans division par zéro. Tâche 3.
5. **Membre en lecture seule.** Pas de bloc *Cote et valeur* sur la fiche, pas
   de rubrique *Valeur et cote* dans les statistiques, pas d'entrée « Chercher
   une image » (la source d'une image du web reste citée). Tâches 2 et 3.

---

### Task 1 : section repliable partagée

**Files :**
- Create : `web/src/components/Fold.tsx`.
- Modify : `web/src/styles/base.css`, styles de `.fold`.
- Test : `web/src/components/Fold.test.tsx`.

**Interfaces :**
- Produces :

  ```ts
  Fold({ title, note, icon, open, disabled, children }: {
    title: string;
    note?: string;
    icon?: string;
    open?: boolean;
    disabled?: boolean;
    children: ReactNode;
  })
  ```

  - **Rendu :**
    - `<details className="card fold">` ;
    - un `<summary>` qui contient l'icône (si fournie), `title`, `note` entre
      parenthèses en texte secondaire (si fournie), et un chevron ;
    - les enfants dessous.
  - **`open` :** l'état initial (`defaultOpen` natif, via l'attribut `open`
    au premier rendu).
  - **`disabled` :**
    - le `<summary>` ne déplie pas : un `onClick` empêche l'ouverture ;
    - il porte `aria-disabled="true"` ;
    - les enfants ne sont pas rendus.
  - **Enfants :** les cartes enfants (`.fold > .card`) perdent leur bordure et
    leur marge par CSS, pour ne pas faire carte dans la carte.

- [ ] **Step 1 : écrire les tests qui échouent**

  - Fermé par défaut : `getByText('Contenu')` n'est pas visible, et un toucher
    sur le titre le rend visible.
  - `open` : le contenu est visible d'emblée.
  - `note="en préparation"` : le texte du résumé contient
    « Le domaine (en préparation) ».
  - `disabled` : un toucher ne déplie pas (`details.open` reste `false`), le
    résumé a `aria-disabled="true"`, et « Contenu » n'est pas dans le DOM.

- [ ] **Step 2 : vérifier qu'ils échouent**

  `cd web && npx vitest run src/components/Fold.test.tsx` → ÉCHEC (module
  introuvable).

- [ ] **Step 3 : implémenter `Fold` et ses styles**

- [ ] **Step 4 : vérifier**

  Suite web complète, `tsc` et `eslint`.

- [ ] **Step 5 : commit**

  `feat(web): section repliable partagée`

### Task 2 : fiche vin

**Files :**
- Modify : `web/src/pages/WinePage.tsx:140-244`.
- Modify : `web/src/components/ImageSearchBlock.tsx`. Ajouter deux props :
  - `trigger?: 'link' | 'none'`, par défaut `'link'` ;
  - `request?: number` : chaque changement de valeur supérieure à 0 lance
    `search()`.
- Modify : `web/src/styles/base.css`, ou le fichier de styles de la fiche
  (`grep -l "wine-head" web/src/styles`). Ajouter les styles de l'étiquette en
  grand, du bandeau sans photo et des tuiles.
- Test : `web/src/pages/WinePage.test.tsx`.

**Interfaces :**
- Consumes :
  - `Fold` (tâche 1) ;
  - `ActionMenu({ label, items })` existant.
- **Ordre de la fiche :**
  1. **L'étiquette en grand :**
     - avec une vignette (`referencePhotoId`) : `<img className="wine-hero">`,
       `src="/api/photos/{id}/image?variant=display"`, `alt=""`, environ
       180 px de haut, `object-fit: cover` ;
     - sans vignette, ou si l'image ne charge pas : un bandeau
       `<div className="wine-hero wine-hero--{couleur}" role="img" aria-label="Pas de photo">`
       de 48 px, de la couleur du vin.
  2. **L'identité**, dans la carte `wine-head` : le producteur en titre, la
     cuvée et l'appellation, puis le millésime (ou « NV »), le format, et la
     couleur en toutes lettres.
     - Pour le propriétaire, le crayon devient un `ActionMenu`
       `label="Modifier"`, avec deux entrées :
       - « Modifier le vin » ouvre `WineEditForm` ;
       - « Chercher une image » incrémente `request` d'`ImageSearchBlock`,
         monté avec `trigger="none"`.
     - Pour le membre, `ImageSearchBlock` garde `trigger="link"` : seule la
       source s'affiche, comme aujourd'hui.
  3. **Deux tuiles** (`wine-tiles`) :
     - *{N} bouteille(s)*, avec en dessous le libellé des endroits (le
       `LocationButton` actuel), puis le lien *Corriger le stock* pour le
       propriétaire. Le formulaire de correction s'ouvre dessous, comme
       aujourd'hui.
     - *{apogee.max}* avec « fin d'apogée » ; s'il n'y a pas de `max`,
       « sans apogée ».
  4. `RatingBlock` puis `PairingBlock`, inchangés et non repliés.
  5. **Les `Fold`, fermés, dans cet ordre :**
     - *Le domaine* (`DomaineBlock`), avec `note="en préparation"` et
       `disabled` quand `producerProfile` est `null` ou sans description ni
       champ rempli. Le statut se lit dans `producerProfile`.
     - *Caractéristiques et apogée* : `TraitsBlock` puis `ApogeeBlock`.
     - *Accords vécus* (`TastedPairingsBlock`), avec `note` « {n} » s'il y en
       a. Pour un membre sans accord vécu, pas de `Fold`, puisque le bloc rend
       déjà `null`.
     - *Cote et valeur* (`QuoteBlock`), propriétaire seulement, avec
       `note="pas de cote"` quand `quote` est `null`. Le bloc reste ouvrable
       pour saisir une cote.
     - *Mouvements et emplacements* : `LocationsBlock` s'il y a des endroits,
       puis la carte des derniers mouvements actuelle.
  6. `WineExitBar`, inchangé.
- **Blocs vides.** La spec veut qu'un bloc vide ne s'ouvre pas. Seul *Le
  domaine* peut être réellement vide sans action possible : il est le seul
  marqué `disabled`.
  - *Accords vécus* et *Cote et valeur* gardent une action pour le
    propriétaire (ajouter un plat, saisir la cote). Ils restent ouvrables,
    avec leur `note`.
  - Pour un membre, ces deux blocs ne sont pas rendus quand ils sont vides.

- [ ] **Step 1 : écrire les tests qui échouent**, dans `WinePage.test.tsx`

  - Avec `referencePhotoId: 'p1'` : un `img` de classe `wine-hero` a `src`
    `/api/photos/p1/image?variant=display`. Sans photo : un `role="img"` nommé
    « Pas de photo », de classe `wine-hero--rouge` pour un rouge.
  - Tuiles :
    - « 6 bouteilles » est visible ;
    - avec `apogee.max: 2031` : « 2031 » et « fin d'apogée » ;
    - avec `apogee.max: null` : « sans apogée ».
  - « Le domaine », « Caractéristiques et apogée », « Cote et valeur » et
    « Mouvements et emplacements » sont des résumés de `details` fermés.
    « Derniers mouvements » n'est pas visible avant le toucher sur
    « Mouvements et emplacements », et l'est après.
  - Profil du domaine `null` : le résumé contient « (en préparation) », avec
    `aria-disabled="true"`.
  - Propriétaire :
    - le menu « Modifier » propose « Modifier le vin » et « Chercher une
      image » ;
    - « Chercher une image » lance la recherche
      (`api.searchWineImage`, ou le nom réel de l'appel dans
      `ImageSearchBlock`, est appelé) ;
    - aucun lien « Chercher une image » n'est visible hors du menu.
  - Membre (`viewerMe()`) : ni bouton « Modifier », ni résumé « Cote et
    valeur ».
  - Les tests existants qui cliquent sur le crayon « Modifier le vin »
    passent désormais par le menu. Ceux qui lisent un bloc maintenant replié
    l'ouvrent d'abord, avec un toucher sur son résumé.

- [ ] **Step 2 : vérifier qu'ils échouent**

  `cd web && npx vitest run src/pages/WinePage.test.tsx` → ÉCHEC.

- [ ] **Step 3 : implémenter**

  Faire `ImageSearchBlock` (`trigger`, `request`), le nouvel ordre de
  `WinePage` et les styles.

- [ ] **Step 4 : vérifier**

  - Suite web complète, `tsc` et `eslint`.
  - Puis, au format mobile, sur la fiche d'un vin avec photo et d'un vin
    sans : stock, emplacement, apogée, note et accords sont visibles sans
    défiler jusqu'aux blocs repliés.

- [ ] **Step 5 : commit**

  `feat(web): fiche vin en étiquette, tuiles et sections repliées`

### Task 3 : statistiques par thème

**Files :**
- Create : `web/src/components/stats/ColorRing.tsx` et
  `web/src/components/stats/YearColumns.tsx`.
- Modify : `web/src/pages/StatsPage.tsx`.
- Modify : `web/src/components/stats/BarList.tsx`. Les lignes à `bottles: 0`
  sont masquées, et une liste vide ne rend rien (`null`).
- Modify : `web/src/styles/base.css`, styles de l'anneau, des colonnes et des
  tuiles. Réutiliser `.home-tiles` et `.home-tile` de l'accueil.
- Test : `web/src/pages/StatsPage.test.tsx` et
  `web/src/components/stats/*.test.tsx`.

**Interfaces :**
- Consumes : `Fold` (tâche 1) et le type `Stats` existant.
- Produces :
  - `drunkThisYear(months: Stats['months'], now = new Date()): number`,
    exporté de `StatsPage.tsx` ou d'un `lib/stats-view.ts`. C'est la somme des
    `out` des mois dont la clé commence par `{année de now}-`. Les clés sont
    au format `AAAA-MM`.
  - `ColorRing({ rows }: { rows: BarRow[] })` :
    - un anneau SVG en arcs proportionnels aux `share`, avec la couleur
      `COLOR_VAR` de chaque ligne ;
    - une légende texte « Rouge 22 », « Blanc 6 » à côté ;
    - les lignes à 0 sont ignorées ;
    - une seule ligne donne un cercle complet.
  - `YearColumns({ rows }: { rows: BarRow[] })` :
    - une colonne par millésime, de hauteur proportionnelle au maximum ;
    - l'étiquette de l'année sous chaque colonne, et le nombre en
      `aria-label` de chaque colonne (`« 2019 : 6 bouteilles »`) ;
    - « Non millésimé » en dernier, comme dans `byYear`.
- **Ordre de la page :**
  1. **Tuiles** `home-tiles` :
     - *bouteilles* (`s.bottles`) ;
     - *références* (`s.references`) ;
     - *bues en {année}* (`drunkThisYear`).
  2. **`Fold` *Stock*, `open`** : `ColorRing` (couleurs), `YearColumns`
     (millésimes) et `BarList` *Région* (avec « Autres » comme aujourd'hui).
  3. **`Fold` *Garde et apogée*** : `BarList` *Apogée*, avec ses liens
     actuels.
  4. **`Fold` *Consommation*** : `MonthlyChart` (avec ses conditions
     actuelles), puis `RankList` « Les plus bus » et « Producteurs ».
  5. **`Fold` *Palais*** : `BarList` *Tanin des rouges* et *Arômes*.
     Absente s'il n'y a ni tanin ni arôme.
  6. **`Fold` *Valeur et cote*** (si `withPrices`) :
     - le chiffre « au prix d'achat » et sa note ;
     - `QuotedValue` ;
     - « Les plus chères » et « Les mieux notés ».

     Elle est absente si `purchaseValueCents` et `quotedValueCents` sont
     nuls et qu'aucun vin n'est noté. « Les mieux notés » va dans *Palais*
     pour un membre, qui n'a pas cette rubrique.
- Les messages actuels restent : « Calcul… », erreur, et cave vide « Aucune
  bouteille en cave pour l'instant ».

- [ ] **Step 1 : écrire les tests qui échouent**

  - `drunkThisYear` :
    - avec `[{ month: '2025-12', out: 4 }, { month: '2026-01', out: 2 }, { month: '2026-03', out: 1 }]`
      et `now` au 15 mars 2026 : le résultat est 3 ;
    - avec une liste vide : 0.
  - `BarList` : une ligne `bottles: 0` n'est pas rendue, et toutes les lignes
    à 0 ne rendent aucune section.
  - `ColorRing` :
    - avec Rouge 22 et Blanc 6, la légende contient « Rouge 22 » et
      « Blanc 6 » ;
    - avec une seule couleur, un seul arc rend un cercle complet
      (`circle`, ou un `path` dont l'arc fait 360°).
  - `YearColumns` :
    - les colonnes portent les `aria-label` « 2015 : 4 bouteilles » et
      « Non millésimé : 2 bouteilles », dans l'ordre reçu ;
    - avec une seule colonne, pas de `NaN` dans les styles.
  - `StatsPage` :
    - les tuiles « 28 bouteilles », « 6 références » et
      « {n} bues en {année} » existent ;
    - *Stock* est un `details` ouvert, et *Garde et apogée*, *Consommation*
      et *Palais* sont fermés ;
    - membre (réponse sans `purchaseValueCents`) : pas de résumé « Valeur et
      cote » ;
    - propriétaire sans aucun prix, cote ni note : pas de résumé « Valeur et
      cote » ;
    - avec `byApogee` qui contient « Passée : 0 », après ouverture de
      *Garde et apogée*, la ligne « Passée » est absente.
  - Les tests existants qui lisent un graphique maintenant replié ouvrent sa
    rubrique d'abord.

- [ ] **Step 2 : vérifier qu'ils échouent**

  `cd web && npx vitest run src/pages/StatsPage.test.tsx src/components/stats`
  → ÉCHEC.

- [ ] **Step 3 : implémenter**

  Faire `drunkThisYear`, `ColorRing`, `YearColumns`, le masquage des zéros de
  `BarList`, le nouvel ordre de `StatsPage` et les styles.

- [ ] **Step 4 : vérifier**

  Suite web complète, `tsc` et `eslint`, puis contrôle mobile de `/stats`.

- [ ] **Step 5 : commit**

  `feat(web): statistiques en tuiles et rubriques repliables`

### Task 4 : documentation

**Files :**
- Modify : `README.md`, fonctionnalités « Cave et fiche vin » et
  « Statistiques ».
- Modify : `docs/guide-detaille.md`. Décrire :
  - l'ordre de la fiche, les blocs repliés et le menu du crayon ;
  - les tuiles et rubriques des statistiques, et le calcul de « bues en
    {année} ».

- [ ] **Step 1 : relever les mentions à changer**

  `grep -n "Chercher une image\|fiche vin\|Fiche :\|Statistiques\|Répartition par" README.md docs/guide-detaille.md`

- [ ] **Step 2 : rédiger les mises à jour**

  Rédiger en français, sans toucher à l'historique des versions.

- [ ] **Step 3 : commit**

  `docs: fiche vin repliée et statistiques par thème`
