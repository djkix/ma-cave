#!/bin/sh
# Une sauvegarde vers le NAS : base, puis photos, puis configuration de la stack, dans un dossier daté.
# Sept jours gardés ; une photo inchangée est un lien physique vers celle de la veille. Sans chiffrement.
# Une tentative ratée ne supprime rien. Chaque tentative est inscrite dans la table backup_run, lue par
# l'Administration. Usage : /app/sauvegarder.sh (lancé par planifier.sh, ou à la main). Sort en 0 si tout a réussi.
set -u
APP="${APP:-/app}"
CIBLE="${CIBLE:-/nas}"
PHOTOS="${PHOTOS:-/data/photos}"
PILE="${PILE:-/stack}"
GARDER="${GARDER:-7}"
: "${DATABASE_URL:?DATABASE_URL manquante}"
JOUR="${AUJOURDHUI:-$(date +%F)}"
DEBUT="$(date +%s)"
DEBUT_LISIBLE="$(date -Iseconds)"
TMP="$CIBLE/.en-cours"
MESSAGE=""
umask 022

# Une seule sauvegarde à la fois (planifiée et à la main partagent le /tmp du conteneur) ; rien n'est inscrit.
exec 9> "${VERROU:-/tmp/sauvegarde.verrou}"
flock -n 9 || { echo "Sauvegarde déjà en cours : rien n'est fait." >&2; exit 1; }

# Message technique seulement : jamais de contenu de la cave.
echouer() { MESSAGE="étape $1 (code $2)"; return 1; }

# Le fichier compose de la stack (Dockge écrit compose.yaml, l'installation par curl docker-compose.yml) et le .env.
copier_config() {
  trouve=0
  for f in compose.yaml compose.yml docker-compose.yml docker-compose.yaml; do
    if [ -f "$PILE/$f" ]; then
      cp "$PILE/$f" "$TMP/config/" || return
      trouve=1
    fi
  done
  [ "$trouve" = 1 ] || return 2
  cp "$PILE/.env" "$TMP/config/"
}

sauvegarder() {
  rm -rf "$TMP" && mkdir -p "$TMP/base" "$TMP/config" || echouer base $? || return
  # La base d'abord : toute photo qu'elle référence sera dans les photos copiées ensuite.
  # Une table verrouillée ne bloque pas la nuit : pg_dump abandonne au bout de 10 minutes.
  pg_dump -Fc --lock-wait-timeout=10min --dbname="$DATABASE_URL" -f "$TMP/base/cave.dump" || echouer base $? || return
  # Sans propriétaire ni groupe : le NAS les écrase (squash) ; la restauration remet le compte node (1000).
  set -- -rlt
  [ -d "$CIBLE/derniere/photos" ] && set -- "$@" --link-dest="$CIBLE/derniere/photos"
  rsync "$@" "$PHOTOS/" "$TMP/photos/" || echouer photos $? || return
  copier_config || echouer config $? || return
  {
    echo "version : ${APP_VERSION:-inconnue}"
    echo "début : $DEBUT_LISIBLE"
    echo "fin : $(date -Iseconds)"
    echo "base : $(wc -c < "$TMP/base/cave.dump") octets"
    echo "photos : $(find "$TMP/photos" -type f | wc -l) fichiers"
  } > "$TMP/sauvegarde.txt" || echouer config $? || return
  # Une deuxième sauvegarde le même jour remplace celle du jour.
  if [ -e "$CIBLE/$JOUR" ]; then
    rm -rf "$CIBLE/.remplace" && mv "$CIBLE/$JOUR" "$CIBLE/.remplace" || echouer rotation $? || return
  fi
  mv "$TMP" "$CIBLE/$JOUR" || echouer rotation $? || return
  rm -rf "$CIBLE/.remplace"
  # Lien relatif : lisible depuis le NAS comme depuis le conteneur.
  ln -sfn "$JOUR" "$CIBLE/derniere" || echouer rotation $? || return
  ls -d "$CIBLE"/????-??-?? | sort -r | tail -n +"$((GARDER + 1))" | while read -r vieux; do
    rm -rf "$vieux"
  done
}

if sauvegarder; then
  REUSSIE=true
  echo "Sauvegarde du $JOUR réussie."
else
  REUSSIE=false
  echo "Sauvegarde en échec : $MESSAGE." >&2
fi
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "INSERT INTO backup_run (started_at, finished_at, succeeded, message) \
VALUES (to_timestamp($DEBUT) AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC', $REUSSIE, '$MESSAGE')" > /dev/null \
  || echo "Inscription de la sauvegarde impossible : l'Administration alertera si rien ne réussit en 36 h." >&2
[ "$REUSSIE" = true ]
