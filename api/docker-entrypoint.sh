#!/bin/sh
# Démarre en root le temps de remettre au compte `node` le dossier des photos,
# puis abandonne les droits root avant de lancer l'api ou le worker.
#
# Les images antérieures tournaient en root : un volume `photo_data` existant
# contient donc des fichiers appartenant à root, que `node` ne pourrait plus
# écrire. Le `chown -R` n'a lieu que si un fichier n'appartient pas à `node`,
# c'est-à-dire en pratique une seule fois, au premier démarrage après la mise
# à jour.
set -eu

if [ "$(id -u)" = "0" ]; then
  dir="${PHOTO_STORAGE_DIR:-/data/photos}"
  mkdir -p "$dir"
  if [ -n "$(find "$dir" ! -user node | head -n 1)" ]; then
    echo "entrypoint : $dir remis au compte node"
    chown -R node:node "$dir"
  fi
  exec su-exec node "$@"
fi

exec "$@"
