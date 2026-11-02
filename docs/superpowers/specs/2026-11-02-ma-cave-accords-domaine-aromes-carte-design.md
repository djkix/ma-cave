# Ma Cave — accords par vin, page Domaine, arômes et tanin, filtres, carte de France

Date : 2 novembre 2026. Conception validée en conversation avec Franck.

## Intention

Franck veut mieux explorer sa cave :
- partir d'une bouteille pour trouver quoi cuisiner ;
- en savoir plus sur un domaine ;
- retrouver un vin par son goût (boisé, noisette…), son tanin ou son millésime ;
- voir d'un coup d'œil d'où viennent ses bouteilles.

Ce sont cinq évolutions indépendantes. Elles peuvent sortir ensemble ou l'une après l'autre.

## Ce qui existe déjà (à réutiliser, pas à refaire)

- **Accords plat → vins.** L'onglet « Accord Vins » (`web/src/pages/AccordsPage.tsx`) : le plat se saisit au clavier ou à la dictée sur mobile, l'API répond par `POST /api/accords` et l'écran présente cinq propositions.
- **Accords par vin.** Le modèle `Pairing` (`dishes: String[]`) contient des plats générés par lots par Gemini (`api/src/pairing`, `GenerationBatchProcessor`). La fiche vin les affiche dans `PairingBlock`.
- **Descriptif du domaine.** Le modèle `ProducerProfile` porte un texte libre de 2000 caractères, généré par lots (`api/src/producers`). Il est partagé entre toutes les caves et seul un administrateur peut le corriger ou le régénérer. Il s'affiche dans `web/src/components/DomaineBlock.tsx`, sur la fiche vin. Le domaine est relié à ses vins par une clé normalisée du producteur (`producer-key.ts`) ; la table `wine` n'a pas de clé étrangère vers lui.
- **Régions.** La région d'un vin vient de `Appellation.region`, avec douze régions françaises dans `api/data/appellations.json` : Alsace, Beaujolais, Bordeaux, Bourgogne, Champagne, Jura, Languedoc-Roussillon, Loire, Provence, Rhône, Savoie, Sud-Ouest. Un vin sans appellation reconnue n'a pas de région (`NO_REGION` = « Sans région » dans les statistiques).
- **Filtres de la cave** (`web/src/pages/CavePage.tsx`). Ordre actuel : recherche, plat, couleur, emplacement, vins épuisés, à boire en priorité, sans apogée. Les filtres sont dessinés en pastilles (`filter-pill`, `filter-toggle`).
- **Quotas Gemini.** Quotas par modèle, bascule automatique entre les modèles Flash et Flash-Lite stables. Jamais de modèle Pro.

## 1. Accords : entrée par le vin

**Ce que veut Franck.** Dans l'onglet « Accord Vins », il choisit un vin de sa cave et voit les plats qui vont avec.

- L'onglet propose deux entrées : « J'ai un plat », le parcours actuel inchangé, et « J'ai un vin ».
- « J'ai un vin » permet de choisir un vin de la cave courante, par recherche sur le domaine, la cuvée ou l'appellation. Les vins épuisés sont exclus par défaut.
- Le résultat montre les plats déjà générés pour ce vin (`Pairing.dishes`), un plat par carte, avec un lien vers la fiche du vin.
- **Aucun nouvel appel à l'IA.** Si les accords du vin sont en cours de génération, afficher l'attente comme dans `PairingBlock`. S'ils ont échoué, le dire, avec un lien vers la fiche vin, où l'on peut relancer.
- **Mon choix : pas de regroupement par catégorie.** Les plats sont enregistrés comme de simples textes, sans catégorie, et Franck ne veut pas de nouvel appel à l'IA. Les cartes s'affichent donc dans l'ordre enregistré.
- **Mon choix :** l'entrée choisie et le dernier vin restent en mémoire pour la session (`sessionStorage`), comme le dernier plat aujourd'hui, pour que le retour depuis la fiche ne perde rien.

## 2. Page Domaine

**Ce que veut Franck.** Une page dédiée au domaine, remplie par l'IA, et qu'il peut corriger.

- Nouvelle page `/domaine/:producerKey`. On l'ouvre en touchant le nom du domaine sur la fiche vin, dans le `DomaineBlock` ou l'en-tête.
- Contenu, champ par champ :
  - histoire ;
  - terroir ;
  - cépages ;
  - style ;
  - nez typique (texte descriptif).

  Le descriptif libre actuel (`description`) reste affiché s'il existe. **Mon choix :** il fait office d'« histoire » pour les domaines déjà générés, et les autres champs se remplissent lors de la prochaine génération.
- Sous ces champs, la liste des vins de ce domaine dans la cave courante, avec leur stock et un lien vers chaque fiche.
- **Génération.** L'IA remplit les champs à la première demande, avec le même mécanisme par lots et les mêmes quotas que le descriptif actuel. On étend donc `ProducerProfile` et son traitement par lots ; on ne crée pas de second circuit.
- **Correction.** Chaque champ se corrige séparément. Comme aujourd'hui, seul un administrateur peut corriger ou régénérer, puisque le texte est commun à toutes les caves. Une correction manuelle n'est jamais écrasée par une régénération automatique. Seul le bouton « Régénérer » remplace le texte, comme aujourd'hui pour le descriptif.
- Le bloc Domaine de la fiche vin garde un aperçu court et un lien « Voir le domaine ».

## 3. Caractéristiques de chaque vin : tanin et arômes

**Ce que veut Franck.** Pouvoir filtrer sur le goût : « boisé », « noisette », etc.

- Nouveaux champs par vin :
  - **tanin** : léger, moyen, puissant, ou rien (inapplicable ou inconnu, ce qui est la règle pour la plupart des blancs et des pétillants) ;
  - **arômes** : zéro à cinq étiquettes, prises dans une **liste fermée** d'une vingtaine d'arômes courants ;
  - **pays** : France ou autre, pour la carte (voir §5).
- **Mon choix pour la liste d'arômes** (à ajuster par le constructeur si besoin, mais elle doit rester fermée et en français) : fruits rouges, fruits noirs, agrumes, fruits blancs, fruits exotiques, fruits secs, noisette, floral, épicé, poivré, vanille, boisé, toasté, beurré, miel, minéral, végétal, sous-bois, cuir, réglisse.
- L'IA estime ces champs pour chaque vin. Le circuit de génération par lots (`GenerationBatchProcessor`) est réutilisé, et la réponse est contrainte à la liste.
- **Mon choix pour la génération :** un nouveau vin est traité dès sa création. Les vins déjà en cave sont rattrapés en tâche de fond, par petits lots, en respectant les quotas. Aucun écran n'attend ce traitement.
- **Correction** par le propriétaire de la cave, sur la fiche vin : choix du tanin, et étiquettes d'arômes à cocher dans la liste. Une correction manuelle n'est jamais écrasée par l'IA.
- Si l'IA échoue, le vin reste simplement sans tanin ni arôme. Aucune alerte, rien de bloquant (règle de la maison : une analyse qui échoue ne bloque jamais).

## 4. Filtres de la cave

**Ce que veut Franck**, dans cet ordre exact :

1. recherche ;
2. couleur ;
3. arômes ;
4. millésime ;
5. tanin ;
6. emplacement ;
7. à boire en priorité ;
8. sans apogée ;
9. vins épuisés ;
10. plat.

- **Arômes** : choix d'un ou plusieurs arômes de la liste. **Mon choix :** quand plusieurs arômes sont cochés, un vin doit les avoir tous (« boisé + noisette »).
- **Millésime** : une plage d'années, de… à…. Les bornes sont facultatives.
- **Tanin** : léger, moyen, puissant.
- Le filtre « plat » reste, déplacé en dernier.
- Style : les mêmes pastilles qu'aujourd'hui. Sur téléphone, la rangée peut défiler horizontalement ou passer à la ligne, mais elle ne doit pas élargir la page.
- **Filtre région (pas de pastille).** Il s'active uniquement depuis la carte de l'accueil. Une fois actif, il s'affiche comme une pastille qu'on peut retirer.

## 5. Carte de France sur l'accueil

**Ce que veut Franck.** Une vraie carte simplifiée de la France (maquette A choisie), avec une case « Hors de France ».

- **Emplacement.** Sur l'accueil, sous « Rentrer du vin / Sortir une bouteille ». Elle apparaît pour le propriétaire comme pour un membre, puisque c'est une vue en lecture.
- **Dessin.** Contour de la France et les douze régions viticoles du référentiel, en SVG intégré, dessiné à la main de façon simplifiée et sans bibliothèque de cartographie. Les régions n'ont pas besoin d'être exactes, seulement reconnaissables.
- **Échelle de couleur.** Chaque région est colorée selon le nombre de bouteilles en stock (dégradé bordeaux, du plus clair au plus foncé), avec le nombre écrit sur la région ou à côté. Une petite légende accompagne la carte.
- **Total.** Le titre de la carte donne le total des bouteilles.
- **Case « Hors de France ».** À côté de la carte, elle compte les bouteilles dont le pays n'est pas la France (voir §3), et se touche comme une région. **Mon choix :** les vins français sans région reconnue ne sont ni sur la carte ni dans cette case. Ils sont comptés dans une mention discrète « dont N sans région ».
- **Toucher une région** (ou la case) ouvre un volet en bas (`BottomSheet` existant) avec :
  - le nom de la région et son total ;
  - ses domaines avec leur nombre de bouteilles, chacun menant à sa page Domaine ;
  - un lien « Voir ces N vins dans la cave », vers la cave filtrée sur cette région.
- **Petites régions.** Les petites régions (Alsace, Jura, Savoie, Beaujolais) doivent rester faciles à toucher au doigt : zone tactile plus grande que le dessin si nécessaire.
- **Accessibilité.** Chaque région est atteignable au clavier, avec un nom accessible du type « Bourgogne, 21 bouteilles ».
- **Cave vide.** Une carte toute claire avec « Aucune bouteille pour l'instant ».

## Objectifs, non-objectifs, à éviter

- **Objectifs.** Les cinq évolutions ci-dessus, dans le style actuel de l'application, en PWA mobile d'abord.
- **Non-objectifs :**
  - pas de questions libres à l'IA sur un vin (« et avec un curry ? ») ;
  - pas de catégories de plats ;
  - pas de carte mondiale ni de détail par appellation sur la carte ;
  - pas d'alerte hors de l'application.
- **À éviter :**
  - un appel Gemini déclenché à chaque affichage d'écran ;
  - un modèle Pro ;
  - des arômes en texte libre, qui rendraient le filtre inutile ;
  - une correction manuelle écrasée par l'IA ;
  - un écran bloqué en attendant l'IA.

## Contraintes

- Stack existante : NestJS, Prisma, PostgreSQL, BullMQ, React/Vite. Pas de nouvelle dépendance pour la carte.
- Migrations additives uniquement : la production garde ses volumes et ses données.
- Isolation entre caves. Le filtre région, les arômes et le tanin se lisent dans la cave courante. Le domaine est partagé, mais la liste de ses vins se limite à la cave courante.
- Tout en français : textes, README, CHANGELOG, guide (`docs/guide-detaille.md`, section « Passage à … »).
- Travail directement sur `main`, commits `djkix` noreply. Pas de données personnelles dans le dépôt.

## Laissé au constructeur

- Le découpage en versions et l'ordre de livraison.
- Le schéma exact des nouvelles colonnes et des routes d'API.
- Les invites Gemini.
- Le dessin SVG des régions.
- Le détail visuel des cartes de plats et du volet.

## Décisions complémentaires (après relecture)

Ce sont les choix du concepteur. Franck ne les a pas tranchés lui-même.

1. **Pays.**
   - Il est déduit d'abord de l'appellation : une appellation reconnue dans le référentiel signifie la France. L'IA ne le donne que pour les vins sans appellation reconnue.
   - Un vin pas encore traité a un pays inconnu. Sur la carte, il compte dans la mention discrète, renommée « dont N sans région ».
   - Le propriétaire peut corriger le pays sur la fiche vin, comme le tanin et les arômes.
2. **Suivi du traitement.**
   - Le vin porte un état de caractérisation (en attente, fait, échec), sur le modèle de `Pairing`. Le rattrapage ne repasse que sur les vins en attente ; un échec est retenté selon les règles existantes des lots.
   - Tanin, arômes et pays ont chacun leur marque de correction manuelle. Mettre le tanin à « rien » à la main compte comme une correction : l'IA ne l'écrasera plus.
3. **Domaine.**
   - La première ouverture de la page d'un domaine sans fiche (ou avec une fiche à l'ancien format) met une génération en file, une seule fois. Ce n'est pas un appel à chaque affichage.
   - Pendant ce temps, la page affiche « Fiche du domaine en préparation », pour l'administrateur comme pour un membre.
   - Les domaines existants reçoivent les quatre nouveaux champs par le même rattrapage en tâche de fond.
4. **Champs du domaine.**
   - Cinq nouvelles colonnes. « Histoire » est initialisée avec l'ancien `description`, qui n'est plus affiché ensuite.
   - Chaque champ a sa marque de correction manuelle. La génération automatique ne remplit que les champs non corrigés.
   - Le bouton « Régénérer » de l'administrateur est une action explicite : il refait les cinq champs, corrections comprises, comme aujourd'hui.
5. **Filtres venant de la carte.**
   - Valeurs possibles : une région du référentiel, ou « Hors de France ».
   - Le lien « Voir ces N vins » ouvre la cave avec ce filtre et les vins épuisés masqués, ce qui correspond au compte de bouteilles en stock affiché sur la carte.
6. **« J'ai un vin », vin sans accords générés.** L'écran affiche « Pas encore d'accords pour ce vin » avec un lien vers la fiche. Il ne lance aucune génération.
7. **Millésime.** Dès qu'une borne est posée, les vins non millésimés sont exclus.
8. **Vins d'un domaine.** On les cherche par la clé normalisée du producteur, dans la cave courante, comme le fait déjà `producer-wines.ts`. Il n'y a pas de rapprochement de plus entre orthographes différentes.
