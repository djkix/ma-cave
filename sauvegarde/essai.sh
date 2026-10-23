#!/bin/sh
# Essai du script de sauvegarde, dans l'image : faux pg_dump et psql, cible, photos et pile factices dans /tmp.
# Usage : docker run --rm --entrypoint sh ghcr.io/djkix/ma-cave-sauvegarde:essai /app/essai.sh
set -u
APP="${APP:-/app}"
R=/tmp/essai-sauvegarde
rm -rf "$R"
mkdir -p "$R/bin" "$R/nas" "$R/photos/plans" "$R/pile"

cat > "$R/bin/pg_dump" <<'FIN'
#!/bin/sh
[ "${FAUX_PG_ECHEC:-0}" = 1 ] && exit 1
echo "$*" > "${0%/bin/pg_dump}/pg_dump.args"
while [ $# -gt 0 ]; do
  if [ "$1" = -f ]; then echo dump > "$2"; exit 0; fi
  shift
done
exit 1
FIN
cat > "$R/bin/psql" <<FIN
#!/bin/sh
[ "\${FAUX_PSQL_ECHEC:-0}" = 1 ] && exit 2
case "\$*" in *backup_request*) [ "\${FAUX_DEMANDE:-0}" = 1 ] && echo 1; exit 0 ;; esac
echo "\$*" >> "$R/sql.log"
FIN
chmod +x "$R/bin/pg_dump" "$R/bin/psql"
echo compose > "$R/pile/compose.yaml"
echo env > "$R/pile/.env"
echo a > "$R/photos/a.jpg"
echo p > "$R/photos/plans/p.jpg"

echec() { echo "ÉCHEC : $1" >&2; cat "$R/out.log" >&2; exit 1; }
nuit() {
  AUJOURDHUI="$1" CIBLE="$R/nas" PHOTOS="${PHOTOS_ESSAI:-$R/photos}" PILE="${PILE_ESSAI:-$R/pile}" DATABASE_URL=postgresql://faux \
    PATH="$R/bin:$PATH" "$APP/sauvegarder.sh" > "$R/out.log" 2>&1
}
inode() { stat -c %i "$1"; }
dates() { ls -d "$R/nas"/????-??-?? 2>/dev/null | sed 's|.*/||' | tr '\n' ' '; }

# première nuit
nuit 2026-10-01 || echec "première nuit : code $?"
for f in base/cave.dump photos/a.jpg photos/plans/p.jpg config/compose.yaml config/.env sauvegarde.txt; do
  [ -f "$R/nas/2026-10-01/$f" ] || echec "première nuit : $f absent"
done
[ "$(readlink "$R/nas/derniere")" = 2026-10-01 ] || echec "première nuit : lien derniere"
grep -q true "$R/sql.log" || echec "première nuit : tentative non inscrite"
grep -q backup_run "$R/sql.log" || echec "première nuit : table backup_run"
grep -q -- '--lock-wait-timeout=10min' "$R/pg_dump.args" || echec "pg_dump sans délai d'attente des verrous"

# photo inchangée : lien physique
echo b > "$R/photos/b.jpg"
nuit 2026-10-02 || echec "deuxième nuit : code $?"
[ "$(inode "$R/nas/2026-10-01/photos/a.jpg")" = "$(inode "$R/nas/2026-10-02/photos/a.jpg")" ] || echec "photo inchangée : pas de lien physique"
[ -f "$R/nas/2026-10-02/photos/b.jpg" ] && [ ! -e "$R/nas/2026-10-01/photos/b.jpg" ] || echec "nouvelle photo"

# photo disparue : absente du jour, présente la veille
rm "$R/photos/a.jpg"
nuit 2026-10-03 || echec "troisième nuit : code $?"
[ ! -e "$R/nas/2026-10-03/photos/a.jpg" ] && [ -f "$R/nas/2026-10-02/photos/a.jpg" ] || echec "photo disparue"

# même jour : remplacé
nuit 2026-10-03 || echec "même jour : code $?"
[ "$(dates)" = "2026-10-01 2026-10-02 2026-10-03 " ] || echec "même jour : $(dates)"
[ ! -e "$R/nas/.remplace" ] || echec "même jour : .remplace laissé"

# compose de l'installation par curl : docker-compose.yml
mv "$R/pile/compose.yaml" "$R/pile/docker-compose.yml"
nuit 2026-10-04 || echec "docker-compose.yml : code $?"
[ -f "$R/nas/2026-10-04/config/docker-compose.yml" ] || echec "docker-compose.yml absent"

# sept jours
for j in 05 06 07 08 09 10; do nuit "2026-10-$j" || echec "nuit du $j : code $?"; done
[ "$(dates)" = "2026-10-04 2026-10-05 2026-10-06 2026-10-07 2026-10-08 2026-10-09 2026-10-10 " ] || echec "sept jours : $(dates)"

# échec des photos : rien n'est supprimé
(PHOTOS_ESSAI="$R/absent" nuit 2026-10-11) && echec "échec des photos : code 0"
[ "$(dates)" = "2026-10-04 2026-10-05 2026-10-06 2026-10-07 2026-10-08 2026-10-09 2026-10-10 " ] || echec "échec des photos : $(dates)"
[ "$(readlink "$R/nas/derniere")" = 2026-10-10 ] || echec "échec des photos : lien derniere"
tail -1 "$R/sql.log" | grep -q false || echec "échec des photos : non inscrit"
tail -1 "$R/sql.log" | grep -q 'étape photos' || echec "échec des photos : message"

# échec de la base
(FAUX_PG_ECHEC=1 nuit 2026-10-11) && echec "échec de la base : code 0"
tail -1 "$R/sql.log" | grep -q 'étape base' || echec "échec de la base : message"

# pile sans fichier compose : échec de la configuration
mkdir -p "$R/pile-vide" && echo env > "$R/pile-vide/.env"
(PILE_ESSAI="$R/pile-vide" nuit 2026-10-11) && echec "pile sans compose : code 0"
tail -1 "$R/sql.log" | grep -q 'étape config' || echec "pile sans compose : message"

# reste d'une tentative interrompue
mkdir -p "$R/nas/.en-cours/vieux"
nuit 2026-10-11 || echec "après interruption : code $?"
[ ! -e "$R/nas/.en-cours" ] || echec "reste d'une tentative interrompue"
[ "$(dates)" = "2026-10-05 2026-10-06 2026-10-07 2026-10-08 2026-10-09 2026-10-10 2026-10-11 " ] || echec "après interruption : $(dates)"

# inscription impossible : code de sortie de la sauvegarde conservé
(FAUX_PSQL_ECHEC=1 nuit 2026-10-12) || echec "inscription impossible : code $?"
[ -d "$R/nas/2026-10-12" ] || echec "inscription impossible : dossier absent"

# déjà en cours : une deuxième tentative s'arrête sans toucher à rien
lignes="$(wc -l < "$R/sql.log")"
mkdir -p "$R/nas/.en-cours/temoin"
(
  exec 9> "$R/verrou"
  flock -n 9 || exit 3
  VERROU="$R/verrou" nuit 2026-10-13 && exit 1
  exit 0
) || echec "déjà en cours : la deuxième tentative a tourné"
grep -q 'déjà en cours' "$R/out.log" || echec "déjà en cours : message"
[ -d "$R/nas/.en-cours/temoin" ] || echec "déjà en cours : .en-cours supprimé"
[ ! -e "$R/nas/2026-10-13" ] || echec "déjà en cours : dossier créé"
[ "$(wc -l < "$R/sql.log")" = "$lignes" ] || echec "déjà en cours : tentative inscrite"

# planifier : une demande de l'Administration lance une sauvegarde à toute heure ; sans demande, rien avant HEURE
printf '#!/bin/sh\necho fait >> "%s/fait"\n' "$R" > "$R/bin/faux-sauvegarder"
chmod +x "$R/bin/faux-sauvegarder"
planifier() {
  HEURE=24 CIBLE="$R/nas" DATABASE_URL=postgresql://faux PATH="$R/bin:$PATH" SAUVEGARDER="$R/bin/faux-sauvegarder" \
    timeout 2 "$APP/planifier.sh" > "$R/out.log" 2>&1
}
(FAUX_DEMANDE=1 planifier)
[ "$(cat "$R/fait" 2>/dev/null)" = fait ] || echec "planifier : demande non prise"
rm -f "$R/fait"
planifier
[ ! -e "$R/fait" ] || echec "planifier : sauvegarde sans demande avant l'heure"

rm -rf "$R"
echo "Essai de la sauvegarde réussi."
