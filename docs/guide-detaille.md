# Ma Cave — guide détaillé

Ce guide reprend le détail retiré du [README](../README.md) : description
complète des fonctionnalités, déploiement pas à pas, passages de version et
limites. Le README reste le point d'entrée.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture et ports](#architecture-et-ports)
- [Déploiement](#déploiement)
- [Passages de version](#passages-de-version)
- [Notes de développement](#notes-de-développement)
- [Limites](#limites)

## Fonctionnalités

**Une cave par compte.** Chaque compte a sa propre cave, dont il est le
**propriétaire** : ses vins, ses photos, ses mouvements et ses exports ne sont
visibles que de lui et des membres qu'il invite. Une adresse Google inconnue
qui se connecte ne voit rien tant qu'un administrateur n'a pas validé son
inscription : l'écran affiche « Inscription en attente de validation —
revenez plus tard : l’accès s’ouvrira dès qu’un administrateur l’aura
validée. » (aucun e-mail n'est envoyé, il suffit de revenir). La validation crée sa cave,
« Cave de {nom affiché ou e-mail} ». Une adresse invitée par un propriétaire,
elle, entre directement, sans validation. Un identifiant (vin, photo,
mouvement, membre) d'une autre cave répond comme un identifiant inconnu (404),
et une cave à laquelle le compte n'a pas accès répond « Cave introuvable ».

**Ma cave.** Depuis l'accueil (lien *Ma cave › Réglages*) ou la carte *Ma cave* de
*Réglages*, la page `/ma-cave` (propriétaire seulement ; l'ancienne adresse
`/membres` y mène) regroupe, dans cet ordre, le **nom de la cave**, ses
**plans** (menu ⋯ : *Renommer*, *Remplacer la photo*, *Supprimer le plan*), ses
**zones** (*Modifier* ouvre une feuille en bas d'écran), ses **membres** et la
**sauvegarde Excel** de la cave.

**Zones de la cave.** Une zone est un endroit de la cave où l'on range des
bouteilles (« Cave 1 », « Garage »). Dans *Ma cave*, le propriétaire en ajoute
(*Ajouter une zone*), les range dans l'ordre voulu avec ↑ et ↓, les modifie
(*Modifier*, dans une feuille en bas d'écran) et les supprime (*Supprimer*, après confirmation).
Chaque zone a :

- un **nom**, de 1 à 40 caractères, unique dans la cave sans tenir compte de la
  casse (« Une zone porte déjà ce nom ») ;
- une **indication** facultative, 300 caractères au plus (« à gauche en
  entrant, au fond derrière l'escalier ») ;
- une **photo** facultative, prise au téléphone (15 Mo au plus, réduite à
  1600 px, en JPEG ; *Retirer la photo* l'enlève).

Renommer une zone change son nom partout : fiche, journal, filtre de la cave,
« À boire prochainement » et export. Supprimer une zone (« Supprimer la zone
Garage ? Les bouteilles qui y sont rangées restent en stock, sans
emplacement. ») est possible même si des bouteilles y sont rangées : elles
restent en stock et passent sans zone, au même casier et à la même position
(« Sans emplacement » si elles n'en avaient pas), par un déplacement visible
dans le journal et annulable comme les autres. Une zone qui a servi dans
l'historique est **archivée** : elle disparaît de la liste et du choix de la
zone, et l'historique garde son libellé ; une zone jamais utilisée est
supprimée (*Ma cave* affiche « Zone supprimée », « Zone archivée (elle reste
dans l'historique) » ou « Zone archivée : 12 bouteilles sans emplacement »).
Si des bouteilles reviennent ensuite dans une zone archivée (annulation d'une
sortie ou d'un de ces déplacements, inventaire en hausse à cet emplacement),
la zone est rétablie en fin de liste ; si son nom a été repris par une autre
zone, c'est refusé : « Cette zone a été supprimée ; rangez ces bouteilles
ailleurs ». Un membre en lecture seule voit les zones, leurs indications et
leurs photos, sans pouvoir les changer. API : `GET`, `POST
/api/caves/current/zones`, `PATCH`, `DELETE /api/caves/current/zones/:id`
(réponse `{ archived, unplaced }`, `unplaced` : bouteilles sorties de la
zone), `POST /api/caves/current/zones/order` (`{ ids }` : nouvel ordre), `PUT`, `DELETE
/api/caves/current/zones/:id/photo` et `GET /api/caves/zones/:id/photo`
(toute cave du compte).

**Plans de la cave.** Jusqu'à **20 plans** par cave, chacun avec son nom : une
photo de la pièce, un schéma dessiné à la main, un étage, un cellier. Dans *Ma
cave*, la carte *Plans de la cave* (avant *Zones*) montre un onglet par
plan et *+ Ajouter un plan* : on donne le *Nom du plan* (40 caractères au plus,
unique dans la cave sans tenir compte de la casse) et sa photo avec *Choisir
une photo*, dans l'ordre qu'on veut (le nom du fichier s'affiche), puis *Créer
le plan*. La photo est réduite à 2400 px par l'appareil avant l'envoi (15 Mo
au plus, redressée selon l'EXIF, ramenée à 2400 px sur le grand côté, en
JPEG) ; le téléphone propose de prendre une photo ou d'en choisir une dans la
galerie, l'ordinateur un fichier. Les photos des zones se choisissent avec le
même bouton. Dans le menu ⋯ du plan :
*Renommer*, *Remplacer la photo* (les repères restent à leur place) et
*Supprimer le plan* (après confirmation). Sans plan, la carte explique :
« Photographiez la pièce ou un schéma dessiné à la main, puis placez vos zones
dessus. ». **Avec un plan, une zone se crée depuis le plan** : le propriétaire
touche l'endroit (ou Entrée au clavier), un « + » y apparaît, il tape le *Nom de
l'endroit* puis *Enregistrer* : la zone est créée avec son repère numéroté sur ce
plan. Les zones existantes encore sans repère sont proposées en raccourci sous
le champ (« ou choisir une zone existante »). La carte *Zones* ne propose plus
d'ajout tant qu'il y a un plan (« Pour ajouter une zone, touchez un plan
ci-dessus à son endroit. ») ; elle sert à compléter les zones (indication,
photo, ordre, archive). Sans plan, on ajoute les zones dans la carte *Zones*
comme avant. Toucher un repère montre sa zone (nom, indication), avec
*Déplacer* (puis toucher le nouvel endroit, sur ce plan ; pour changer de plan,
*Retirer le repère* puis poser la zone depuis l'autre onglet) et *Retirer le repère*. Une zone a au plus un repère, donc sur **un seul plan** ;
les repères sont **numérotés par plan, dans l'ordre d'affichage des zones** (1,
2, 3… parmi les zones repérées sur ce plan : changer l'ordre des zones change
les numéros), et une zone archivée n'apparaît jamais sur un plan (son repère
reste en base). **Supprimer un plan garde les zones et leurs bouteilles** : seuls
ses repères disparaissent (la confirmation le dit), et ces zones redeviennent
des raccourcis « zones sans repère » à placer sur un autre plan. Poser un repère
sur un plan inexistant ou d'une autre cave est refusé. Le plan se retrouve sur
la **fiche du vin** (toucher un emplacement montre, sous l'indication et la
photo de sa zone, le plan de la zone avec son repère mis en avant et, en légende,
le nom du plan) et dans **« À boire prochainement »** (un petit plan sous chaque
en-tête d'une zone placée, avec son nom en légende, qui s'agrandit au toucher).
Un membre en lecture seule voit les plans et les repères depuis la fiche et À
boire (*Ma cave* est réservée au propriétaire), sans rien pouvoir
changer. API : `GET /api/caves/current/plans` (`{ plans: [{ id, name, width,
height, updatedAt }], markers: [{ zoneId, planId, name, number, x, y }] }`, les
plans par ordre de création), `POST /api/caves/current/plans` (`{ name }` ;
« 20 plans au plus par cave » au-delà, « Un plan porte déjà ce nom » si le nom est pris), `PATCH` (`{ name }`) et
`DELETE /api/caves/current/plans/:id`, `PUT /api/caves/current/plans/:id/image`
(champ `file`), `GET /api/caves/plans/:planId/image` (toute cave du compte), `PUT
/api/caves/current/zones/:id/marker` (`{ planId, x, y }`, fractions de la largeur
et de la hauteur entre 0 et 1, sinon « Position invalide sur le plan ») et
`DELETE` ; chaque zone porte `marker: { planId, x, y } | null`.

**Propositions de zones à partir de la photo du plan** (2.16.0). À chaque plan
créé ou photo remplacée, l'application fait analyser la photo par Gemini en
arrière-plan, sans jamais bloquer : l'IA détecte les blocs de rangement (casier,
étagère) avec leur cadre et leur nombre de lignes et de colonnes. Sous le plan,
*Analyse du plan en cours…* tant que l'analyse tourne (l'écran se relit toutes
les 10 s), puis, si elle a échoué, « Les zones n’ont pas pu être proposées.
Placez-les à la main. » (les plans existants ne sont pas analysés). Quand des
zones sont proposées, leurs cadres apparaissent **en pointillés** sur le plan,
avec une étiquette « Casier A · 48 cases » (nombre de cases repérées sur la
photo ; lignes × colonnes pour une proposition d'avant), et une ligne au-dessus du plan
annonce « 3 zones proposées : touchez-les pour les accepter. ». Toucher un cadre
ouvre la feuille **Proposition** : *Nom* (prérempli : « Casier A », « Étagère B »,
« Rangement C »… de gauche à droite, en sautant les lettres déjà prises),
*Lignes* et *Colonnes* (préremplis), *Lettre des cases* (voir plus bas), aperçu « Cases C1 à C48 », ce que l'IA a
vu (« 48 cases repérées sur la photo · grille proposée : 4 rangées × 12
colonnes »), puis *Accepter*
(crée la zone avec son repère au centre du cadre et sa grille ; **les positions
des cases restent alors sur le plan**, dessinées en points avec leur nom) ou *Rejeter*
(retire la proposition). Tant que la feuille est ouverte, chaque case repérée
est dessinée sur le plan : cadre fin, **point au centre et nom de la case**
(« C15 », le nom même qu'on choisira en rangeant une bouteille dans la zone
acceptée ; nom masqué quand la case fait moins de 24 px de large, point seul).
La feuille reprend ce plan, recadré sur la proposition (cases aussi grandes que
possible), et la liste « Noms des cases » de la grille saisie (un champ par
case, le code en placeholder) : toucher un point met le focus sur le champ de
sa case, le point affiche ensuite le nom donné, et les noms partent avec
*Accepter* (voir « Noms des cases » ci-dessous). Le propriétaire seul accepte ou rejette ; un nom déjà
pris est refusé (« Une zone porte déjà ce nom »). Les cases se numérotent **par casier,
rangée par rangée** : avec la lettre C et 12 colonnes, C1 en haut à gauche, C12 au
bout de la première rangée, C13 au début de la deuxième, jusqu'à C48
(1 à 26 lignes, 1 à 30 colonnes ; les codes sont calculés, seules les positions
sur le plan sont stockées, colonne `cell_boxes`).
Au démarrage du worker, les analyses restées en attente sont **remises en file**.

**Grille d'une zone.** *Modifier la zone* (carte *Zones*) propose *Lignes* et
*Colonnes* (vides = pas de grille) et *Lettre des cases* avec l'aperçu des cases.
La lettre (A à Z) est choisie automatiquement (la lettre finale du nom, « Casier C »
→ C, sinon la première libre) ; deux zones actives d'une même cave ne la partagent
pas (« Cette lettre est déjà prise par une autre zone »). La changer renomme les
noms, positions et emplacements de la zone (C15 devient F15) ; retirer la grille
efface la lettre, les noms et les positions. Une zone à grille d'avant la 2.27.0
n'a pas de lettre et se lit avec « A ». **Ranger une
bouteille** dans une zone qui a une grille (entrée, *Déplacer*, emplacements de
la fiche vin) : sous le champ *Casier*, une grille de cases à toucher (48 px
minimum, défilement horizontal si elle est large) ; une case occupée affiche le
nombre de bouteilles qu'elle contient, la case choisie est mise en avant et
remplit *Casier*, dont la liste de suggestions propose aussi les cases. La saisie
libre reste possible ; une zone sans grille ne change pas.

**Vignette de la fiche vin.** Pour une bouteille rangée dans une zone placée sur
un plan, la fiche vin montre le plan **recadré sur la zone** (sur ses cases, ou
autour du repère quand elle n'en a pas), avec la case de la bouteille en évidence
et une légende donnant l'endroit. Zone sans repère : pas de vignette. Toucher la
vignette affiche le plan entier.

**Ajuster les cases sur le plan.** L'analyse peut mal placer une case ou en
oublier. *Modifier la zone* d'une zone qui a une grille, une lettre et un repère
propose *Ajuster les cases sur le plan* (propriétaire seulement) : la feuille montre
le plan du repère, recadré sur les cases comme la vignette (entier si aucune n'a
encore de position) ; *Voir tout le plan* enlève le recadrage, pour poser une case
hors du cadre (casier décalé, case oubliée au bord). Recadré, une case reste dans
le cadre. **Toucher une case la choisit** (mise en évidence, nom
annoncé), **toucher ensuite le plan y déplace son centre**, sa taille gardée ;
toucher une autre case change le choix. La liste *Cases sans position* donne les
cases de la grille absentes du plan : en choisir une puis toucher le plan la pose,
à la taille moyenne des cases placées (4 % × 4 % de l'image s'il n'y en a aucune).
Une case reste toujours dans l'image. Au clavier, chaque case est un bouton
(« Case C17 », « Case Champagnes (C15) ») : flèches pour déplacer la case choisie
(2 %, Maj 10 %), Échap pour la désélectionner, Entrée sur le plan pour poser une
case sans position au centre de la vue. *Enregistrer* envoie toutes les positions
d'un coup (« Positions des cases enregistrées. »), *Annuler* revient à *Modifier
la zone* sans rien changer ; fermer la feuille (Échap, toucher le fond) avec des
positions non enregistrées demande confirmation. Le plan et la vignette de la fiche vin suivent. Côté
api, `PATCH /api/caves/current/zones/:id` accepte `cellBoxes`
(`{ code: [x0, y0, x1, y1] }` en fractions de l'image, x0 < x1, y0 < y1), qui
remplace toutes les positions : code hors de la grille, « Case inconnue dans cette
zone » ; cadre invalide, « Positions des cases invalides » ; zone sans grille ou
sans repère, 400 explicite. Avec une grille ou une lettre changée dans la même
requête, les positions envoyées désignent les cases du résultat (comme
`cellNames`). Ni glisser-déposer, ni redimensionnement, ni suppression d'une position.

**Noms des cases.** Chaque case garde son code (C1, C15…), qui reste la valeur
enregistrée dans *Casier* ; on peut lui donner en plus un nom libre
(« Champagnes », 40 caractères au plus), simple libellé d'affichage qui ne
déplace aucune bouteille. Les noms se donnent dans la feuille *Proposition*
(liste des cases, sous le plan recadré), dans *Modifier la zone* (section « Noms des cases » : un
champ facultatif par case, le code en placeholder) ou sous la grille de
rangement (*Renommer les cases*, propriétaire seulement). Partout, un
emplacement s'affiche alors **« Nom (code) »** : « Cave / Champagnes (C15) / 2 »
sur la fiche vin, *À boire*, le journal, « D'où sort-elle ? » et l'export Excel
(sans nom : « C15 »). La grille de rangement montre le nom et le petit code ;
*Casier* propose noms et codes, et **saisir le nom** (casse ignorée) range dans
la case : l'api enregistre le code, « Champagnes » et « C15 » sont donc le même
emplacement. Des bouteilles rangées plus tôt sous un casier libre « Champagnes »
(avant que la case porte ce nom) restent un emplacement à part : *Déplacer* les
regroupe dans la case. Règles : un nom vide retire le nom ; deux cases d'une même zone ne
portent pas le même nom (casse ignorée), ni un nom égal au code d'une autre case
(« Ce nom est déjà pris dans cette zone ») ; une case hors de la grille est
refusée (« Case inconnue dans cette zone ») ; réduire la grille supprime les
noms des cases disparues. API : `cellNames` (`{ "C15": "Champagnes" }`) dans
chaque zone, accepté (remplacement complet) par `PATCH
/api/caves/current/zones/:id` et par `POST
/api/caves/current/plans/:id/suggestions/:sid/accept`.

Dans *Coûts de l’IA*,
le nouvel usage s'affiche sous « Analyse du plan » (barres, légende, détail).
API : `GET /api/caves/current/plans` renvoie en plus, par plan, `analysis`
(`NONE`, `PENDING`, `DONE`, `FAILED`) et `suggestions` (`{ id, kind, name, box,
rows, cols }`, `box` en fractions de l'image) ; `POST
/api/caves/current/plans/:id/suggestions/:sid/accept` (`{ name, rows, cols }`,
201 avec la zone) et `DELETE /api/caves/current/plans/:id/suggestions/:sid`
(204) ; « Proposition introuvable » (404) si elle n'existe plus ; `PATCH
/api/caves/current/zones/:id` accepte `grid: { rows, cols } | null` ; `GET
/api/caves/current/zones/:id/cells` renvoie `[{ casier, quantity }]` (stock
supérieur à 0 par case) ; chaque zone porte `grid: { rows, cols } | null`.

**État détaillé et relance de l'analyse (2.17.0).** Dans *Ma cave › Plans*, un
**bandeau d'analyse** (au-dessus de l'image du plan affiché) remplace les lignes
grises *Analyse du plan en cours…* et « Les zones n’ont pas pu être
proposées. Placez-les à la main. ». En cours : titre « Analyse du plan en
cours », icône qui tourne (immobile sous *réduire les animations*), puis
l'avancement : « Envoyée à l’IA il y a 20 s · résultat attendu d’ici une
minute » (mise à jour chaque seconde, puis chaque minute ; au-delà de 3 min,
« plus long que prévu, l’analyse continue »), « En attente : Gemini est en
pause jusqu’à 15:40. Nouvel essai à 15:41. », le texte d'une limite de débit
atteinte (« Limite de 5 requêtes par minute atteinte : reprise à 14:03. », voir
*Limites de débit Gemini*), « En attente : budget de l’IA
atteint ce mois-ci. Nouvel essai le 1 nov. à 00:05. » ou « Nouvel essai à
10:52 (tentative 2 sur 10). ». En échec : bandeau rouge « Les zones n’ont pas
pu être proposées », la raison (l’IA n’a pas répondu, budget épuisé, photo
introuvable à remplacer, photo illisible, autre erreur), le bouton **Relancer
l’analyse** (sauf photo introuvable ; un refus, comme « Une analyse est déjà en
cours », s'affiche dans le bandeau) et « Vous pouvez aussi placer les zones à
la main. ». Si l'analyse se termine écran ouvert, un bandeau de succès annonce
« 3 zones proposées : touchez-les sur le plan pour les accepter. » (ou « Aucune
zone détectée sur cette photo. Placez-les à la main. ») jusqu'à la prochaine
action. Un plan jamais analysé (d'avant la 2.16.0) propose le lien **Proposer
des zones**, qui lance l'analyse. L'onglet d'un plan en cours d'analyse porte un
point animé (« Cellier, analyse en cours » pour un lecteur d'écran) et, dans
*Réglages*, la carte *Ma cave* résume « Analyse du plan en cours ». Chaque plan de `GET
/api/caves/current/plans` porte aussi `analysisInfo` : `null` pour `NONE` et
`DONE` ; pour `PENDING`, `{ since, attempt, maxAttempts, nextAttemptAt,
waiting, pauseUntil }`, lu sur la tâche BullMQ (`since` = date de la demande
d'analyse : envoi, remplacement ou relance ;
`attempt` = tentatives déjà faites + 1 ; `waiting` : `QUEUED` en file ou tâche
introuvable, `RUNNING` en cours, et pour une tâche en attente de reprise la
cause du dernier report, enregistrée sur la tâche par le worker :
`GEMINI_PAUSE` avec la fin de la pause dans `pauseUntil`, `QUOTA` avec l'heure
de reprise dans `pauseUntil`, la limite atteinte dans `quotaKind` (`MINUTE`,
`TOKENS`, `JOUR`, ou `GOOGLE` pour un 429 de Google) et le texte à afficher dans
`message`, calculé à la lecture, `BUDGET` ou `RETRY`
avec l'heure de reprise dans `nextAttemptAt`). Redis injoignable ou lent (plus
d'une seconde) : valeur de repli `QUEUED`, première tentative, jamais d'erreur.
Pour `FAILED` : `{ since, failedReason }`, raison enregistrée à l'échec
(`GEMINI` Gemini indisponible : quota, saturation, pause, réseau ; `REFUS`
demande refusée par Gemini, tout statut 4xx hors 429 ; `BUDGET` budget dépassé, `IMAGE` image
absente, `ILLISIBLE` réponse inexploitable, `ERREUR` autre). `POST
/api/caves/current/plans/:id/analysis` (propriétaire) relance l'analyse de la
photo actuelle : 202 avec le plan (en attente, propositions effacées, nouvelle
tâche), 409 « Une analyse est déjà en cours » si elle l'est, 404 « Plan
introuvable » pour un plan d'une autre cave. L'image et sa date ne changent
pas : c'est la date de la demande d'analyse (`analysis_requested_at`, posée à
l'envoi, au remplacement et à la relance) qui identifie la tâche et garantit
qu'une ancienne analyse n'écrase jamais une nouvelle.

**Détection case par case, regroupée par meuble.** L'analyse ne demande plus à
Gemini un cadre et un nombre de lignes et de colonnes par bloc (il fusionnait
des meubles accolés et comptait mal les cases) : il repère **chaque case**
(compartiment délimité par des montants et des tablettes, même vide) avec son
cadre serré, puis **regroupe les cases par meuble physique** (séparé des autres
par un double montant, un espace, une hauteur de tablettes ou une structure
différente ; deux meubles accolés ne sont jamais fusionnés). Il ignore les
meubles coupés par le bord de la photo (moins d'environ 70 % visible), les
objets posés devant ou dans les cases (sac, seau…), les murs, le plafond et le
sol. Au plus 12 meubles, 200 cases par meuble. La réponse est demandée en JSON
**sans schéma imposé** : Google refusait le schéma imbriqué (meubles puis
cases) avec un « 400 Bad Request » ; la forme attendue et un petit exemple sont
donnés dans la consigne, une réponse entourée de balises ```` ```json ```` ou de
texte est lue quand même, et une réponse sans objet JSON finit en « photo
illisible ». Un refus de Gemini (400, 403, 404…, hors 429) s'affiche « L’IA a
refusé la demande. Réessayez, ou choisissez un autre modèle dans
l’Administration. », avec *Relancer l’analyse*. Le serveur reconstruit ensuite
chaque proposition : cadre = union des cases, lignes et colonnes comptées
**par voisinage**, et non sur des coordonnées communes à tout le meuble (un mur
pris de biais, dont une même tablette descend de plus d'une case d'un bout à
l'autre, donnait 260 cases pour 48). Chaque case est reliée à sa voisine de
droite (chevauchement vertical d'au moins la moitié de la moins haute des deux)
et à celle du dessous (idem en largeur), une seule précédente par case (la plus
proche, puis la mieux alignée, la garde) ; les rangées sont les suites de cases
reliées de gauche à droite, les colonnes celles reliées de haut en bas, rangées
ordonnées par ces liens (une rangée vient avant celle de ses voisines du
dessous), pas par leur hauteur moyenne. Une case oubliée par l'IA ne coupe pas
sa rangée (la voisine suivante est cherchée jusqu'à deux cases plus loin) ni ne
décale les noms des autres. Quand une case large relie deux colonnes (ou que
des cadres trop bruités coupent des rangées), le compte de cet axe passe au plus
grand nombre de cases empilées (rangées) ou côte à côte (colonnes), et les cases
y sont numérotées par leur rang dans une rangée (ou colonne) complète, sans nom
ailleurs. Une case haute de deux rangées prend le nom de celle du haut. Chaque proposition garde aussi `cellCount` (cases
valides repérées) et `cells` (200 au plus) : cadre de chaque case, sa rangée et
sa colonne, et son numéro dans la grille (1 en haut à gauche, rangée par rangée) ; une case dont
la rangée ou la colonne reste indéterminée garde son cadre, sans nom. Un meuble
de moins de deux cases est ignoré. Le reste (nommage « Casier A », états, garde par date de demande) ne
change pas. L'analyse des plans emploie le modèle choisi dans l'Administration
(voir *Modèle de l'IA*), comme tous les autres usages. **Relancer l’analyse** est
aussi dans le menu ⋯ du plan, même après une analyse réussie (désactivé pendant
une analyse en cours) ; s'il reste des propositions en attente, une
confirmation prévient : « Relancer l’analyse ? Les propositions en attente
seront remplacées. ». Les zones déjà acceptées ne bougent pas. Côté api, `POST
/api/caves/current/plans/:id/analysis` accepte un plan `NONE`, `FAILED` ou
`DONE` ; seul `PENDING` répond 409.

**Membres en lecture seule.** Dans *Ma cave* (propriétaire seulement), la
section *Membres* liste les membres, invite une adresse Google (« Cette
adresse est déjà membre » si elle l'est déjà), retire un membre (jamais le
propriétaire) et renomme la cave (1 à 80 caractères). Un membre voit la cave
qui l'a invité : la liste et ses filtres, la recherche par plat, la fiche vin
(apogée, note, accords, descriptif du domaine, **emplacements**) et les
statistiques. Il voit les emplacements (section de la fiche, filtre de la
cave), mais pas la cote : il ne voit **aucun prix d'achat ni aucune
cote** — les champs sont absents des réponses de l'API, pas seulement
masqués : ni valeur au prix d'achat ou à la cote, ni classement « les plus
chères » ou « valeur à la cote » dans les statistiques —, ni le journal, ni
l'export Excel, ni « À confirmer », et il **n'écrit rien** : pas d'entrée, de
sortie, d'inventaire, de photo, de note, d'apogée manuelle, de recherche
d'image, de déplacement d'emplacement, de saisie de cote ni de régénération
des accords (l'API répond 403 « Lecture seule »). Son application n'affiche
que les onglets *Cave* et *Stats*, sans boutons d'action sur la fiche. Les
images des photos lui sont servies pour toutes les caves dont il est membre.

**Sélecteur de cave.** Un compte qui a accès à plusieurs caves (la sienne et
celles où il est invité) choisit la cave courante dans l'en-tête ; une cave
en lecture seule se reconnaît à son menu (« <nom> · Lecture seule »), et un
badge « Lecture seule » rappelle le rôle courant ; le membre invité est
désigné « Lecture seule » partout dans l'application. Le choix est gardé dans la session ; par
défaut, c'est la cave dont le compte est propriétaire, sinon sa plus ancienne
invitation. Un compte actif qui n'a aucune cave (ni la sienne, ni une
invitation) voit « Vous n’avez pas encore de cave. Un administrateur peut
vous en créer une, ou un propriétaire peut vous inviter. »

**Entrée de stock par photo, en rafale.** Bouton *Rentrer*, un grand bouton photo
et un compteur « N photos prises » : on enchaîne photo après photo, sans
attendre ni confirmer une fiche entre deux prises. Chaque photo est réduite sur
le téléphone (côté le plus long 1 600 px, JPEG qualité 0,8 ; si la réduction
échoue, la photo part telle quelle), rangée dans une file locale, et l'écran est
aussitôt prêt pour la suivante. La file locale accepte jusqu'à 200 photos (ou
200 Mo) ; un envoyeur unique les envoie une par une en arrière-plan, relancé
après chaque prise, au retour du réseau, au retour au premier plan et toutes
les 15 s tant que la file n'est pas vide, quelle que soit la page ouverte
(il est porté une seule fois, à la racine des pages protégées) — il ne
fonctionne que tant que l'application est ouverte. Sur le serveur, un travail planifié passe toutes les
15 s et analyse les photos d'entrée par lots : jusqu'à 8 photos en un seul
appel Gemini (un lot part dès 8 photos en attente, ou dès que la plus ancienne
patiente depuis 45 s), pour limiter le coût par photo ; une photo seule part
en appel simple, au coût de cet appel. Le résultat arrive donc
en général en 15 s à 1 min plutôt qu'immédiatement. Si la réponse du lot est
incohérente (nombre ou ordre des fiches mélangé), chaque photo du lot est relue
seule, sans attribution croisée.

Les fiches lues rejoignent la liste **« À confirmer »** (lien sur l'accueil,
avec un badge « N vins à confirmer »), en trois sections : *À valider* (fiche
pré-remplie — domaine, cuvée, appellation, millésime, couleur, format — avec un
indicateur de confiance par champ, quantité lue sur le carton sinon 1 et
modifiable ; *Valider* fiche par fiche ou *Tout valider* d'un coup ; *Mettre
de côté* sort la fiche de *Tout valider* pour la visite en cours seulement —
elle reste à confirmer et revient à la prochaine ouverture ; *Écarter* retire
définitivement la photo sans créer de mouvement, après confirmation « Écarter
cette photo ? Elle ne sera plus proposée. »), *En cours d'analyse* (photos pas
encore lues, avec le motif d'un report éventuel) et *Lecture impossible*
(photos en échec, avec *Saisir à la main* vers l'écran de confirmation unitaire
et *Écarter*). La liste se rafraîchit toutes les 10 s. Rien n'est jamais écrit
en stock avant une validation explicite. Les anciennes URL du mode campagne
(`/entree/campagne` et `/entree/campagne/revue`) redirigent respectivement vers
la rafale et vers « À confirmer » ; le mode campagne lui-même a disparu,
fusionné dans ce parcours. Côté API : `GET /api/photos/entry-inbox` (les trois
sections) et `POST /api/photos/:id/dismiss` (écarter une photo).

**La cave et la sortie.** L'onglet *Cave* liste les vins en stock avec
vignette (photo de l'entrée, ou un pictogramme de bouteille s'il n'y a pas de
photo ou qu'elle ne charge pas), domaine, cuvée, appellation, millésime,
couleur et quantité ; la recherche porte sur domaine/cuvée/appellation sans
tenir compte des accents ni de la casse (« chateauneuf » trouve
« Châteauneuf-du-Pape »), un filtre par couleur s'ajoute, et les vins épuisés
restent masqués sauf à cocher « Vins épuisés ». La fiche vin affiche, dans
l'ordre : la photo de référence (celle de la première entrée) avec le stock et,
en bas à droite, une icône d'emplacement (elle ouvre une fenêtre avec la photo
de la zone, son indication et le plan) ; le descriptif du domaine ; les accords
mets-vins ; puis l'apogée, la note, la cote, les emplacements et les 10
derniers mouvements ; *Sortir* propose un sélecteur de quantité borné par le stock puis
confirme « Sorti — il en reste N » (le message survit au rafraîchissement du
stock, y compris pour la dernière bouteille) ; *Corriger le stock* permet un
inventaire physique — le nombre compté, l'écart annoncé avant d'enregistrer
(« −2 bouteilles », « Stock déjà juste »), écrit comme un mouvement `ADJUST`
daté (« Inventaire : N comptées »). La **sortie par photo** (bouton *Sortir une
bouteille* sur l'accueil, ou onglet *Sortie*) ne reconnaît que les vins en
stock : l'étiquette est lue par Gemini puis comparée sur domaine/cuvée/
appellation, le millésime pesant fortement. Un candidat clair déclenche une
confirmation ; plusieurs candidats (ou un candidat incertain) affichent 1 à 4
vignettes avec le millésime en gros, un tap suffit pour choisir, et « Choisir
un autre millésime » permet de revenir en arrière ; aucun candidat affiche
« Ce vin n'est pas dans la cave » avec « Chercher dans la cave » (recherche
pré-remplie avec ce qui a été lu) ou « Rentrer ce vin ». Si l'envoi de la photo
échoue, « Réessayer l'envoi » renvoie la même photo sans reprendre une capture ;
si l'analyse échoue d'emblée ou n'a pas abouti au bout de 12 s, l'écran bascule
sur « Chercher dans la cave ». Rien n'est jamais sorti sans confirmation
explicite. Les photos de sortie ne sont **jamais reportées** : deux tentatives
à 3 s d'intervalle puis abandon (l'utilisateur sort par la liste) ; elles
n'apparaissent ni dans « À confirmer » ni dans le bandeau « en attente
d'analyse », et ne sont pas remises en file au démarrage du worker.

**Emplacements dans la cave.** Chaque bouteille peut être rangée à un endroit
décrit par une zone, un casier et une position (un seul des trois suffit ;
rien vaut « Sans emplacement »), propre à la cave courante. La **zone** se
choisit dans la liste des zones de la cave, dans leur ordre, ou « Sans zone » ;
la zone choisie montre dessous son indication et sa vignette, et, tant que la
cave n'a aucune zone, un lien *Créer une zone* mène à *Ma cave*. Le **casier**
et la **position** restent du texte libre, avec les valeurs déjà utilisées en
suggestion. Ce choix est proposé à l'entrée (unitaire et « À confirmer », bloc
replié par défaut, pré-rempli avec le dernier emplacement d'entrée de la cave),
au déplacement et à l'inventaire en hausse. La fiche vin affiche la
répartition du stock par emplacement (« Cave 2 / B / 3 × 4 ; Sans emplacement
× 2 ») ; toucher un emplacement montre ou cache l'indication et la photo de sa
zone (membre compris). Elle propose au propriétaire *Ranger / déplacer*
pour transférer tout ou partie du stock d'un endroit vers un autre ; la
sortie et l'inventaire en baisse demandent d'où sortent les bouteilles dès
que le vin est réparti sur plus d'un endroit, avec l'emplacement le plus
récemment utilisé déjà coché. L'onglet *Cave* gagne un filtre par
emplacement (y compris « Sans emplacement ») et le journal affiche
« Déplacé » pour un transfert, qui ne compte ni comme entrée ni comme sortie
dans les statistiques. Comme pour les mouvements, rien n'est jamais déplacé
sans confirmation, et annuler un mouvement rend ses bouteilles à leur
emplacement d'origine (annuler un déplacement annule les deux moitiés de la
paire). Un membre (lecture seule) voit la section et le filtre, sans aucun
bouton. API : `GET /api/locations` (chaque emplacement porte `zoneId`), `POST
/api/wines/:id/move`, et un champ d'emplacement facultatif sur l'entrée (`POST
/api/movements`, `/api/movements/bulk`), la sortie (`POST /api/movements/out`)
et l'inventaire (`POST /api/wines/:id/inventory`). Un emplacement saisi s'écrit
`{ zoneId, casier, position }` (`zoneId` : une zone non archivée de la cave,
sinon 404 « Zone introuvable ») ; les endroits d'un vin portent eux aussi
`zoneId`. Une application restée en cache qui envoie encore `{ zone: "texte" }`
est acceptée : la zone de même nom est retrouvée, ou créée en fin de liste.

**Analyse différée, jamais bloquante.** L'analyse ne dépend pas de la
disponibilité de l'API de vision. Dès qu'une photo est reçue, elle est stockée
sur le serveur ; si le service de lecture est saturé, injoignable ou à quota
(erreurs 429, 500, 502, 503, 504, coupure réseau, plafond mensuel atteint), la
photo **retourne en attente au lieu d'échouer** et le worker la reprend
automatiquement — 30 s, 1 min, 2, 4, 8, puis toutes les 15 minutes, pendant une
dizaine de jours si nécessaire. Un refus de Google (503 modèle saturé, 429
quota épuisé) ne déclenche plus ces reprises rapprochées : il met Gemini en
pause commune (5 min, 1 h) : la tentative refusée par Google compte, les
suivantes attendent la fin de la pause sans en consommer (voir *Consommation
Gemini et pause commune*). Une photo d'entrée est aussi **reportée, et non
mise en échec, quand le service de lecture est mal configuré** (clé Gemini
invalide ou expirée, API non activée, modèle inconnu) : elle affiche « Analyse
reportée : service de lecture mal configuré (clé Gemini à vérifier), reprise
automatique » et repart d'elle-même une fois la clé corrigée. Le motif du
report s'affiche sous la photo dans la section *En cours d'analyse* de « À
confirmer », et un bandeau « N photos en attente d'analyse » (sans compter les
photos écartées), avec le motif du dernier report, reste visible sur l'accueil.
Seule une étiquette réellement inexploitable échoue tout de suite, avec le
message « Lecture de l’étiquette inexploitable », et rejoint *Lecture
impossible* pour une saisie manuelle ; les messages bruts du service de lecture
ne sont jamais affichés, ils restent dans les journaux du worker. Les photos
d'entrée n'ont pas de travail Redis : la table des photos sert elle-même de
file, si bien qu'un redémarrage du worker ou de Redis ne leur fait perdre ni
leur place ni leur analyse — une réservation interrompue est reprise au bout de
cinq minutes. Une photo reçue n'est jamais perdue, même après un redémarrage
de la pile.

**Consommation Gemini et pause commune.** Chaque requête réellement envoyée à
Gemini (lecture à l'entrée, lecture à la sortie, accords, descriptifs de
domaine, recherche d'image) laisse une ligne dans un journal (`gemini_call`) —
une seule par lot de photos, d'accords ou de descriptifs, quel que soit le
nombre d'éléments du lot —
réussie, refusée par Google ou en erreur, avec son coût et sa durée. Un refus
de Google (503 « modèle saturé », 429 « quota épuisé ») compte dans ses
statistiques de requêtes mais n'est pas facturé : au lieu de réessayer aussitôt,
l'application met Gemini **en pause pour tous** (api et worker) — 5 minutes
après un 503 ; après un 429, le délai que Google demande dans sa réponse
(`retryDelay` « 37s » ou « Please retry in 37.2s »), jusqu'à minuit heure du
Pacifique si Google parle d'un quota journalier, une heure sinon (motif
`QUOTA_GOOGLE`, texte « Quota Gemini dépassé chez Google : reprise à 14:40. ») —
sans jamais raccourcir une pause plus longue déjà en cours. Pendant la pause, aucun appel n'est envoyé : les photos
d'entrée attendent sans consommer de tentative, puis partent ensemble, huit par
appel, quand la pause se termine ; une analyse de sortie échoue tout de suite
avec le message « Gemini en pause jusqu'à HH:MM (motif) » et l'écran propose la
recherche dans la cave ; les accords et descriptifs attendent la fin de la pause sans consommer de
tentative, puis partent par lots ; la recherche d'image répond aussitôt par ce même message. La section
*Consommation Gemini* de l'onglet *Coûts de l’IA* de l'Administration montre, sur 7 ou 30 jours, les appels
par jour et par usage (réussis, refusés saturé ou quota, erreurs, coût), leurs
totaux et la pause en cours ; le « Détail par jour » sépare aussi les modèles
(colonne *Modèle*, « — » pour les appels d'avant la 2.19.0), le graphique et les
chiffres clés restent tous modèles confondus. Chaque ligne de `gemini_call` note
le modèle employé (colonne `model`). API : `GET /api/admin/gemini-usage?days=7`
(1 à 90 jours) ; chaque ligne du détail porte `model` (regroupement jour × usage
× modèle).

**Modèle de l'IA.** Un seul modèle Gemini sert à tous les usages : lecture des
étiquettes (entrée, sortie, lots), accords, descriptifs, recherche d'image et
analyse des plans. Il se choisit dans *Administration › Coûts de l’IA*, carte
**Modèle de l’IA**, parmi la liste que Google propose en direct (modèles Flash
ou Lite seulement, jamais Pro, capables de `generateContent` ; liste gardée une
heure). Le choix est enregistré en base (réglage `gemini_model` de
`app_setting`) et sert dès l'appel suivant, dans l'api comme dans le worker (au
plus 30 secondes plus tard pour l'autre processus). Tant qu'aucun modèle n'est
choisi, `GEMINI_MODEL` du `.env` sert de valeur de départ (« Valeur du serveur
(.env) tant qu’aucun modèle n’est choisi ici. »). Si la liste de Google est
indisponible (pas de clé, Google en panne), la carte l'affiche en clair et ne
propose que le modèle en vigueur, qu'on peut toujours enregistrer. API :
`GET /api/admin/gemini-model` → `{ model, source, models, error }` (`source` :
`ADMIN` ou `ENV`) ; `PUT /api/admin/gemini-model` `{ model }` → `{ model,
source: 'ADMIN' }`, 400 « Seuls les modèles Gemini Flash ou Lite sont acceptés »
ou « Modèle inconnu de Google » (quand la liste est disponible) ; réservées à
l'administrateur (403 sinon).

**Limites de débit Gemini.** L'application reste toujours sous le quota de la
clé Gemini (niveau sans frais) au lieu d'attendre le refus de Google : 5
requêtes par minute, 250 000 jetons par minute et 20 requêtes par jour par
défaut **et par modèle** (Google compte modèle par modèle), partagées entre tous
les usages, l'api et le worker, premier arrivé, premier servi. Celles du modèle
choisi se règlent dans *Administration › Coûts de l’IA*, carte **Modèle de
l’IA**, sous le titre « Limites de gemini-… » : champs « Requêtes par minute », « Jetons par minute »,
« Requêtes par jour » (entiers positifs, sinon 400 « Limites invalides : entiers
positifs attendus »), bouton **Enregistrer les limites** (« Limites
enregistrées : elles s’appliquent dès le prochain appel. » ; au plus 30 s plus
tard pour l'autre processus), et la ligne « Aujourd’hui : 7 / 20 requêtes ·
Cette minute : 1 / 5 requêtes, 2 700 / 250 000 jetons », relue toutes les 30 s.
Les réglages sont dans `app_setting`, par modèle (`gemini_rpm:<modèle>`,
`gemini_tpm:<modèle>`, `gemini_rpd:<modèle>`) ; à défaut, les anciennes clés
communes `gemini_rpm`, `gemini_tpm`, `gemini_rpd` si elles existent, puis les
valeurs par défaut. Les compteurs sont dans Redis, par modèle : requêtes et jetons des **60 dernières
secondes** (fenêtre glissante, comme Google : deux appels à 59 s d'écart
comptent dans la même minute), requêtes du jour (gardées 26 h). Le jour est celui du Pacifique :
comme Google, le compteur journalier repart de zéro à **minuit heure du
Pacifique** (America/Los_Angeles, heure d'été comprise), soit 9 h à Paris la
plupart de l'année. Avant chaque appel, une réservation atomique vérifie le jour,
puis les requêtes et les jetons des 60 dernières secondes, juste avant l'envoi
(un échec local avant l'appel ne consomme pas de place) ; après la réponse, ses
jetons réels (entrée + sortie) s'ajoutent à la fenêtre. Une limite atteinte n'envoie rien à
Google, ne laisse aucune ligne au journal et ne pose pas la pause commune : la
tâche est simplement **reportée jusqu'à l'heure de reprise** (une seconde
après que la plus ancienne requête, ou assez de jetons, sont sortis de la
fenêtre de 60 s ; ou minuit du Pacifique) puis repart seule — photos d'entrée, accords et
descriptifs sans consommer de tentative, analyses des plans à l'heure dite. Les
textes : « Quota Gemini du jour atteint (20 requêtes) : reprise jeudi à
09:00. » (« aujourd'hui à » si c'est le jour même ; le jour est nommé plutôt que
« demain », qui deviendrait faux une fois minuit passé), « Limite de 5 requêtes par
minute atteinte : reprise à 14:03. », « Limite de jetons par minute atteinte :
reprise à 14:03. » (heures de Paris). Ils s'affichent dans le bandeau des photos
en attente d'analyse, dans le bandeau d'analyse du plan, dans le bandeau de la
carte *Consommation Gemini* (`GET /api/admin/gemini-usage` : `pause` porte
`reason` `QUOTA_*` et `message`) et pour la recherche d'image (503 avec le
texte) ; une analyse de sortie échoue tout de suite avec ce texte, comme pendant
une pause. Redis injoignable : l'appel part quand même, et l'Administration
affiche des compteurs à zéro au lieu d'une erreur. API : `GET
/api/admin/gemini-quota` → `{ model, minute: { requests, tokens }, day: {
requests }, limits: { rpm, tpm, rpd }, dayResetsAt, models: [{ model, requests,
rpd, exhaustedUntil }] }` (compteurs et limites du modèle choisi, puis la liste
de bascule) ; `PUT /api/admin/gemini-quota` `{ rpm, tpm, rpd }` règle les
limites du modèle choisi → la même réponse ; réservées à l'administrateur (403
sinon).

**Bascule automatique de modèle.** Quand le quota du jour du modèle choisi est
atteint, l'application passe seule au modèle suivant, sans rien faire à la
main. La liste de bascule : le modèle choisi d'abord, puis les modèles stables
de génération que Google propose, de la forme `gemini-<version>-flash` ou
`gemini-<version>-flash-lite` sans suffixe (ni preview, ni exp, tts, image,
live, audio…), du plus récent au plus ancien, Flash avant Flash-Lite à version
égale ; jamais de Pro. Liste de Google indisponible : le modèle choisi seul.
Pour chaque appel, le premier modèle dont le quota du jour n'est pas atteint
sert : refus local du jour → modèle suivant, rien ne part ; 429 de Google qui
porte sur un quota journalier (`PerDay`, « per day ») → l'appel refusé est noté
au journal, le modèle est marqué **épuisé jusqu'au prochain minuit du
Pacifique** (marque Redis partagée par l'api et le worker), **sans pause
commune**, et le modèle suivant est essayé aussitôt dans le même appel. Les
limites à la minute (requêtes, jetons), les 503 et les autres 429 gardent leur
comportement : attente ou pause commune, sans bascule. Tous les modèles épuisés
pour la journée : le même refus qu'avant, « Quota Gemini du jour atteint… »,
reprise au prochain minuit du Pacifique. Le journal `gemini_call` note le
modèle réellement employé. La carte **Modèle de l’IA** montre, sous les
limites, « Quand le quota du jour d’un modèle est atteint, l’application passe
seule au suivant. » et une ligne par modèle de la liste : « gemini-… : 7 / 20
requêtes aujourd’hui », avec le badge « épuisé jusqu’à 09:00 » s'il l'est. Les
compteurs d'avant ce changement (communs à tous les modèles) ne sont pas
repris : le jour du déploiement, un 429 journalier de Google fait la bascule.

**Photos plus nettes.** Une version d'affichage est fabriquée par le serveur,
sans aucun coût supplémentaire : la lecture Gemini d'une photo renvoie déjà le
cadre de l'étiquette, réutilisé pour recadrer l'image avec une marge quand ce
cadre est plausible, puis corriger balance des blancs, contraste et netteté,
et la réduire à 1200 px de côté au plus. Elle est fabriquée une seule fois, à
la première consultation d'une photo lue (ou en échec), puis gardée sur le
disque ; c'est elle qui s'affiche désormais dans les vignettes (cave, fiche,
sortie) et les écrans de confirmation. L'original n'est jamais modifié, et
c'est toujours lui que Gemini relit. API : `GET /api/photos/:id/image?variant=display`
(sans paramètre, l'original, inchangé).

**Chercher une image.** Sur la fiche vin, un bouton sous l'en-tête (vignette et
titre) ouvre, sur toute la largeur de la fiche, une recherche d'image d'étiquette sur le web, pour remplacer sa propre photo par
une image plus nette ou plus officielle. La recherche interroge d'abord **Open
Food Facts** (gratuit, sans clé, licence CC BY-SA, source toujours citée avec
un lien) ; si rien n'y figure, **le site officiel du domaine**, retrouvé par
Gemini grâce à la recherche Google intégrée (5 000 recherches gratuites par
mois pour les modèles Gemini 3 ; chaque recherche compte au moins 1 centime,
et davantage si Gemini lance plusieurs requêtes de recherche, dans le plafond mensuel et dans la part de 80 % déjà réservée aux accords et
descriptifs). Le serveur télécharge lui-même jusqu'à 5 propositions et les
garde 1 heure le temps de choisir ; chaque téléchargement est protégé (adresses
http(s) publiques seulement, taille et délai limités, 4 secondes par image).
La recherche entière tient en 30 secondes : passé ce délai, les propositions
déjà prêtes s'affichent, et s'il n'y en a aucune, « Recherche d'image
indisponible pour le moment ». Un appel à Gemini abandonné au délai est
compté 2 ct (une recherche, estimation), car il a pu être facturé. Chaque
recherche est notée dans les journaux de l'api (arrivée, nombre d'images et
durée, ou raison du refus) ; si le proxy devant l'application coupe la requête
(502 ou 504), l'écran le précise : « … (le serveur n'a pas répondu) ». Si Google
refuse l'appel faute de quota (429, typiquement une clé Gemini sans facturation
activée, où la recherche Google intégrée n'est pas disponible), l'écran affiche
« Recherche d'image impossible : quota Gemini épuisé » ; Open Food Facts, lui,
continue de fonctionner. Une fois l'image choisie, la fiche affiche « Image : {source} » (lien vers la page d'origine) et
« Revenir à ma photo » pour annuler à tout moment. Limité à 10 recherches par
minute. API : `POST /api/wines/:id/image-search`, `GET
/api/image-candidates/:id`, `POST`/`DELETE /api/wines/:id/reference-image`.

**Réglages.** L'onglet *Réglages* de la barre du bas (ou l'icône en haut à
droite des autres écrans) ouvre les Réglages (`/compte`), un **hub** ouvert à tout compte connecté, avec le profil (initiales, nom,
e-mail) puis une carte par écran, chacune avec son résumé. Dans les Réglages et
leurs écrans (Moi, Ma cave, Application, À propos), la version de l'application
(« v2.25.0 ») remplace l'icône en haut à droite :

- **Moi** (`/compte/moi`) : **mes caves** (la sienne et celles où l'on est
  invité, avec « Afficher » pour en changer), **installer l'application** sur le
  téléphone (bouton « Installer l'application » quand le navigateur le propose,
  sur Android ; sur iPhone, l'indication *Safari → Partager → Sur l'écran
  d'accueil*) et **« Se déconnecter »** ;
- **Ma cave** (propriétaire seulement) : la page `/ma-cave` décrite plus haut,
  sauvegarde Excel comprise ;
- **Application** (administrateur seulement) : l'Administration, en trois
  onglets (voir *Comptes et administration*), avec le nombre d'inscriptions en
  attente (la page d'accueil garde aussi un lien *Administration* pour les
  administrateurs) ;
- **À propos** (`/compte/a-propos`) : **numéro de version**, état de
  l'installation et lien vers les **Règles de confidentialité**.

L'écran « en attente » d'un compte non validé propose *Actualiser* pour
revérifier sans se reconnecter. La version n'apparaît plus dans l'en-tête
des écrans, seulement dans *À propos* et sur l'écran de connexion (avant de s'identifier).
Une image publiée affiche son numéro (`1.0.0`) ; une image `latest` construite
depuis `main` affiche ce numéro suivi de l'empreinte du commit
(`1.0.0+ab12cd3`), pour ne jamais faire passer des changements non publiés pour
la dernière version ; une construction locale affiche `dev`.

**Nouvelle version disponible.** L'application ne se recharge plus d'elle-même
au milieu d'une saisie : un bandeau *Nouvelle version disponible*, au-dessus de
la barre d'onglets, propose un bouton *Recharger*. Il apparaît sur deux
signaux, parce qu'aucun des deux ne suffit seul : le service worker a
téléchargé une nouvelle coque et attend d'être activé (le cas normal), ou la
version renvoyée par `/api/health` diffère de celle chargée dans le navigateur
(le cas d'un cache périmé, que le service worker n'a même pas vu). Les deux
moitiés de l'image portent la même étiquette au même `docker build`, ce qui
rend l'écart significatif ; en développement, ou pour une image `latest` dont
le libellé porte l'empreinte du commit, l'écart n'est pas signalé. Une
application ouverte vérifie toutes les trente minutes et à chaque retour au
premier plan, sinon une version publiée en journée n'arriverait sur le
téléphone qu'au prochain démarrage complet. *Recharger* active la coque en
attente, puis recharge en dur après 1,5 s — sans ce filet, le bouton ne ferait
rien dans le cas de l'écart de version, où aucun service worker n'attend. Pas
de service worker sans HTTPS (sauf `localhost`) : en HTTP, seul le second
signal fonctionne.

**Hors ligne.** La cave est souvent un sous-sol sans réseau : les photos sont
mises en file dans le navigateur (200 photos ou 200 Mo maximum) et envoyées une
par une dès que le réseau revient, ou que l'application revient au premier
plan. Le bandeau « N photos en cours d'envoi » reste visible ; file pleine,
il annonce « File d'envoi pleine (200 photos) — attendez que les envois
partent ».

**Journal et annulation.** Les 20 derniers mouvements de la cave sont
consultables et annulables en un tap, par son propriétaire seulement. Une annulation écrit un mouvement inverse : rien n'est
jamais supprimé, l'historique reste vrai.

**Apogée.** Une fourchette de buvabilité est estimée par règles pour chaque vin
millésimé, **recalculée à la lecture** (jamais stockée, donc jamais périmée) :
`[millésime + garde min × f ; millésime + garde max × f]`, où la garde vient,
par ordre de priorité, d'un ajustement pour l'appellation et la couleur, du cas
particulier des rosés (1 à 3 ans), d'un ajustement pour l'appellation entière,
ou de la garde du référentiel ; le facteur `f` vaut 1,2 pour un grand
millésime, 0,85 pour un millésime faible et **1,0 par défaut** (millésime
« moyen », tant qu'il n'a pas été qualifié). La fiche vin affiche la fourchette,
un badge de confiance (*Saisie* en cas de correction manuelle, *Confiance
moyenne* si le millésime est qualifié, *Confiance faible* sinon) et un statut
(« Trop jeune », « À boire », « À boire vite », « Apogée passée depuis… ») ;
quand aucune estimation n'est possible (vin non millésimé, appellation non
reconnue, garde inconnue), la raison s'affiche avec une saisie manuelle
proposée. *Corriger* permet au propriétaire de la cave de fixer deux années,
qui priment alors toujours sur les règles ; *Revenir à l'estimation* efface la
correction. L'onglet *Cave* porte une mention courte par ligne (« À boire
2024-2036 », « Trop jeune (2027) », « À boire vite », « Apogée passée »).
Réservée aux administrateurs, l'**administration des règles** (Administration, onglet *Données du vin*) permet de qualifier le millésime d'une région (grand / moyen /
faible) et d'ajuster la garde d'une appellation (pour toutes les couleurs ou
une seule) ; les changements s'appliquent immédiatement partout, sur toutes
les fiches concernées, dans toutes les caves.

**À boire en priorité.** Dans l'onglet *Cave*, la case *À boire en priorité*
ne garde que les vins dont l'apogée se termine **au plus tard l'an prochain**
(apogée passée, dernière année, ou fin l'an prochain — l'année de marge laisse
le temps de prévoir l'occasion), la fin la plus proche en premier, puis par
producteur. Une correction manuelle de l'apogée compte comme l'estimation. Les
vins sans estimation n'y figurent jamais, mais ne sont pas oubliés : un bandeau
« N vins sans apogée estimée » mène, par *À compléter*, à la case *Sans
apogée*, qui les liste pour qu'on saisisse leur fourchette depuis la fiche. Les
deux cases s'excluent ; elles se combinent avec la recherche, la couleur et les
vins épuisés. Côté API : `GET /api/cave?drinkSoon=true` et
`GET /api/cave?noApogee=true`.

**À boire prochainement.** Même critère, présenté pour savoir où descendre :
sur l'accueil, une carte « À boire prochainement » montre les trois vins les
plus urgents avec leur emplacement (« Cave 1 / A ») et mène, par « Tout voir »,
à la page `/a-boire`, qui liste ces vins **regroupés par emplacement**
(« Sans emplacement » en dernier ; dans chaque groupe, la fin d'apogée la plus
proche d'abord, puis la meilleure note). Un vin rangé à deux endroits figure
dans les deux groupes, avec la quantité de chacun ; rien d'urgent : « Rien
d'urgent à boire. ». Sous chaque en-tête d'emplacement, l'indication et la
vignette de sa zone, s'il y en a. Visible aussi d'un membre en lecture seule. Dans la
réponse de `GET /api/cave?drinkSoon=true`, chaque vin porte `places` (ses
endroits et leur quantité).

**Mesure « zéro saisie ».** Chaque entrée par photo (en rafale, ou saisie à la
main après une lecture impossible) garde la fiche telle qu'elle a été
confirmée. L'Administration (onglet *Données du vin*) affiche, pour les administrateurs, la section *Qualité de la
lecture* : la part des champs corrigés à la main sur les 90 derniers jours
(objectif du cahier des charges : moins de 15 %), avec le détail par champ
(producteur, cuvée, appellation, millésime, couleur, format) pour voir lequel
la lecture rate le plus. Un champ est corrigé quand la valeur confirmée
diffère de celle que l'écran avait pré-remplie : espaces autour ignorés,
majuscules et accents comptés, valeurs par défaut gardées (rouge, 75 cl) non
comptées. Une photo dont l'analyse a échoué compte pour tout ce qui a été
saisi. API : `GET /api/admin/reading-quality`.

**Statistiques.** Le 5e onglet *Stats* ouvre une page calculée à chaque
lecture (`GET /api/stats`, propriétaire et membres de la cave) : bouteilles,
références et **valeur au prix d'achat** (propriétaire seulement) (stock × dernier prix d'achat saisi, la même règle
que l'export ; « sur N des M références » quand des prix manquent, « Aucun prix
d'achat saisi » quand aucun prix n'est connu) ; répartition du stock par
**apogée** (les barres *À boire vite*, *Passée* et *Sans estimation* ouvrent
l'onglet Cave déjà filtré ; l'onglet Cave affiche alors toute la liste « à
boire en priorité », apogée finie au plus tard l'an prochain, qui peut compter
plus de bouteilles que la barre), par **couleur**, par **région** (8 premières
puis *Autres*) et par **décennie
de millésime** ; **mouvements sur 12 mois** (entrées et sorties par mois, heure
de Paris ; annulations et inventaires exclus), avec le rythme moyen de
consommation et la durée de cave qu'il donne ; et quatre **classements** : les
vins les plus bus sur 12 mois, les producteurs les plus présents, les
bouteilles les plus chères au prix d'achat (propriétaire seulement) et les
mieux notés. Pour un membre, la valeur au prix d'achat et « les plus chères »
sont absentes : la page n'affiche que le reste. Pour le propriétaire
seulement s'ajoute la **valeur à la cote** (stock × cote courante
des vins en stock cotés) : « Valeur à la cote : X € sur N références cotées
(sur M) », avec la valeur de cession estimée juste en dessous (cote / 1,16
pour les cotes iDealwine ou sans lien, cote telle quelle pour Wine-Searcher et
Vivino, qui n'ont pas de frais acheteur) ; « — » et
« Pas encore de cote » quand aucun vin en stock n'est coté.

**Cote, saisie à la main.** Sur la fiche d'un vin, le bloc *Cote*
(propriétaire seulement) propose trois liens, ouverts dans un nouvel onglet,
vers la recherche du vin — producteur et cuvée, sans accents, sans millésime
ni guillemets (les moteurs n'en tiennent pas compte) — sur trois sites :
*Voir sur iDealwine* (enchères, `www.idealwine.com`), *Voir sur Wine-Searcher*
(prix moyen chez les cavistes, `www.wine-searcher.com`) et *Voir sur Vivino*
(prix boutique et note, `www.vivino.com`). Si une cote a déjà été saisie avec
un lien, le lien de ce site ouvre la page qui a servi. **L'application ne
contacte jamais ces sites elle-même** : elle n'offre que des liens (voir
*Limites*). Le propriétaire reporte alors à la main la cote lue : montant en
euros, nombre de transactions (facultatif), date du relevé et, facultatif, le
lien exact de la page consultée — une page `https` de l'un des trois sites
exactement (hôte vérifié sur l'adresse analysée, sans port ni identifiants),
sinon « Le lien doit être une page iDealwine, Wine-Searcher ou Vivino ». La
**source** de la cote est déduite de l'hôte de ce lien et enregistrée dans la
colonne `source` existante (`IDEALWINE`, `WINE_SEARCHER` ou `VIVINO` ; sans
lien, la valeur par défaut `IDEALWINE` ; aucune migration) : la fiche
affiche la cote, son âge et sa source (« cote du 3 mars 2026, il y a 7 mois ·
source Vivino » ; pas de lien, pas de source), un avertissement si le nombre
de transactions est faible (moins de 5) ou si la cote a plus d'un an, et,
pour une cote iDealwine ou sans lien seulement, la **valeur de cession
estimée** (`cote / 1,16`, arrondie à l'euro, « cote hors frais acheteur
d'environ 16 % » : des frais d'enchères, sans objet pour un prix de caviste
ou de boutique). Chaque saisie remplace la précédente comme valeur courante ;
l'historique est conservé en base, jamais écrasé. Un membre ne voit ce bloc à
aucun moment : les clés de cote sont absentes de la fiche qu'il reçoit. Pour
ajouter un site, il suffit d'une entrée dans la liste `QUOTE_SITES`
(`api/src/quotes/quote.ts` : hôte, nom, recherche). API :
`POST /api/wines/:id/quotes` (propriétaire seulement, la réponse porte
`site` et `source`) ; `GET /api/wines/:id` ajoute, pour le propriétaire, `quote` (avec
`site` et `source`), `searchLinks` (`[{ site, label, hint, url }]`, un par site),
`savedUrl` et `idealwineUrl` (ancien lien unique, gardé pour un client encore
en cache).

**Note de dégustation.** Sur la fiche d'un vin, le bloc *Ma note* permet au
propriétaire de la cave de noter le vin **sur 20, par demi-point** (« 16,5 » ou
« 16.5 » acceptés) ; la note remplace la précédente et peut être retirée. Elle
s'affiche avec sa date et son auteur (un membre voit le nom affiché de
l'auteur, jamais son adresse e-mail), sur la ligne du vin dans l'onglet Cave,
dans la colonne *Note /20* de l'export Excel et dans le classement *Les mieux
notés* de la page Stats. API : `PUT` et `DELETE /api/wines/:id/rating`.

**Accords mets-vins.** Chaque vin reçoit, en tâche de fond, jusqu'à 8 plats
suggérés par Gemini, demandés à la création du vin et, au démarrage du worker,
pour les vins qui n'en ont pas encore. Les demandes sont **groupées par lots** :
le worker passe toutes les 15 s et envoie **jusqu'à 10 vins en un seul appel**
Gemini ; un lot part dès que 10 vins attendent, ou dès que la plus ancienne
demande attend depuis **2 minutes** (les accords d'un vin saisi seul arrivent
donc en 2 à 3 minutes). *Régénérer* remet simplement l'accord en attente : il
rejoint le lot suivant, la fiche affiche aussitôt « Suggestions en
préparation… », et aucun appel n'est fait directement. Deux vins décrits à
l'identique (producteur, cuvée, appellation, couleur, millésime) ne prennent
qu'une ligne de l'appel, et la réponse vaut pour les deux. Un vin absent ou
invalide dans la réponse du lot est redemandé **seul**, pour ne pas faire
échouer les autres (5 min, 20 min, 1 h 20, puis 5 h 20 plus tard) ; après 5
réponses inexploitables, il passe en échec (« Réponse de Gemini
inexploitable »). Une panne (réseau, service saturé, quota, clé Gemini
refusée) ne compte pas comme une tentative : la demande est reprise après une
attente qui grandit avec son ancienneté (de 5 min à 6 h, jamais avant la fin
de la pause commune) et ne passe en échec qu'après 7 jours (motif du report
suivi de « — abandon »). Une pause commune de Gemini ou le plafond atteint
reportent le lot sans consommer de tentative. Les tables `pairing` et `producer_profile` servent
elles-mêmes de file, comme celle des photos d'entrée : un redémarrage du
worker ou de Redis ne perd aucune demande. Le plafond mensuel `GEMINI_MONTHLY_CAP_CENTS` compte photos et accords
ensemble ; les accords ne se génèrent que tant que la dépense du mois reste
sous 80 % de ce plafond, pour que les photos d'étiquette gardent toujours la
priorité. La fiche affiche les plats (« Suggestions générées par
Gemini »), « Suggestions en préparation… » en attendant, et, pour le propriétaire, *Régénérer*
(`POST /api/wines/:id/pairing/regenerate`) ; une génération qui échoue pour un
problème de configuration affiche « Génération impossible : configuration
Gemini à vérifier », et une réponse inexploitable « Réponse de Gemini
inexploitable ». Dans l'onglet Cave, le champ
**Accompagner un plat** garde les vins dont un plat suggéré contient les mots
tapés (sans accents ni majuscules), les bouteilles à boire en priorité en
premier, avec la mention « avec : … » (`GET /api/cave?dish=`). L'export ajoute
une colonne *Accords*.

**Descriptif du domaine.** Chaque domaine (producteur) reçoit un seul texte,
partagé par tous ses vins et millésimes, **dans toutes les caves**, généré en arrière-plan par Gemini (3
à 4 phrases : lieu, histoire, style) — par lots de **10 domaines au plus par
appel**, avec la même attente de 2 minutes, les mêmes reprises et la même part
de 80 % du plafond mensuel que les accords mets-vins (deux sortes de lots
distinctes : un appel ne mélange jamais accords et descriptifs), déclenché à la création
d'un vin dont le domaine n'a pas encore de descriptif et, pour les domaines
déjà existants, au démarrage du worker. Quand Gemini n'a pas d'information
fiable sur un petit domaine, la fiche affiche « Domaine peu documenté » plutôt
qu'un texte inventé. Un descriptif généré par Gemini porte toujours la mention
« Généré par Gemini, peut contenir des erreurs ». Tout le monde le lit ;
**seuls les administrateurs l'écrivent** (403 « Réservé à l’administrateur »
pour les autres, propriétaires compris) : un texte saisi à la main
(2 000 caractères maximum) prend le pas sur celui de Gemini et le remplace
tant qu'on ne choisit pas *Revenir au texte généré*, qui relance une
génération ; *Régénérer* relance aussi une génération à tout moment — le
descriptif repasse en attente et rejoint le lot suivant, la fiche affiche
aussitôt « Descriptif en préparation… ». Le bloc
*Le domaine* s'affiche sur la fiche du vin, au-dessus des accords mets-vins.
API : `PUT /api/producers/:key/description`, `POST
/api/producers/:key/regenerate`, et `producerKey` / `producerProfile` ajoutés
à `GET /api/wines/:id`. Au démarrage du worker, tous les domaines sans
descriptif sont mis en attente : ils partent dix par dix, au plus un lot de
descriptifs (et un d'accords) par passage du worker, toutes les 15 s environ —
un passage dont l'appel Gemini dure encore fait sauter le suivant.

**Export Excel.** Réservé au propriétaire de la cave : un classeur `.xlsx` à la demande, limité à la cave courante, régénéré intégralement à
chaque fois, avec trois feuilles (`Stock`, `Mouvements`, `Référence`), un filtre
optionnel par couleur et la case *Seulement les vins à boire en priorité*
(même règle et même ordre que l'onglet Cave ; `GET /api/export.xlsx?drinkSoon=true`). La feuille `Stock` ajoute *Apogée min*, *Apogée max* et
*Confiance* après *Millésime*, puis *Note /20* après *Confiance* et *Accords*,
puis *Emplacements* (répartition par emplacement, par exemple « Cave 2 / B /
3 × 4 ; Sans emplacement × 2 », vide s'il n'y a pas de stock), et enfin *Cote
(€)*, *Date de la cote*, *Valeur à la cote (€)* (= cote × quantité) et
*Source* (site du lien de la cote, vide sans lien ; les quatre cellules sont
vides quand le vin n'a pas de cote) en dernières colonnes ; une ligne dont l'apogée est déjà passée est
mise en évidence par une teinte d'alerte. La feuille `Mouvements` affiche
`MOVE` dans la colonne *Type* pour un déplacement d'emplacement.

**Garde-fous.** Stock jamais négatif (contrainte en base), **même sous
concurrence** : le déclencheur verrouille désormais la ligne du vin avant de
vérifier le stock, pour qu'une sortie simultanée des dernières bouteilles ne
puisse pas en laisser passer deux à la fois. Le stock affiché est **calculé à
chaque lecture** à partir du journal (vue `stock_courant`) : deux mouvements
simultanés ne peuvent plus en faire disparaître un. Journal en ajout seul,
idempotence de bout en bout (empreinte de contenu par photo, clé d'idempotence par
mouvement, un seul mouvement d'entrée par photo **et une seule sortie par
photo**, une clé d'idempotence déjà utilisée par un autre mouvement est
refusée plutôt que rejouée comme une sortie), inventaire physique sous verrou
de ligne (deux inventaires simultanés n'écrivent l'écart qu'une fois), et
plafond mensuel de dépense pour l'API de vision. Le serveur télécharge
désormais aussi des images tierces pour « Chercher une image » : adresses
http(s) publiques seulement (résolution DNS vérifiée, adresses privées,
de bouclage et locales refusées), redirections limitées et revérifiées, taille
et délai bornés.

**Comptes et administration.** Toute adresse Google peut demander l'accès ;
le compte reste **en attente** jusqu'à ce qu'un administrateur le valide. Les
adresses de `ADMIN_EMAILS` sont actives et administratrices dès leur première
connexion, et une adresse invitée par un propriétaire est active d'emblée,
en lecture seule sur la cave qui l'a invitée. L'espace `/admin` (carte *Application* des *Réglages*) réunit, pour les
administrateurs, trois onglets : *Comptes* (`/admin/comptes`, ouvert par défaut),
*Coûts de l’IA* (`/admin/couts`) et *Données du vin* (`/admin/donnees`) :

- *Comptes* — **Inscriptions** (en tête) : les comptes en attente (nom, e-mail, date
  d'inscription), avec *Valider* — le compte devient actif et reçoit sa cave,
  « Cave de {nom affiché ou e-mail} », dont il est propriétaire — et
  *Refuser* — le compte est bloqué.
- *Comptes* — **Comptes** : liste des comptes ; les actions sont dans un menu ⋯
  par compte (blocage/réactivation, promotion/retrait des droits
  d'administration, avec confirmation pour *Bloquer* et *Retirer les droits*, et *Créer sa cave*) pour un
  compte actif qui n'en a pas (un invité qui veut aussi sa propre cave, ou un
  administrateur). Un compte n'est propriétaire que d'une seule cave.
- *Coûts de l’IA* — **Modèle de l’IA**, en tête de l'onglet : le modèle Gemini
  de tous les usages, choisi dans la liste de Google (voir *Modèle de l'IA* plus
  haut).
- *Coûts de l’IA* — **Budget** (jauge de consommation) : la dépense Gemini du mois et la **part maximale par cave**
  (20 % du plafond mensuel `GEMINI_MONTHLY_CAP_CENTS` par défaut, réglable de
  0 à 100 %). Une cave qui a atteint sa part voit ses analyses reportées avec
  le motif « Part mensuelle de cette cave atteinte — reprise le mois
  prochain », comme pour le plafond global. **La cave de l'administrateur
  principal** (le plus ancien administrateur qui n'est pas le compte de
  secours) **n'est pas limitée** ; le plafond global, lui, vaut pour tous.
  Les caves invitées (toutes les autres) ont aussi une **part maximale
  ensemble** (60 % par défaut, réglable de 0 à 100 %) : quel que soit leur
  nombre, elles laissent au moins le reste du plafond à la cave principale
  (motif « Part mensuelle des caves invitées atteinte — reprise le mois
  prochain »).
  Les accords mets-vins et les descriptifs de domaine ne sont soumis à
  aucune part, seulement au plafond global.
- *Coûts de l’IA* — **Consommation Gemini** : chiffres clés, barres empilées par jour et
  repliable « Détail par jour » (voir *Consommation Gemini* plus haut).
- *Données du vin* — **Qualité de la lecture** et **règles d'apogée** (millésimes et
  gardes ; l'ajustement d'une garde se fait dans une feuille en bas d'écran,
  voir plus haut).

Les **membres** d'une cave se gèrent, eux, par son propriétaire, depuis
*Ma cave* (voir *Membres en lecture seule*).

`ADMIN_EMAILS` est un **plancher garanti, jamais un plafond** : une adresse qui
y figure est administratrice même si la base dit le contraire (le propriétaire
ne peut jamais s'enfermer dehors), et ces comptes-là ne sont ni blocables ni
rétrogradables depuis `/admin` — seul le `.env` le peut. À l'inverse, une
promotion accordée depuis l'interface à un compte absent d'`ADMIN_EMAILS` est
durable : elle survit aux connexions suivantes, jamais écrasée par
l'environnement. Un administrateur ne peut pas non plus modifier son propre
compte, pour ne jamais perdre l'accès à l'administration par erreur. Un
blocage prend effet dès la requête suivante, y compris sur une session déjà
ouverte : il n'attend pas une prochaine connexion. Être administrateur ne
donne accès à aucune cave en particulier : un administrateur voit sa propre
cave et celles où il est invité, comme tout compte.

## Architecture et ports

| Service | Rôle | Port | Exposition |
| --- | --- | --- | --- |
| `web` | nginx + PWA compilée, relaie `/api/` | **3100** sur l'hôte → 80 | **seul port publié** (`WEB_PORT`) |
| `api` | REST, authentification, règles métier, export | 3000 | réseau Docker interne |
| `worker` | extraction Gemini via BullMQ (sorties) ; entrées (8 photos), accords et descriptifs (10) par lots toutes les 15 s | — | réseau Docker interne |
| `postgres` | données (PostgreSQL 16 + `pg_trgm`) | 5432 | réseau Docker interne |
| `redis` | file de travaux et sessions | 6379 | réseau Docker interne |
| `db-backup` | `pg_dump` quotidien avec rotation | — | réseau Docker interne |

Seul le port `3100` est joint par Nginx Proxy Manager, qui termine TLS et garde
80/443. Aucune autre ouverture n'est nécessaire sur la box.

## Déploiement

### 1. Préparer l'hôte

Une VM ou un LXC avec 2 vCPU, 4 Go de RAM et 40 Go de disque suffit. Docker et le
plugin Compose installés ; le Nginx Proxy Manager existant doit pouvoir joindre
cette machine sur le réseau local.

### 2. Créer la stack

La stack est **autonome** : le `docker-compose.yml` et son `.env` suffisent,
aucun autre fichier du dépôt n'est nécessaire sur l'hôte (les images portent le
code, et le script de sauvegarde est écrit dans le YAML lui-même). L'intégration
continue le vérifie à chaque commit en démarrant la stack dans un dossier qui ne
contient que ces deux fichiers.

**Avec Dockge** (le cas de ce serveur) : créer une stack `ma-cave`, coller le
contenu de [`docker-compose.yml`](../docker-compose.yml) dans l'éditeur et celui du
`.env` (étape 4) dans le panneau des variables. Dockge range la stack dans
`/opt/stacks/ma-cave/`.

**En ligne de commande**, l'équivalent :

```bash
mkdir -p /opt/stacks/ma-cave && cd /opt/stacks/ma-cave
curl -fsSLO https://raw.githubusercontent.com/djkix/ma-cave/main/docker-compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/djkix/ma-cave/main/.env.example
```

Les sauvegardes sont écrites dans `./backups`, à côté du YAML.

### 3. Créer le client OAuth Google

Dans la console Google Cloud, avec le compte qui possédera l'application :

1. Créer ou choisir un projet (<https://console.cloud.google.com/projectcreate>).
2. **Google Auth Platform** (<https://console.cloud.google.com/auth/overview>) :
   nom de l'application, adresse de support, **audience External**. Dans
   **Branding**, page d'accueil `https://cave.example.org`, règles de
   confidentialité `https://cave.example.org/confidentialite` (page publique de
   l'application, sans connexion) et domaine autorisé `example.org` ; puis
   **Publish app** (sans publication, seuls les « utilisateurs test » listés
   peuvent se connecter). Les scopes demandés se limitent à `openid`,
   `userinfo.email` et `userinfo.profile` : ce périmètre est exempté de
   vérification par Google, il n'y a donc aucune démarche à faire.
3. **Clients → Create client** (<https://console.cloud.google.com/auth/clients>),
   type **Application Web**, avec cet URI de redirection autorisé :
   `https://cave.example.org/api/auth/google/callback`
   (aucune origine JavaScript n'est nécessaire, le flux est côté serveur).
4. Relever le **Client ID** et le **Client secret**. Le secret ne se réaffiche
   pas : s'il est perdu, en créer un nouveau depuis la fiche du client.

**Règle ferme** : aucun autre scope ne doit jamais être demandé à ce client.
L'export étant un simple téléchargement, l'application n'a besoin d'aucun accès
à Drive ni à Sheets.

### 4. Renseigner le `.env`

```bash
cd /opt/stacks/ma-cave && nano .env
```

Générer les deux secrets :

```bash
openssl rand -hex 24
```

```bash
openssl rand -hex 32
```

| Variable | Valeur attendue |
| --- | --- |
| `WEB_PORT` | port publié sur l'hôte (défaut `3100`), cible du proxy |
| `IMAGE_TAG` | `latest`, ou un numéro de version (`1.0.0`) pour figer le déploiement |
| `POSTGRES_USER` / `POSTGRES_DB` | `cave` / `cave` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `SESSION_SECRET` | `openssl rand -hex 32` — 32 caractères minimum, l'api refuse de démarrer en dessous |
| `WEB_ORIGIN` | `https://cave.example.org` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | valeurs de l'étape 3 |
| `GOOGLE_CALLBACK_URL` | `https://cave.example.org/api/auth/google/callback`, **identique** à l'URI déclaré chez Google |
| `BREAK_GLASS_EMAIL` / `BREAK_GLASS_PASSWORD` | compte local de secours (mot de passe de 12 caractères minimum), connexion par `/login?secours` ; laisser vide pour n'en créer aucun |
| `ADMIN_EMAILS` | adresses administratrices, séparées par des virgules, en minuscules ; seule façon de désigner un administrateur (voir étape 7) |
| `GEMINI_API_KEY` | clé Google AI Studio |
| `GEMINI_MODEL` | `gemini-3.8-flash` ; **valeur de départ** de tous les usages, tant qu'aucun modèle n'est choisi dans *Administration › Coûts de l’IA*. Un modèle Flash ou Lite seulement (l'api refuse de démarrer avec un modèle Pro ; les coûts sont comptés au tarif Flash) |
| `GEMINI_MONTHLY_CAP_CENTS` | plafond mensuel approximatif en centimes (`500` = ~5 €) |
| `BACKUP_DIR` / `BACKUP_RETENTION_DAYS` / `BACKUP_INTERVAL_SECONDS` | sauvegardes : répertoire, rétention, intervalle |

Le `.env` n'est jamais commité et n'entre jamais dans une image.

### 5. Récupérer les images

Les paquets GHCR sont privés par défaut, même si le dépôt est public. Soit
s'authentifier avec un jeton personnel disposant de `read:packages` :

```bash
echo <PAT> | docker login ghcr.io -u djkix --password-stdin
```

```bash
cd /opt/stacks/ma-cave && docker compose pull
```

… soit construire les images sur place, ce qui évite toute authentification.
C'est le seul cas où le dépôt complet est nécessaire sur l'hôte, puisque la
construction part des sources :

```bash
git clone https://github.com/djkix/ma-cave.git /opt/stacks/ma-cave-src
cd /opt/stacks/ma-cave-src && docker compose build
```

### 6. Démarrer

```bash
cd /opt/stacks/ma-cave && docker compose up -d
```

Le conteneur `api` applique les migrations Prisma puis charge le référentiel des
appellations au démarrage — les deux opérations sont idempotentes et se rejouent
sans risque à chaque redémarrage. Vérification :

```bash
curl -s http://localhost:3100/api/health
```

La réponse attendue est `{"status":"ok"}`. En cas d'échec :
`docker compose logs api --tail 50`.

### 7. Désigner un administrateur

Le sous-domaine est public : n'importe quel titulaire d'un compte Google peut
se connecter, mais son compte reste **en attente de validation** et ne voit
rien tant qu'un administrateur ne l'a pas validé depuis la section
*Inscriptions* de `/admin` (ce qui lui crée sa cave). Seules les adresses
d'`ADMIN_EMAILS` et celles qu'un propriétaire a invitées entrent directement.

La seule façon de désigner un administrateur est la variable `ADMIN_EMAILS` du
`.env` (adresses séparées par des virgules, en minuscules) : au moins la vôtre,
pour pouvoir ouvrir l'espace d'administration après le premier déploiement.
C'est un plancher garanti, pas un plafond : un compte listé ici reste
administrateur quoi qu'il arrive et **ne peut pas être bloqué ni rétrogradé
depuis `/admin`** (l'interface refuse l'action) — seule une modification de ce
fichier le peut. À l'inverse, promouvoir depuis `/admin` un compte qui n'est
pas dans `ADMIN_EMAILS` reste valable durablement, connexion après connexion.

```bash
ADMIN_EMAILS=admin@example.com
```

Une fois connecté avec cette adresse, l'espace **Administration** (carte
*Application* des *Réglages*, ou `/admin`) valide ou refuse les inscriptions, liste tous les
comptes créés et permet de bloquer un compte indésirable, de le réactiver, de
promouvoir/retirer d'autres administrateurs, de créer la cave d'un compte qui
n'en a pas et de régler la part de budget par cave. Un administrateur ne peut
pas modifier son propre compte. Sur une installation neuve, le premier
administrateur n'a pas encore de cave : *Créer sa cave* sur sa propre ligne
la lui crée.

### 8. Configurer Nginx Proxy Manager

**Proxy Hosts → Add Proxy Host** :

- *Domain Names* : `cave.example.org`
- *Scheme* : `http` · *Forward Hostname / IP* : IP de la VM Docker · *Forward Port* : `3100`
- *Websockets Support* et *Block Common Exploits* activés
- Onglet **SSL** : certificat Let's Encrypt, *Force SSL* et HTTP/2 activés

NPM envoie `X-Forwarded-Proto: https`, que le nginx interne relaie tel quel :
c'est ce qui permet au cookie de session `Secure` d'être posé. **Ne pas** ajouter
`proxy_set_header X-Forwarded-Proto $scheme;` dans la configuration avancée de
NPM, sinon l'en-tête est réécrit en `http` et la connexion boucle indéfiniment.

### 9. Installer la PWA et vérifier

1. Ouvrir <https://cave.example.org/> : l'écran de connexion s'affiche, avec le
   logo de l'application. Si la connexion Google échoue, il l'explique
   simplement (« La connexion n’a pas abouti », puis quoi faire). L'écran ne
   montre que Google : le compte de secours s'ouvre par
   <https://cave.example.org/login?secours>, et la page de confidentialité
   (`/confidentialite`, publique pour Google) est liée depuis *Réglages → À propos*.
2. « Se connecter avec Google » puis rentrer une bouteille avec une vraie photo
   d'étiquette : la fiche doit arriver dans « À confirmer » en moins d'une
   minute.
3. **Journal → Exporter le classeur** : la bouteille figure dans la feuille
   `Stock`.
4. **Réglages → Moi → Installer l'application** : bouton « Installer
   l'application » sur Android, indication *Partager → Sur l'écran d'accueil*
   sur iPhone. L'icône est une niche voûtée en pierre claire où se tiennent
   trois bouteilles debout — Bordeaux, Champagne, Bourgogne
   (`web/public/icons/icon.svg`, déclinée en PNG 32, 192, 512, « maskable » pour
   Android et 180 pour iOS). Une application déjà installée garde son ancienne
   icône : la supprimer de l'écran d'accueil puis la réinstaller.

## Passages de version

À lire avant une mise à jour qui change de version mineure. Les sections
vont de la plus récente à la plus ancienne.

### Passage à la 2.27.0 (cases numérotées par casier)

Une migration, **additive** et appliquée toute seule au démarrage de l'api,
sans rien modifier ni supprimer : `20261025000000_cases_visuelles` ajoute aux
zones `cave_zone` la colonne `cell_prefix` (la lettre des cases, `NULL` sans
grille ; une lettre de A à Z, vérifiée par la contrainte
`cave_zone_cell_prefix_check`, unique parmi les zones non archivées d'une cave
grâce à l'index unique partiel `cave_zone_cave_id_cell_prefix_key`) et la
colonne `cell_boxes` (JSONB, `{}` par défaut : les positions des cases sur le
plan ; un objet JSON, vérifié par `cave_zone_cell_boxes_check`). Les
emplacements existants ne changent pas. Par précaution, sauvegarder avant la
mise à jour :

```bash
cd /opt/stacks/ma-cave && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > backups/cave-avant-2.27.0.sql.gz
```

**À faire après la mise à jour.** Les codes des cases sont désormais numérotés
par casier, rangée par rangée (C1…C48), et non plus « rangée + colonne » (B3) :
les zones à grille existantes n'ont ni lettre ni position et se lisent avec la
lettre A. Supprimer ces zones (*Réglages → Ma cave*), puis relancer l'analyse du
plan et accepter de nouveau les propositions, qui gardent leurs cases sur le plan.
Les bouteilles rangées dans une zone supprimée passent « sans emplacement » : les
noter avant (ou le faire tant que les zones sont presque vides), puis les ranger
de nouveau dans leur case.

**Retour arrière vers une image 2.26.x** (sans restaurer la sauvegarde) : les
colonnes `cell_prefix` et `cell_boxes` sont ignorées et les codes sont lus comme
« rangée + colonne ».

### Passage à la 2.24.0 (noms des cases)

Une migration, **additive** et appliquée toute seule au démarrage de l'api,
sans rien modifier ni supprimer : `20261024000000_noms_cases` ajoute aux zones
`cave_zone` la colonne `cell_names` (JSONB, `{}` par défaut : aucune case
nommée ; un objet JSON, vérifié par la contrainte `cave_zone_cell_names_check`).
Les emplacements existants ne changent pas. Aucune sauvegarde particulière
n'est nécessaire ; par précaution, sauvegarder comme d'habitude avant la mise à
jour :

```bash
cd /opt/stacks/ma-cave && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > backups/cave-avant-2.24.0.sql.gz
```

**Retour arrière vers une image 2.23.x** (sans restaurer la sauvegarde) : la
colonne `cell_names` est ignorée, les cases s'affichent de nouveau par leur
code ; les bouteilles rangées en saisissant un nom sont sous le code, donc
toujours au bon endroit.

### Passage à la 2.19.0 (modèle de l'IA dans l'Administration)

Une migration, **additive** et appliquée toute seule au démarrage de l'api,
sans rien modifier ni supprimer : `20261023000000_modele_gemini` ajoute au
journal des appels `gemini_call` la colonne `model` (nulle pour les appels
existants, affichés « — » dans le détail de la consommation). Aucune sauvegarde
particulière n'est nécessaire.

Par précaution, sauvegarder comme d'habitude avant la mise à jour :

```bash
cd /opt/stacks/ma-cave && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > backups/cave-avant-2.19.0.sql.gz
```

`GEMINI_PLAN_MODEL` est **retirée** : l'analyse des plans suit le modèle choisi
dans l'Administration. Une ligne `GEMINI_PLAN_MODEL=` restée dans le `.env` est
simplement ignorée (le démarrage n'échoue pas) ; la retirer à l'occasion.
`GEMINI_MODEL` reste la valeur de départ jusqu'au premier choix fait dans
*Administration › Coûts de l’IA*.

**Retour arrière vers une image 2.18.x** (sans restaurer la sauvegarde) : la
colonne `model` et le réglage `gemini_model` sont ignorés ; le modèle redevient
`GEMINI_MODEL` du `.env` (et `GEMINI_PLAN_MODEL` pour les plans, si elle y est
encore).

### Passage à la 2.17.0 (analyse du plan plus visible)

Une migration, **additive** et appliquée toute seule au démarrage de l'api,
sans rien modifier ni supprimer : `20261022000000_analyse_visible` ajoute sur
chaque plan la raison d'un échec d'analyse `analysis_error` (nulle pour les
plans existants) et la date de la demande d'analyse `analysis_requested_at`,
recopiée de `updated_at` pour les plans existants : une analyse encore en file
au moment de la mise à jour garde son identifiant et aboutit normalement.
Aucune sauvegarde particulière n'est nécessaire.

Par précaution, sauvegarder comme d'habitude avant la mise à jour :

```bash
cd /opt/stacks/ma-cave && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > backups/cave-avant-2.17.0.sql.gz
```

**Retour arrière vers une image 2.16.x** (sans restaurer la sauvegarde) : les
colonnes ajoutées sont ignorées. Un plan **créé ou dont la photo a été
remplacée** sous la 2.17.0 et encore en attente n'est pas analysé par la 2.16.x
(sa tâche ne porte pas la date attendue, et la reprise au démarrage retombe sur
le même identifiant) : il reste « en cours » ; remplacer sa photo relance
l'analyse. Un plan **relancé** sous la 2.17.0 est, lui, remis en file par la
reprise au démarrage de la 2.16.x et analysé normalement.

### Passage à la 2.16.0 (propositions de zones)

Deux migrations, **additives** et appliquées toutes seules au démarrage de
l'api, sans rien modifier ni supprimer : `20261021000000_propositions_zones`
(sur chaque plan, l'état de l'analyse `analysis_status`, à `NONE` pour les plans
existants, et les propositions `suggestions`, vides ; sur chaque zone, la grille
`grid_rows` et `grid_cols`, nulles, avec leur contrainte) et
`20261021010000_usage_analyse_plan` (le journal des appels Gemini accepte
l'usage `ANALYSE_PLAN`). Aucune sauvegarde particulière n'est nécessaire.
Les plans existants ne sont pas analysés : seule une photo envoyée ou
remplacée déclenche l'analyse. Les colonnes ajoutées sont ignorées d'une image 2.15.x, mais celle-ci ne
connaît pas l'usage `ANALYSE_PLAN` du journal des appels.

Par précaution, sauvegarder comme d'habitude avant la mise à jour :

```bash
cd /opt/stacks/ma-cave && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > backups/cave-avant-2.16.0.sql.gz
```

**Retour arrière vers une image 2.15.x** (sans restaurer la sauvegarde) : le
détail des coûts IA affiche le libellé brut `ANALYSE_PLAN` et omet cet usage des
barres (aucun plantage) ; les tâches d'analyse de plan ne sont pas traitées, les
plans restent « en cours » jusqu'à la mise à jour suivante, qui les remet en file.

### Passage à la 2.14.0 (plusieurs plans)

La migration `20261020000000_plusieurs_plans` crée la table `cave_plan` (nom,
image, taille), reprend le plan de chaque cave sous le nom **« Plan principal »**
(même fichier sous `plans/`, aucun fichier déplacé), rattache les repères des
zones à ce plan, puis **supprime les colonnes `plan_*` de `cave`**. Elle est
appliquée toute seule au démarrage de l'api. **Faire une sauvegarde avant la
mise à jour** (même commande qu'au passage à Ma Cave, fichier
`backups/cave-avant-2.14.0.sql.gz`). **Vérifier d'abord** qu'aucune cave n'a un
plan incomplet (la requête doit renvoyer 0 ligne, sinon corriger avant de
migrer) :

```bash
cd /opt/stacks/ma-cave && docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, name FROM cave WHERE plan_path IS NOT NULL AND (plan_width IS NULL OR plan_height IS NULL OR plan_updated_at IS NULL);"'
```

Puis sauvegarder et mettre à jour :

```bash
cd /opt/stacks/ma-cave && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > backups/cave-avant-2.14.0.sql.gz
docker compose pull && docker compose up -d
```

À l'écran : *Ma cave* affiche *Plans de la cave* avec un onglet
« Plan principal » (les repères sont où ils étaient) et *+ Ajouter un plan* ;
la fiche du vin et « À boire » indiquent le nom du plan. Seule donnée perdue :
les repères d'une cave dont le plan avait été retiré (gardés jusqu'ici mais
invisibles) sont effacés ; les zones, elles, restent. Les colonnes de `cave`
disparaissant, **une image 2.13.x ne tourne plus sur la base migrée** : le
retour arrière passe par la restauration de la sauvegarde, comme au passage à la
2.0.0 (« Retour arrière » plus bas) : arrêter l'api et le worker, vider le
schéma, restaurer, puis **remettre `IMAGE_TAG=2.13.0` dans le `.env` avant de
relancer** (sinon `latest` rejoue la migration) :

```bash
cd /opt/stacks/ma-cave && docker compose stop api worker
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
gunzip -c backups/cave-avant-2.14.0.sql.gz | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose up -d
```

Les images des plans créés après la mise à jour restent, inutilisées, sous
`plans/` dans le volume `photo_data`.

### Passage à Ma Cave (anciennement « cave-a-vin »)

L'application s'appelle désormais **Ma Cave** : le dépôt est `djkix/ma-cave`,
les images `ghcr.io/djkix/ma-cave-api` et `ghcr.io/djkix/ma-cave-web`, et la
stack vit dans `/opt/stacks/ma-cave`. Les anciennes images `cave-a-vin-*` ne
reçoivent plus de mise à jour. Le nom du dossier de la stack donne son nom aux
volumes Docker (`cave-a-vin_postgres_data` devient `ma-cave_postgres_data`) :
la base et les photos sont donc **copiées** dans les nouveaux volumes, les
anciens restant intacts tant qu'on ne les supprime pas.

```bash
# 1. Sauvegarde, puis arrêt de l'ancienne stack
cd /opt/stacks/cave-a-vin && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > backups/avant-ma-cave.sql.gz
docker compose down

# 2. Nouvelle stack : réglages, sauvegardes et compose
mkdir -p /opt/stacks/ma-cave && cp -a /opt/stacks/cave-a-vin/.env /opt/stacks/cave-a-vin/backups /opt/stacks/ma-cave/
curl -fsSL https://raw.githubusercontent.com/djkix/ma-cave/main/docker-compose.yml -o /opt/stacks/ma-cave/docker-compose.yml

# 3. Copie des données dans les volumes du nouveau nom
for v in postgres_data redis_data photo_data; do
  docker volume create ma-cave_$v
  docker run --rm -v cave-a-vin_$v:/from:ro -v ma-cave_$v:/to alpine sh -c 'cp -a /from/. /to/'
done

# 4. Démarrage
cd /opt/stacks/ma-cave && docker compose pull && docker compose up -d
```

**Avec Dockhand, sans terminal.** Plutôt que copier les données, la nouvelle
stack reprend les volumes de l'ancienne tels quels :

1. Vérifier dans les journaux du service `db-backup` de la stack `cave-a-vin`
   qu'une sauvegarde de la nuit existe (et, en plus, télécharger la sauvegarde
   Excel depuis *Réglages → Ma cave* sur le site). Copier les variables
   d'environnement (`.env`) de la stack, puis l'**arrêter** sans supprimer ses
   volumes.
2. Créer une stack `ma-cave` : coller le `docker-compose.yml` du dépôt, en
   remplaçant son bloc final `volumes:` par celui ci-dessous, puis coller les
   mêmes variables d'environnement.
3. *Pull* puis *Déployer*.

```yaml
volumes:
  postgres_data: { name: cave-a-vin_postgres_data, external: true }
  redis_data: { name: cave-a-vin_redis_data, external: true }
  photo_data: { name: cave-a-vin_photo_data, external: true }
```

Les volumes gardent leur ancien nom, sans conséquence. Les sauvegardes
automatiques partent dans le dossier `backups` de la nouvelle stack ; les
anciennes restent dans celui de `cave-a-vin` (à récupérer avant de le
supprimer). Une fois la nouvelle stack validée, supprimer l'ancienne stack dans
Dockhand **sans cocher la suppression des volumes**, puisqu'ils servent
toujours.

Vérifier ensuite la connexion, la version en haut à droite des Réglages et quelques
photos. La nouvelle stack apparaît d'elle-même dans Dockge (elle est dans
`/opt/stacks`). Quand tout est bon, quelques jours plus tard, supprimer
l'ancienne : `rm -rf /opt/stacks/cave-a-vin` puis
`docker volume rm cave-a-vin_postgres_data cave-a-vin_redis_data cave-a-vin_photo_data`.
L'adresse du site (`cave.example.org`) et le client OAuth Google ne changent pas.

### Passage à la 2.8.0 (plan de la cave)

La migration `20261017000000_plan_cave` est **additive** : elle ajoute à
`cave` les colonnes du plan (`plan_path`, `plan_width`, `plan_height`,
`plan_updated_at`) et aux zones celles du repère (`plan_x`, `plan_y`, avec la
contrainte `cave_zone_plan_position_check`), sans rien modifier ni supprimer.
**Faire tout de même une sauvegarde avant la mise à jour** (même commande
qu'au passage à la 2.0.0, fichier `backups/cave-avant-2.8.0.sql.gz`). Les
images des plans sont rangées sous `plans/` dans le volume `photo_data`, avec
les photos (même synchronisation vers le NAS). Une image 2.7.x peut encore tourner sur la base migrée (retour arrière
sans restauration) ; elle ignore le plan et les repères.

### Passage à la 2.7.0 (accords et descriptifs par lots)

Rien à faire : la migration `20261016000000_lots_accords` ajoute seulement
des colonnes et des index aux tables `pairing` et `producer_profile`, et date
les demandes déjà en attente pour qu'elles partent dans les premiers lots ;
**les accords et descriptifs en échec sont relancés une fois** (un descriptif
saisi à la main n'est jamais touché). Les
travaux d'accords ou de descriptifs restés dans Redis (ancienne file
`wine-pairing`) sont vidés par le worker **sans appeler Gemini** : chacun
s'assure seulement que sa demande existe en attente en base. Une image 2.6.x
peut encore tourner sur la base migrée (retour arrière sans restauration) ;
elle reviendrait aux appels un par un.

Le service `worker` du `docker-compose.yml` a désormais `stop_grace_period:
150s` : à l'arrêt ou à la mise à jour, un lot dont l'appel Gemini est en cours
(2 min au plus) se termine au lieu d'être coupé. Une stack créée à partir d'un
ancien fichier doit reprendre ce réglage ; sans lui, Docker arrête le worker
au bout de 10 s et le lot interrompu est repris 5 minutes plus tard, en
comptant une tentative.

### Passage à la 2.6.0 (zones de la cave)

Une migration crée les zones de la cave et y rattache les emplacements.
**Faire une sauvegarde avant la mise à jour** (même commande qu'au passage à
la 2.0.0, fichier `backups/cave-avant-2.6.0.sql.gz`). Les zones déjà saisies
sont **converties automatiquement** : une zone par cave et par nom distinct
(espaces autour et casse ignorés : « Cave 1 » et « cave 1 » deviennent une
seule zone, sous l'une des graphies saisies), rangées par nom ; chaque
bouteille garde le même emplacement et le même stock. Les indications et les
photos se renseignent ensuite dans *Ma cave*.

**Retour arrière** : seulement en restaurant cette sauvegarde (procédure du
retour arrière de la 2.0.0), ce qui **perd tout ce qui a été saisi depuis la
mise à jour** (entrées, sorties, déplacements, zones, notes, cotes). Une image
2.5.x **ne peut pas tourner sur la base migrée** : la migration supprime la
colonne `location.zone` (le nom vient désormais de la zone) que la 2.5.x lit.

**Si la migration échoue** (par exemple « l'emplacement … n'a ni zone, ni
casier, ni position »), elle est annulée en entier : la base reste au format
2.5.x. Mais `_prisma_migrations` garde une ligne en échec et l'api refuse de
démarrer tant qu'elle y est. Après avoir corrigé les données (ou en revenant à
l'image 2.5.x, qui fonctionne sur la base inchangée), marquer la migration
comme annulée, puis redémarrer :

```bash
cd /opt/stacks/ma-cave
docker compose run --rm api npx prisma migrate resolve --rolled-back 20261015000000_zones
docker compose up -d
```

(`run` et non `exec` : le conteneur de l'api, qui applique les migrations au
démarrage, s'arrête tant que la migration échoue.)

### Passage à la 2.2.0 (emplacements et cote)

Une migration ajoute les emplacements et les cotes ; les bouteilles existantes
sont toutes « Sans emplacement », rien d'autre ne change. **Faire une
sauvegarde avant la mise à jour** (même commande qu'au passage à la 2.0.0,
fichier `backups/cave-avant-2.2.0.sql.gz`). **Retour arrière** : possible en
remettant l'image 2.1.x tant qu'aucun déplacement n'a été enregistré ; dès
qu'un déplacement existe, la 2.1.x ne sait plus lire le journal — il faut alors
restaurer cette sauvegarde (procédure du retour arrière de la 2.0.0).

### Passage à la 2.0.0 (une cave par compte)

La 2.0.0 change le fonctionnement pour tous les comptes. **Vérifier d'abord
les comptes**, avant la mise à jour :

```bash
cd /opt/stacks/ma-cave && docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT email, is_admin, is_break_glass, status FROM app_user ORDER BY created_at;"'
```

Votre adresse Google doit apparaître avec `is_admin` = `t` et le statut
`ACTIVE`. Sinon, connectez-vous une fois avec Google avant de mettre à jour
(`ADMIN_EMAILS` pose `is_admin` à la connexion) : c'est ce compte qui recevra
la cave existante. **`ADMIN_EMAILS` doit donc être rempli dans le `.env`** avec
votre adresse Google.

**Déjà mis à jour et la cave est en lecture seule ?** C'est qu'aucun compte
administrateur n'existait : la cave a été créée sans propriétaire et votre
compte en est devenu membre. Ajoutez `ADMIN_EMAILS=admin@example.com` au
`.env`, relancez `docker compose up -d --force-recreate api worker`, puis
reconnectez-vous avec Google (« Se déconnecter » dans Réglages → Moi, ou
directement `https://votre-domaine/api/auth/google`) : le premier
administrateur qui se connecte reçoit la cave sans propriétaire.

**Faire ensuite une sauvegarde de la base**, juste avant la mise à jour, sans
attendre le dump quotidien de `db-backup` :

```bash
cd /opt/stacks/ma-cave && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > backups/cave-avant-2.0.0.sql.gz
```

Vérifier que le fichier n'est pas vide (`ls -la backups/`) ; il se restaure
comme les dumps quotidiens (voir *Sauvegarde et restauration*). Puis mettre à
jour comme d'habitude. Au démarrage, la migration, en une seule transaction :

- crée une cave **« Cave de {nom} »** appartenant au premier administrateur
  (le plus ancien compte administrateur actif qui n'est pas le compte de
  secours, sinon le compte de secours) et y rattache toutes les données
  existantes : vins, mouvements, photos, exports (si la base contient des
  données mais aucun compte, la cave attend son propriétaire : le premier
  administrateur qui se connecte la reçoit) ;
- fait des **autres comptes actifs des membres** de cette cave, **en lecture
  seule** (les comptes bloqués n'y sont pas ajoutés) : ils ne voient plus les
  prix d'achat et ne peuvent plus rien écrire. Pour qu'un de ces comptes
  retrouve une cave où il écrit, un administrateur lui crée la sienne
  (*Créer sa cave*) ;
- règle la part de budget par cave à 20 %.

**Compte de secours** : la migration l'inscrit comme membre de votre cave,
mais depuis la 2.1.0 il y a les droits du propriétaire (entrées, sorties,
journal, prix) : pendant une panne de Google, il permet de continuer à tenir
la cave.

Aucune variable d'environnement n'est ajoutée. Après la mise à jour, les
nouvelles adresses Google qui se connectent attendent une validation dans
*Inscriptions*.

Vérifier après la mise à jour que la cave appartient bien à votre adresse
Google :

```bash
cd /opt/stacks/ma-cave && docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT c.name, u.email FROM cave c LEFT JOIN app_user u ON u.id = c.owner_id;"'
```

**Retour arrière** : le schéma de la 1.9.0 ne sait pas lire la base migrée,
il faut donc restaurer la sauvegarde prise juste avant la mise à jour. Les
tables propres à la 2.0.0 (`cave`, `cave_member`, `app_setting`) ne figurent
pas dans cette sauvegarde et bloqueraient sa restauration : on vide d'abord le
schéma. Arrêter l'api et le worker, vider le schéma, restaurer, remettre
`IMAGE_TAG=1.9.0` dans le `.env`, puis relancer :

```bash
cd /opt/stacks/ma-cave && docker compose stop api worker
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
gunzip -c backups/cave-avant-2.0.0.sql.gz | docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose up -d
```

## Notes de développement

Les index uniques partiels (`idx_movement_reverses_id`,
`idx_movement_photo_in`, `idx_movement_photo_out`, `idx_guard_override_all_colors`,
`idx_guard_override_color`, `cave_member_one_owner_idx`,
`cave_zone_cave_id_name_key` sur `(cave_id, lower(name))` des zones non
archivées), l'index unique sur expressions `location_place_key` (cave, zone,
casier et position en minuscules), les contraintes CHECK
(`location_not_empty_check`, `cave_zone_name_length_check`,
`cave_zone_indication_length_check`, `cave_zone_plan_position_check` (repère
d'une zone : les deux coordonnées nulles, ou les deux entre 0 et 1),
`price_quote_cote_cents_check`,
`price_quote_n_transactions_check`, celles de `gemini_call`) et la fonction de
déclencheur `check_stock_non_negative` ne sont pas exprimables dans le schéma
Prisma :
créer les futures migrations avec `npx prisma migrate dev --create-only` et
conserver ce SQL écrit à la main, sinon Prisma proposera de le supprimer.

## Limites

- **Un membre ne peut rien écrire** : la lecture seule est le seul rôle
  d'invité, il n'existe pas de membre qui rentre ou sort des bouteilles dans
  la cave d'un autre. Une cave n'a qu'un propriétaire, et la propriété ne se
  transfère pas depuis l'interface.
- **Une seule cave possédée par compte** : un compte peut être membre de
  plusieurs caves, mais n'est propriétaire que d'une. Une cave ne se supprime
  pas depuis l'interface.
- **Descriptifs de domaine communs à toutes les caves** : un seul texte par
  domaine, écrit ou régénéré par un administrateur seulement ; un propriétaire
  ne peut pas avoir sa propre version. Il en va de même du référentiel des
  appellations et des règles d'apogée.
- **Pas d'e-mail** : ni l'inscription validée, ni l'invitation ne sont
  annoncées par e-mail ; la personne invitée se connecte simplement avec
  l'adresse invitée.
- **Mesure « zéro saisie » à partir de la 1.5.0** : les entrées antérieures
  n'ont pas gardé leur fiche confirmée et ne comptent pas. Une entrée confirmée
  avant la fin de l'analyse est comparée à un formulaire vide : la lecture
  arrivée ensuite n'a pas été montrée.
- **La cote est saisie à la main, jamais relevée automatiquement** :
  l'application ne contacte iDealwine, Wine-Searcher ni Vivino à aucun moment,
  elle se contente de liens vers les pages à consulter : leurs conditions
  d'utilisation encadrent ou interdisent la collecte automatique. Les [conditions générales d'iDealwine](https://www.idealwine.com/en/corporate/conditions_generales)
  interdisent de copier leur base, cotes courantes et historiques comprises,
  sans autorisation préalable ; un relevé automatique (session authentifiée,
  lecture par sélecteurs CSS) aurait exigé cette autorisation, qui n'a pas été
  demandée. La cote n'est donc jamais à jour toute seule : elle vaut ce que le
  propriétaire y reporte, à la date qu'il indique, et seulement pour les vins
  qu'il prend la peine de coter. L'écart achat / marché par vin, prévu au
  cahier des charges, n'est pas affiché (seule la valeur à la cote l'est, dans
  les statistiques). La fenêtre des mouvements est fixe (12 mois).
- **Accords suggérés, jamais saisis** : les plats viennent de Gemini et ne se
  corrigent pas un à un (seulement *Régénérer*) ; aucun accord « vécu » n'est
  enregistré. Une régénération remplace le coût de la précédente dans le
  plafond du mois. Le coût d'un lot est réparti exactement sur les vins
  enregistrés (les premiers portent le centime restant : la somme vaut le
  coût de l'appel) ; une réponse de lot entièrement inexploitable n'est
  comptée que dans le journal `gemini_call`, pas dans le plafond. Le coût d'un
  lot de photos d'entrée est réparti de même sur ses photos.
- **Une seule note par vin**, sans commentaire ni historique.
- **Descriptif du domaine limité par ce que Gemini sait** : pour un petit
  domaine, la connaissance de Gemini est parfois incomplète ou erronée — d'où
  le disclaimer et la possibilité de saisir un texte manuel. Un seul texte par
  domaine, partagé par clé d'orthographe (accents et casse ignorés) : deux
  producteurs réellement distincts mais portant le même nom partagent le même
  descriptif.
- **Référentiel des appellations** : 145 AOC sont chargées au démarrage (sur
  environ 360 reconnues par l'INAO). Une appellation absente du référentiel est
  conservée telle qu'elle a été lue ou saisie ; seule une correspondance quasi
  exacte (similarité ≥ 0,8) réécrit le libellé avec le nom canonique.
- **`GEMINI_MONTHLY_CAP_CENTS` est un plafond approximatif** : le coût par appel
  est une estimation à l'ordre de grandeur, pas une facturation réelle. Le
  réglage se comporte donc comme un nombre maximum de photos par mois.
- **Compte de secours** : `BREAK_GLASS_EMAIL` / `BREAK_GLASS_PASSWORD` vides =
  connexion Google uniquement. Le compte de secours a les droits du
  propriétaire sur la cave de l'administrateur principal (le plus ancien
  administrateur actif qui n'est pas le compte de secours), quelle que soit
  sa ligne de membre : pendant une panne de Google, il permet de saisir
  entrées et sorties. Il n'a pas d'autre droit sur les autres caves.
- **Blocage de compte manuel** : il n'y a pas de modération automatique ; un
  administrateur doit bloquer un compte indésirable depuis `/admin`. Le blocage
  prend effet dès la requête suivante (la session en cours cesse de
  fonctionner), il n'attend pas une prochaine connexion.
- **Réessai borné dans le temps** : une photo reportée est reprise pendant
  environ dix jours (1 000 tentatives au plafond de 15 minutes). Au-delà, elle
  passe en échec et attend une saisie manuelle — un travail qui ne meurt jamais
  finirait par masquer une panne réelle. Exceptions : un report pour budget
  (plafond mensuel ou part de la cave atteints) est repris sans limite, toutes
  les 15 minutes, et ne passe jamais en échec ; une pause commune de Gemini
  (après un 503 ou un 429) ne consomme aucune tentative, la reprise attend
  simplement la fin de la pause. Les accords et les descriptifs sont repris
  pendant 7 jours de panne (réseau, 5xx, 503, 429, clé refusée), à intervalles
  de 5 min à 6 h, sans consommer de tentative ; seules 5 réponses
  inexploitables (ou 5 lots interrompus par un arrêt du worker) les font
  échouer plus tôt — *Régénérer* les relance ensuite. Une pause ou le plafond
  atteint ne comptent jamais.
- **Pause commune grossière** : la pause vaut pour tous les usages à la fois
  (un quota épuisé sur les lectures suspend aussi les accords), et le journal
  `gemini_call` n'est pas rattaché à une cave : il est réservé à
  l'administrateur et sans purge automatique.
- **Pas de relance manuelle d'une analyse** : il n'y a pas de bouton
  « réanalyser » sur une photo en échec définitif ; la saisie manuelle prend le
  relais, et reprendre la photo crée simplement une nouvelle entrée.
- **La reconnaissance ne départage pas seule deux millésimes** quand l'année
  n'est pas lisible sur l'étiquette : la sortie par photo propose alors le
  choix sur vignettes plutôt que de deviner.
- **Qualité des millésimes non pré-remplie** : tant qu'une région n'a pas été
  qualifiée depuis l'administration, tous ses millésimes comptent pour
  « moyen » (facteur 1,0).
- **Pas d'estimation d'apogée pour les vins non millésimés** : la fiche
  l'indique et ne propose que la saisie manuelle.
- **Pas d'alerte hors de l'application** : la liste « à boire en priorité » se
  consulte, elle ne prévient pas (choix assumé).
- **Emplacements sans quantité propre** : la zone se choisit dans la liste des
  zones de la cave, casier et position sont du texte libre (40 caractères
  chacun), sans plan de cave ni capacité ;
  aucune quantité n'est stockée par emplacement, c'est toujours le journal des
  mouvements qui fait foi, le détail par emplacement est recalculé à la
  lecture. Un emplacement est strictement **par cave** : deux caves peuvent
  avoir chacune un « Garage », ce sont deux emplacements distincts, et un
  identifiant d'emplacement d'une autre cave répond 404. Un inventaire en
  baisse qu'aucun emplacement seul ne couvre (par exemple compter 0 alors que
  les bouteilles sont réparties à deux endroits) est refusé (409) : il n'y a
  pas d'inventaire réparti sur plusieurs emplacements en un seul geste.
- **Après « Annuler »**, le panneau de sortie de la fiche vin reste sur
  « Sortie annulée » jusqu'à ce qu'on quitte la page (pas de retour
  automatique à l'écran de sortie).
- **Envoi des photos d'entrée seulement application ouverte** : l'envoyeur en
  arrière-plan tourne tant que l'onglet ou la PWA est ouvert, il n'y a pas de
  synchronisation en arrière-plan une fois l'application fermée — les photos
  prises partent dès la réouverture.
- **Analyse par lot plus lente qu'une analyse unitaire** : le résultat met en
  général de 15 s à 1 min à apparaître dans « À confirmer », le temps qu'un lot
  se forme (8 photos, ou 45 s d'attente) puis soit traité par le passage
  suivant du worker (toutes les 15 s).
- **L'écran de confirmation par photo subsiste uniquement pour la saisie
  manuelle** d'une photo en « Lecture impossible » ; la rafale et « À
  confirmer » ne l'utilisent plus pour le flux normal.
- **Pas de notification temps réel pour les entrées** : contrairement à la
  sortie par photo, la liste « À confirmer » ne suit pas l'avancement de
  l'analyse par flux SSE, elle se rafraîchit toutes les 10 s.
- **Open Food Facts connaît rarement les petits domaines** : la recherche
  d'image n'y trouve souvent rien pour une cave de particuliers, et passe au
  site officiel.
- **Le site officiel montre souvent la gamme ou le domaine plutôt que
  l'étiquette exacte du millésime** : l'image trouvée ressemble à la bouteille
  sans forcément être le même millésime.
- **Les images trouvées sur le web appartiennent à leurs auteurs** : usage
  raisonnable pour une cave privée, la source reste toujours affichée et
  citée.
- **La version d'affichage d'une photo n'est pas refabriquée** si la photo est
  analysée de nouveau plus tard : elle garde le cadrage de la première
  lecture.
