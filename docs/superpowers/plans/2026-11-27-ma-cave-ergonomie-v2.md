# Ergonomie, version 2 : accueil « chiffres et carte » et liste compacte — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :**
- L'accueil devient : bandeaux, trois tuiles chiffrées, une carte réduite, puis
  *Voir mes N bouteilles*.
- La liste de la cave passe à une ligne par vin, avec l'emplacement, une seule
  recherche (vin ou plat) et des pastilles de couleur.

**Architecture :**
- Seule modification de l'API : `GET /api/cave` renvoie les endroits (`places`)
  de chaque vin. Aujourd'hui, seule la liste « à boire » les renvoie.
- Côté web :
  - un utilitaire `shortPlace` donne le libellé court de l'emplacement ;
  - l'accueil et `CavePage` sont réorganisés ;
  - aucune nouvelle dépendance.

**Tech Stack :** NestJS et Prisma (API, Jest), React 18, React Router 6,
TanStack Query 5, Vitest et Testing Library.

**Spec :** `docs/superpowers/specs/2026-11-27-ma-cave-ergonomie-design.md`.
Sections concernées : « 2. Accueil », « 3. Liste de la cave », et les
décisions de Claude sur l'emplacement de la liste, la tuile « à boire vite »
et les pastilles de la liste.

## Global Constraints

- Tout le texte visible est en français. Lisible à 375 px de large, cibles
  tactiles d'au moins 44 px. La couleur n'est jamais le seul signal.
- Aucune nouvelle dépendance. Côté API, la seule modification est `places` sur
  toutes les lignes de `GET /api/cave` : une seule lecture groupée par
  chargement (`LocationsService.placesByWine`).
- **Adresses à garder :**
  - `/cave?region=…` (lien depuis la carte) ;
  - `/cave?filtre=priorite`, `/cave?filtre=sans-apogee` ;
  - `/cave?q=…` ;
  - `/a-boire`.
- **Membre en lecture seule :**
  - pas de bandeau « à confirmer », pas d'icône photo dans la recherche ;
  - mêmes tuiles et même carte que le propriétaire.
- Rien ne disparaît de l'application, tout au plus déplacé :
  - *À boire prochainement* reste complet sur `/a-boire` ;
  - les derniers mouvements sont dans l'onglet Mouvements ;
  - apogée, note et couleur sont sur la fiche ;
  - les filtres sont dans le panneau *Filtres*.
- **Commits :**
  - zsh :
    `g(){ git -c user.name=djkix -c user.email=202098449+djkix@users.noreply.github.com "$@"; }`
  - message terminé par
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ;
  - travail sur `main`.
- **Vérification :**
  - web : `cd web && npx vitest run`, puis `npx tsc --noEmit -p .` et
    `npx eslint <fichiers>` ;
  - API : `cd api && npx jest <chemins>` avec la base `cave_test` (variables
    du fichier `api-dev.env` du dossier scratchpad), puis
    `npx tsc --noEmit -p tsconfig.json`.

## Review Focus

1. **Vin rangé à plusieurs endroits, ou sans emplacement.** La ligne affiche
   « 2 endroits », ou « — », jamais un libellé vide. Tests en tâche 2.
2. **Texte qui est à la fois un vin et un plat** (par exemple « Bourgogne »,
   ou « comté » dans un nom de domaine). Les vins trouvés restent affichés, et
   la ligne *Vins pour « … »* s'ajoute seulement si un plat est reconnu.
   Tâche 4.
3. **Arrivée depuis la carte** (`/cave?region=Bourgogne`). Le filtre région
   s'applique et apparaît en puce retirable, alors que les pastilles de région
   sont maintenant dans le panneau. Tâche 4.
4. **Cave vide.** Les tuiles affichent 0, la carte garde son message actuel
   « Aucune bouteille pour l'instant », et il n'y a pas d'erreur. Tâche 3.
5. **Vins épuisés affichés** (case *Épuisés* du panneau). La ligne garde
   l'état épuisé (`cave-row--empty` et le texte « Épuisé ») au lieu d'un « 0 »
   ambigu. Tâche 4.

---

### Task 1 : API, endroits sur toutes les lignes de la cave

**Files :**
- Modify : `api/src/cave/cave.service.ts:45-46` et `:163-168`.
  - `places` est rempli pour tous les `items` de `list()`, en une seule lecture
    `placesByWine(caveId, ids)`, quel que soit le filtre.
  - Mettre à jour le commentaire de `CaveItem`.
- Modify : `web/src/lib/api-client.ts:388-389`, commentaire de
  `CaveRow.places` : « Endroits du vin (liste et fiche) ».
- Test : `api/src/cave/cave.service.spec.ts`, et le test d'intégration de
  `list` s'il en existe un.

**Interfaces :**
- Produces : chaque élément de `GET /api/cave` porte
  `places: Place[]`. Un vin sans emplacement donne `[]`, ou
  `[{ id: null, label: 'Sans emplacement', … }]`, selon ce que
  `placesByWine` rend déjà. Le comportement de `placesByWine` ne change pas.

- [ ] **Step 1 : écrire le test qui échoue**

  Dans `cave.service.spec.ts`, avec le même montage que le test existant de
  `drinkSoon` :

  ```ts
  it('rend les endroits de chaque vin, sans filtre « à boire »', async () => {
    // placesByWine mocké : w1 → [{ id: 'l1', label: 'Garage / C15', quantity: 6, zoneId: 'z1', casier: 'C15' }]
    const items = await service.list('c1', {}, 'OWNER');
    expect(items.find((i) => i.id === 'w1')?.places).toEqual([expect.objectContaining({ casier: 'C15' })]);
    expect(locations.placesByWine).toHaveBeenCalledTimes(1);
  });
  ```

- [ ] **Step 2 : vérifier qu'il échoue**

  `cd api && npx jest src/cave/cave.service.spec.ts -t "endroits de chaque vin"`
  → ÉCHEC (`places` est `undefined`).

- [ ] **Step 3 : implémenter**

  Sortir l'appel à `placesByWine` du bloc `drinkSoon` pour qu'il s'applique à
  toutes les lignes. Garder le tri par emplacement de `drinkSoon`, qui en
  dépend.

- [ ] **Step 4 : vérifier**

  `cd api && npx jest src/cave src/locations src/caves.isolation.e2e.spec.ts`,
  puis `tsc` → tout est vert.

- [ ] **Step 5 : commit**

  `feat(api): endroits de chaque vin dans la liste de la cave`

### Task 2 : libellé court de l'emplacement

**Files :**
- Modify : `web/src/lib/cave-list.ts`, ajout de `shortPlace`.
- Test : `web/src/lib/cave-list.test.ts`.

**Interfaces :**
- Produces : `shortPlace(places: Place[] | undefined): string`.
  - Sans endroit rangé (liste absente, vide, ou seulement `id: null`) : « — ».
  - Un seul endroit rangé : `casier` s'il existe, sinon le dernier segment de
    `label` après « / ».
  - Plusieurs endroits rangés : « {n} endroits ».

- [ ] **Step 1 : écrire le test qui échoue**

  ```ts
  it('libellé court : case, dernier segment, plusieurs endroits, aucun', () => {
    const p = (o: Partial<Place>): Place => ({ id: 'l', label: 'Garage / C15', quantity: 1, zoneId: 'z', casier: 'C15', ...o });
    expect(shortPlace([p({})])).toBe('C15');
    expect(shortPlace([p({ casier: null, label: 'Cellier / Étagère haute' })])).toBe('Étagère haute');
    expect(shortPlace([p({}), p({ id: 'l2', casier: 'C3' })])).toBe('2 endroits');
    expect(shortPlace([p({ id: null, label: 'Sans emplacement', casier: null })])).toBe('—');
    expect(shortPlace([])).toBe('—');
    expect(shortPlace(undefined)).toBe('—');
    expect(shortPlace([p({}), p({ id: null, label: 'Sans emplacement', casier: null })])).toBe('C15');
  });
  ```

- [ ] **Step 2 : vérifier qu'il échoue**

  `cd web && npx vitest run src/lib/cave-list.test.ts` → ÉCHEC
  (`shortPlace` est introuvable).

- [ ] **Step 3 : implémenter `shortPlace`**

- [ ] **Step 4 : vérifier**

  Suite web complète, `tsc` et `eslint`.

- [ ] **Step 5 : commit**

  `feat(web): libellé court de l'emplacement d'un vin`

### Task 3 : accueil « chiffres et carte »

**Files :**
- Modify : `web/src/pages/HomePage.tsx`.
- Modify : `web/src/components/FranceMap.tsx:44`. Le chiffre d'une région ne
  s'affiche que s'il est supérieur à 0. L'`aria-label` garde
  « {région}, 0 bouteille ».
- Modify : `web/src/styles/base.css:519` et `web/src/styles/home.css`.
  - La carte réduite fait au plus 170 px de haut (`max-height`), centrée.
  - Ajouter les styles des tuiles.
- Test : `web/src/pages/HomePage.test.tsx` et `web/src/components/FranceMap.test.tsx`
  (s'il existe, sinon dans le test de l'accueil).

**Interfaces :**
- Consumes :
  - `useToConfirmCount()` (version 1) ;
  - `useDrinkSoon()` de `lib/drink-soon.ts`, clé `['cave', { drinkSoon: true }]` ;
  - `getCave({})`, clé `['cave', {}]`.
- **Contenu de `HomePage`, de haut en bas :**
  1. Les bandeaux actuels : inscriptions, file hors ligne, analyse en cours, et
     *N vins à confirmer* pour le propriétaire. Ils ne changent pas.
  2. `HomeTiles` (composant local), trois tuiles `role="group"` :
     - *bouteilles* : somme des `quantity` positives de `['cave', {}]` ;
     - *références* : nombre de vins en stock de cette même lecture ;
     - *à boire vite* : somme des `quantity` de `useDrinkSoon()`. Cette tuile
       est un `Link` vers `/a-boire`.

     Chaque tuile montre le nombre en grand et son libellé dessous, au
     singulier à 1 (« 1 bouteille », « 1 référence »).
  3. `CaveMap` sans son titre « Ma cave en France · N btl ». Le sur-titre
     *Répartition géographique* reste. Les pastilles de régions et le volet
     ne changent pas.
  4. Le lien *Voir mes N bouteilles* (`CaveLink`, sans changement).
- **Retiré de l'accueil :**
  - `DrinkSoonCard`, la carte *Derniers mouvements* et sa requête
    `getRecentMovements` ;
  - pour le membre, le lien *Statistiques*, devenu inutile avec l'onglet
    Stats.
- `DrinkSoonCard` reste dans le code s'il sert ailleurs, sinon il est supprimé
  avec son test. Vérifier avec `grep`.

- [ ] **Step 1 : écrire les tests qui échouent**, dans `HomePage.test.tsx`

  - Avec `getCave` qui donne trois lignes (quantités 3, 2 et 0) et
    `getCave({ drinkSoon: true })` qui donne une ligne de 2 :
    - `getByRole('group', { name: /bouteilles/ })` contient « 5 » ;
    - la tuile *références* contient « 2 » ;
    - le lien *à boire vite* contient « 2 » et a `href` `/a-boire`.
  - Cave vide : les trois tuiles affichent « 0 », et
    « Aucune bouteille pour l'instant » est présent.
  - Le titre « Ma cave en France · » est absent, ainsi que « Derniers
    mouvements » et « À boire prochainement », et `getRecentMovements` n'est
    jamais appelé.
  - Membre : mêmes tuiles, pas de lien *Statistiques*, pas de « à confirmer ».
  - Carte : avec Bourgogne à 12 et Loire à 0, le texte « 0 » n'est pas rendu
    dans le SVG (`container.querySelectorAll('.france-map__count')` ne
    contient pas « 0 »). L'`aria-label` « Loire, 0 bouteille » existe.
  - Les tests existants qui attendent la carte des derniers mouvements, le
    titre de la carte ou *À boire prochainement* sur l'accueil sont retirés
    ou adaptés.

- [ ] **Step 2 : vérifier qu'ils échouent**

  `cd web && npx vitest run src/pages/HomePage.test.tsx` → ÉCHEC.

- [ ] **Step 3 : implémenter**

  Faire `HomeTiles`, l'ordre des blocs, la carte sans zéros et sans titre, et
  les styles.

- [ ] **Step 4 : vérifier**

  - Suite web complète, `tsc` et `eslint`.
  - Puis, dans le navigateur au format mobile (375 × 812), sur `/` avec les
    serveurs `web` et `api` : les tuiles et la carte réduite sont visibles
    sans faire défiler.

- [ ] **Step 5 : commit**

  `feat(web): accueil en tuiles chiffrées et carte réduite`

### Task 4 : liste de la cave compacte

**Files :**
- Modify : `web/src/pages/CavePage.tsx`.
- Modify : `web/src/styles/cave.css`.
  - Ajouter la ligne compacte : grille nom, emplacement, nombre.
  - Retirer les règles `cave-fab` et `cave-search--dish` si plus rien ne les
    utilise.
- Test : `web/src/pages/CavePage.test.tsx`.

**Interfaces :**
- Consumes :
  - `shortPlace` (tâche 2) ;
  - `CaveRow.places` (tâche 1) ;
  - `findDishes(text, DISHES)` de `lib/accords-base/match`.
- **Recherche :** un seul champ `type="search"`, placeholder « Chercher un vin
  ou un plat… », `aria-label` « Rechercher ».
  - Il garde l'état `q` et le paramètre `?q=`. L'icône photo vers `/sortie`
    reste, pour le propriétaire seulement.
  - Le champ « Accords : … » disparaît.
  - Si `q.trim()` fait au moins 3 caractères et que `findDishes(q, DISHES)[0]`
    existe, un bouton *Vins pour « {plat.name} »* s'affiche sous le champ.
    Le toucher fait passer en mode plat : `dish` vaut le nom du plat, `q`
    est vidé, et le classement par accord actuel s'applique.
  - En mode plat, une puce *Plat : {nom}* retirable s'affiche (`removeFilter`
    existant), et la ligne « Classés par accord avec : … » reste.
- **Pastilles sous la recherche** (`role="group"`, `aria-label` « Filtres
  rapides ») :
  - *Tous* (`aria-pressed` si ni couleur ni « à boire ») ;
  - *Rouge*, *Blanc*, *Rosé*, *Pétillant* : choisissent `color`, un second
    toucher revient à *Tous* ;
  - *À boire* : bascule `apogeeFilter` entre `'drinkSoon'` et `''` ;
  - le select *Tri : {critère}*, sorti du panneau, avec les mêmes options.
- **Panneau *Filtres*** : arômes, millésime, tanin, emplacement, *Sans apogée*,
  *Épuisés*, et les pastilles de régions déplacées depuis le haut de l'écran.
  Le compteur *Filtres actifs (N)* et les puces retirables ne changent pas ;
  la région active y figure.
- **Ligne d'un vin** (`Link` vers `/cave/{id}`, classe `cave-row cave-row--compact`) :
  - colonne 1 : `{producer}{ — cuvée} {vintage ?? 'NV'}`, puis en dessous, en
    mode plat seulement, `avec : {matchedDish}` ;
  - colonne 2 : `shortPlace(w.places)`, avec un `aria-label`
    « Emplacement : … » ;
  - colonne 3 : la quantité. Pour un vin épuisé, le texte « Épuisé » à la
    place, et la classe `cave-row--empty`.
  - Plus de vignette, de point de couleur, de puces d'apogée ni de note sur la
    ligne.
- **Inchangé :** le compteur « N bouteilles · N références » au-dessus de la
  liste, et la bannière « N vins sans apogée estimée ».
- **Retiré :** le bouton flottant *Ajouter un vin*.

- [ ] **Step 1 : écrire les tests qui échouent**, dans `CavePage.test.tsx`

  - Un seul `searchbox` nommé « Rechercher », et aucun champ « Accompagner un
    plat ».
  - Taper « comté » : le bouton `/Vins pour « Comté »/` apparaît. Le toucher
    classe par accord (« Classés par accord avec : Comté ») et vide le champ.
    Une puce `/Plat : Comté/` s'affiche, et la retirer revient à la liste.
  - Taper « Tempier », sans plat de la base : aucun bouton *Vins pour*.
  - Pastille *Rouge* : `getCave` est rappelé avec `color: 'ROUGE'`, et la
    pastille a `aria-pressed="true"`. Un second toucher remet *Tous* à
    `aria-pressed="true"`.
  - Pastille *À boire* : `getCave` reçoit `drinkSoon: true`.
  - Ligne : avec `places` `[{ casier: 'C15', … }]`, le texte « C15 » et la
    quantité « 6 » sont dans le lien vers `/cave/w1`. Avec deux endroits :
    « 2 endroits ». Sans endroit : « — ».
  - Épuisé (`quantity: 0`) : « Épuisé » est dans la ligne, qui porte
    `cave-row--empty`.
  - `/cave?region=Bourgogne` : `getCave`, ou le filtre côté web existant,
    applique la région, et une puce retirable « Bourgogne » est visible sans
    ouvrir le panneau.
  - Le lien « Ajouter un vin » est absent.
  - Les tests existants sur l'ancien champ d'accords, la vignette, les puces
    d'apogée et le bouton flottant sont retirés ou adaptés.

- [ ] **Step 2 : vérifier qu'ils échouent**

  `cd web && npx vitest run src/pages/CavePage.test.tsx` → ÉCHEC.

- [ ] **Step 3 : implémenter**

  Faire la recherche unique, les pastilles, le panneau, la ligne compacte et
  le CSS.

- [ ] **Step 4 : vérifier**

  - Suite web complète, `tsc` et `eslint`.
  - Puis, dans le navigateur au format mobile, sur `/cave` : une ligne par vin
    avec son emplacement. Taper « comté » propose *Vins pour « Comté »*.

- [ ] **Step 5 : commit**

  `feat(web): liste de la cave compacte, recherche unique vin ou plat`

### Task 5 : documentation

**Files :**
- Modify : `README.md`. Mettre à jour les fonctionnalités « Cave et fiche
  vin », « Statistiques » et « Accords » :
  - les tuiles de l'accueil ;
  - la carte réduite ;
  - la liste compacte avec l'emplacement ;
  - la recherche unique avec *Vins pour « … »* ;
  - les pastilles.

  Remplacer la mention de « Accompagner un plat » dans l'onglet Cave.
- Modify : `docs/guide-detaille.md`. Mêmes points, avec `places` sur
  `GET /api/cave`.

- [ ] **Step 1 : relever les mentions à changer**

  `grep -n "Accompagner un plat\|À boire prochainement\|Ajouter un vin\|Ma cave en France\|Derniers mouvements" README.md docs/guide-detaille.md`

- [ ] **Step 2 : rédiger les mises à jour**

  Rédiger en français, sans toucher à l'historique des versions.

- [ ] **Step 3 : commit**

  `docs: accueil en tuiles et liste compacte`
