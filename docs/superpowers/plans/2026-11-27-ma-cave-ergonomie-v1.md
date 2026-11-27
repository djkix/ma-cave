# Ergonomie, version 1 : onglet Mouvements et vocabulaire — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer les onglets Entrée et Sortie par un onglet *Mouvements*.
L'onglet ouvre un nouvel écran `/mouvements` et porte une pastille avec le
nombre de vins à confirmer. Le vocabulaire est clarifié au passage :
« Annulation » et « Inventaire » au lieu d'« Ajustement » ou « Correction »,
plus de sur-titre « Ma Cave », « bouteilles » dans les accords.

**Architecture :**
- Web seulement, sans modification de l'API.
- Un hook `useToConfirmCount` centralise la lecture « à confirmer »
  (`['entry-inbox']`, relue toutes les 30 s). L'accueil et la barre du bas le
  partagent, donc une seule requête.
- Une nouvelle page `MouvementsPage` réutilise `MovementRow` du journal.

**Tech Stack :** React 18, React Router 6, TanStack Query 5, Vitest et
Testing Library.

**Spec :** `docs/superpowers/specs/2026-11-27-ma-cave-ergonomie-design.md`,
section « 1. Barre du bas » et les décisions de Claude correspondantes. Les
versions 2 et 3 sont hors de ce plan.

## Global Constraints

- Tout le texte visible est en français, comme le reste de l'application.
- Chaque page monte elle-même `<TopBar>` et `<BottomNav>`.
- Aucun changement d'API ; aucune nouvelle dépendance.
- Lisible à 375 px de large ; cibles tactiles d'au moins 44 px.
- Un membre en lecture seule ne voit pas l'onglet Mouvements. `/mouvements`
  passe par `RequireOwner`.
- Les adresses existantes restent valables : `/entree`, `/sortie`,
  `/a-confirmer`, `/journal`, `/entree/:photoId`, `/sortie/:photoId`.
- **Commits :**
  - zsh :
    `g(){ git -c user.name=djkix -c user.email=202098449+djkix@users.noreply.github.com "$@"; }`
  - message terminé par
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ;
  - travail sur `main`, sans branche.
- **Vérification d'une tâche :**
  - `cd web && npx vitest run` : toute la suite verte ;
  - `npx tsc --noEmit -p .` puis `npx eslint <fichiers modifiés>` : sans
    erreur.

## Review Focus

1. **Membre en lecture seule.** Il n'a ni onglet Mouvements ni pastille, et
   aucune lecture `entry-inbox` n'est faite pour lui (sinon erreur 403 toutes
   les 30 s). Les tests correspondants sont dans la tâche 2.
2. **Pastille à zéro.** Aucune pastille quand rien n'attend. Au singulier, le
   libellé accessible est « 1 vin à confirmer ». Tâche 2.
3. **Onglet allumé** sur `/journal`, `/a-confirmer`, `/entree/abc` et
   `/sortie/abc`. Réglages ne s'allume plus sur `/journal`. Tâche 2.
4. **Annulation d'un inventaire.** La note dit « Annulation de l'inventaire
   du … », jamais « de la correction ». Tâche 1.
5. **Membre sur `/mouvements` par lien direct.** Il est renvoyé à l'accueil
   par `RequireOwner`, comme pour `/entree`. Tâche 3.

---

### Task 1 : vocabulaire

**Files :**
- Modify : `web/src/lib/movement-note.ts`. Ajouter `movementTypeLabel`, et
  `KIND.ADJUST` passe de « de la correction » à « de l'inventaire ».
- Modify : `web/src/pages/JournalPage.tsx:14`. Remplacer `TYPE_LABEL` par
  `movementTypeLabel`.
- Modify : `web/src/pages/WinePage.tsx:30`. Remplacer `TYPE_LABEL` par
  `movementTypeLabel`, en gardant « Déplacé » pour `MOVE` sur la fiche.
- Modify : `web/src/components/TopBar.tsx:24-25`. Supprimer le sur-titre
  `topbar__eyebrow`, et sa règle CSS si plus rien ne l'utilise.
- Modify : `web/src/components/AccordsResults.tsx:74`. « N btl » devient
  « N bouteille » ou « N bouteilles ».
- Test : `web/src/lib/movement-note.test.ts`, `web/src/components/TopBar.test.tsx`,
  et les tests du journal et de la fiche qui vérifient « Ajustement » ou
  « Correction ».

**Interfaces :**
- Produces :

  ```ts
  movementTypeLabel(
    m: { type: 'IN' | 'OUT' | 'MOVE' | 'ADJUST'; reversesId: string | null },
    move?: string,
  ): string
  ```

  - `IN` donne « Entrée », `OUT` « Sortie », `MOVE` la valeur de `move`
    (par défaut « Déplacement ») ;
  - `ADJUST` avec `reversesId` donne « Annulation », sans `reversesId`
    « Inventaire ».

- [ ] **Step 1 : écrire les tests qui échouent**

  ```ts
  it('nomme un ajustement : annulation s’il en annule un autre, sinon inventaire', () => {
    expect(movementTypeLabel({ type: 'ADJUST', reversesId: 'm1' })).toBe('Annulation');
    expect(movementTypeLabel({ type: 'ADJUST', reversesId: null })).toBe('Inventaire');
    expect(movementTypeLabel({ type: 'IN', reversesId: null })).toBe('Entrée');
    expect(movementTypeLabel({ type: 'MOVE', reversesId: null }, 'Déplacé')).toBe('Déplacé');
  });
  it('l’annulation d’un inventaire le dit', () => {
    const inv = { id: 'a', type: 'ADJUST' as const, occurredAt: '2026-11-04T12:43:00Z', note: null, reversesId: null };
    const cancel = { id: 'b', type: 'ADJUST' as const, occurredAt: '2026-11-05T09:00:00Z', note: null, reversesId: 'a' };
    expect(movementNote(cancel, [inv, cancel])).toMatch(/^Annulation de l’inventaire du|^Annulation de l'inventaire du/);
  });
  ```

  Dans `TopBar.test.tsx` : avec `title="Journal"`, le texte « Ma Cave »
  n'apparaît plus dans l'en-tête, en dehors du lien du logo.

- [ ] **Step 2 : vérifier qu'ils échouent**

  `cd web && npx vitest run src/lib/movement-note.test.ts src/components/TopBar.test.tsx`
  → ÉCHEC (`movementTypeLabel` est introuvable, le sur-titre est présent).

- [ ] **Step 3 : implémenter**

  Faire les changements de fichiers listés plus haut. Les tests existants du
  journal et de la fiche qui attendent « Ajustement » ou « Correction » sont
  mis à jour avec les nouveaux libellés.

- [ ] **Step 4 : vérifier**

  Suite complète, `tsc` et `eslint` comme dans les Global Constraints.

- [ ] **Step 5 : commit**

  `fix(web): « Annulation » et « Inventaire » au lieu d'« Ajustement », sans sur-titre Ma Cave`

### Task 2 : pastille et barre du bas à cinq onglets

**Files :**
- Create : `web/src/lib/use-to-confirm.ts`.
- Modify : `web/src/pages/HomePage.tsx:21-24`. La requête `inbox` et le calcul
  de `toConfirm` passent par `useToConfirmCount()`. L'affichage ne change pas.
- Modify : `web/src/components/BottomNav.tsx`.
- Modify : `web/src/components/TopBar.tsx:8`. `SETTINGS_PATH` ne comprend plus
  `journal`.
- Test : `web/src/components/BottomNav.test.tsx` et
  `web/src/pages/HomePage.test.tsx`, à adapter si ce dernier espionne
  `getEntryInbox`.

**Interfaces :**
- Produces :
  - `useToConfirmCount(): number` : `toConfirm.length + failed.length` de
    `getEntryInbox()`.
    - Clé `['entry-inbox']`, `refetchInterval: 30_000`.
    - `enabled: isOwner` (de `useCurrentCave`).
    - Rend 0 tant que rien n'est lu, ou pour un non-propriétaire.
  - `export const MOVEMENTS_PATH = /^\/(mouvements|entree|sortie|a-confirmer|journal)(\/|$)/`,
    dans `BottomNav.tsx`.
- **Onglets dans cet ordre :**

  | Onglet | Lien | Icône | Particularité |
  |---|---|---|---|
  | Cave | `/` | `shelves` | |
  | Mouvements | `/mouvements` | `swap_vert` | propriétaire seulement |
  | Accords | `/accords` | `restaurant` | |
  | Stats | `/stats` | `bar_chart` | |
  | Réglages | `/compte` | `settings` | |

  - **Mouvements :** allumé si `MOVEMENTS_PATH` correspond au chemin. Il porte
    une pastille `badge badge--warn bottomnav__badge` quand le compte est
    supérieur à 0, avec `aria-label` « N vin(s) à confirmer », comme la
    pastille des inscriptions.
  - **Cave :** la règle d'allumage actuelle ne change pas.
  - **Réglages :** sa pastille d'inscriptions ne change pas.

- [ ] **Step 1 : écrire les tests qui échouent**, dans `BottomNav.test.tsx`

  - Propriétaire : les libellés sont exactement
    `['shelvesCave', 'swap_vertMouvements', 'restaurantAccords', 'bar_chartStats', 'settingsRéglages']`,
    et Mouvements a `href` `/mouvements`.
  - `it.each(['/mouvements', '/entree', '/entree/abc', '/sortie', '/sortie/abc', '/a-confirmer', '/journal'])` :
    l'onglet Mouvements a la classe `bottomnav__tab--active`.
  - Sur `/journal`, Réglages n'a pas `bottomnav__tab--active`.
  - Pastille : avec `getEntryInbox` mocké `{ toConfirm: [a, b], inProgress: [], failed: [c] }`,
    `findByLabelText('3 vins à confirmer')` existe.
    - Avec `{ toConfirm: [a], inProgress: [], failed: [] }` :
      `findByLabelText('1 vin à confirmer')`.
    - Avec des listes vides : aucun élément dont le libellé contient
      « à confirmer ».
  - Membre (`viewerMe()`) : les libellés sont
    `['shelvesCave', 'restaurantAccords', 'bar_chartStats', 'settingsRéglages']`,
    et `getEntryInbox` n'est jamais appelé (attendre 20 ms après `getMe`).
  - Les tests existants sur la liste à six onglets et sur Réglages allumé sur
    `/journal` sont remplacés par ceux-ci.

- [ ] **Step 2 : vérifier qu'ils échouent**

  `cd web && npx vitest run src/components/BottomNav.test.tsx` → ÉCHEC.

- [ ] **Step 3 : implémenter**

  Faire `use-to-confirm.ts`, puis la nouvelle barre `BottomNav`, puis
  `HomePage` sur le hook. Enfin, retirer `journal` de `SETTINGS_PATH`.

- [ ] **Step 4 : vérifier**

  Suite complète, `tsc` et `eslint` comme dans les Global Constraints.

- [ ] **Step 5 : commit**

  `feat(web): onglet Mouvements à la place d'Entrée et Sortie, avec la pastille des vins à confirmer`

### Task 3 : écran Mouvements

**Files :**
- Create : `web/src/pages/MouvementsPage.tsx`.
- Modify : `web/src/router.tsx`. Ajouter `{ path: '/mouvements', element: <MouvementsPage /> }`
  dans le groupe `RequireOwner`.
- Modify : `web/src/pages/JournalPage.tsx:56`. Le retour mène à `/mouvements`.
- Modify : `web/src/styles/base.css`. Ajouter la grille des deux boutons.
  Réutiliser `home-confirm` pour la ligne *À confirmer* et `home-wide-btn`
  pour le lien du journal.
- Test : `web/src/pages/MouvementsPage.test.tsx` (nouveau) et
  `web/src/router.test.tsx`.

**Interfaces :**
- Consumes :
  - `useToConfirmCount()` de la tâche 2 ;
  - `MovementRow` exporté par `JournalPage.tsx` ;
  - `getRecentMovements(limit)`.
- **Contenu de `MouvementsPage()`, de haut en bas :**
  - `TopBar title="Mouvements"`, sans retour, puisque c'est un onglet ;
  - deux liens-boutons côte à côte :
    - *Rentrer* (icône `add_circle`) vers `/entree` ;
    - *Sortir* (icône `remove_circle_outline`) vers `/sortie` ;
  - si le compte est supérieur à 0, un lien `home-confirm` vers
    `/a-confirmer`, avec le texte « N vin(s) à confirmer » ;
  - la carte *Derniers mouvements* : `getRecentMovements(10)`, clé
    `['movements', 'recent', 10]`, des `MovementRow`, et « Aucun mouvement
    pour l'instant. » si la liste est vide ;
  - le lien *Voir le journal complet* vers `/journal`, puis `<BottomNav />`.

- [ ] **Step 1 : écrire les tests qui échouent**, dans `MouvementsPage.test.tsx`

  - `getByRole('link', { name: /Rentrer/ })` a `href` `/entree`, et
    `/Sortir/` a `href` `/sortie`.
  - Avec 2 vins à confirmer et 1 photo illisible : le lien
    `/3 vins à confirmer/` a `href` `/a-confirmer`. Sans rien : aucun lien
    contenant « à confirmer ».
  - Avec `getRecentMovements` mocké sur une sortie : la ligne « Sortie » et
    le nom du vin s'affichent, et `getRecentMovements` est appelé avec 10.
    Avec une liste vide : « Aucun mouvement pour l'instant. ».
  - Le lien « Voir le journal complet » a `href` `/journal`.
  - Dans `router.test.tsx` :
    - un membre en lecture seule qui ouvre `/mouvements` arrive sur `/`
      (même forme que le test existant pour `/entree`) ;
    - un propriétaire qui ouvre `/journal` trouve un lien « Retour » vers
      `/mouvements`.

- [ ] **Step 2 : vérifier qu'ils échouent**

  `cd web && npx vitest run src/pages/MouvementsPage.test.tsx src/router.test.tsx`
  → ÉCHEC.

- [ ] **Step 3 : implémenter**

  Faire la page, la route, le retour du journal et la règle CSS.

- [ ] **Step 4 : vérifier**

  - Suite complète, `tsc` et `eslint`.
  - Puis, dans le navigateur au format mobile (375 × 812) avec
    `preview_start` `web` et `api` :
    - la barre affiche cinq onglets, et Mouvements est allumé sur
      `/mouvements` et `/a-confirmer` ;
    - les boutons ouvrent `/entree` et `/sortie`.

- [ ] **Step 5 : commit**

  `feat(web): écran Mouvements (rentrer, sortir, à confirmer, derniers mouvements)`

### Task 4 : documentation

**Files :**
- Modify : `README.md`. Dans la liste des fonctionnalités, décrire l'onglet
  Mouvements, sa pastille et les libellés « Annulation » et « Inventaire ».
  Mettre à jour les mentions de l'onglet Entrée ou Sortie de la barre du bas.
- Modify : `docs/guide-detaille.md`. Mêmes points, et chaque phrase qui parle
  des « onglets Entrée et Sortie » ou de « l'onglet Journal » pointe vers
  l'onglet Mouvements.

- [ ] **Step 1 : relever les mentions à changer**

  `grep -n "onglet\|barre du bas\|Ajustement\|Correction" README.md docs/guide-detaille.md`

- [ ] **Step 2 : rédiger les mises à jour**

  Rédiger en français. Ne pas toucher à l'historique des versions, que la
  publication complète.

- [ ] **Step 3 : commit**

  `docs: onglet Mouvements et nouveaux libellés`
