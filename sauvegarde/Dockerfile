# Sauvegarde vers le NAS : client PostgreSQL 16 (même version majeure que la base), rsync ; aucun Node.
# flock et timeout viennent de busybox.
FROM alpine:3.22
RUN apk upgrade --no-cache && apk add --no-cache postgresql16-client rsync tzdata tini
COPY --chmod=755 sauvegarder.sh planifier.sh essai.sh /app/
# Même libellé de version que l'api et la coque (VITE_APP_VERSION, voir docker-build.yml), noté dans sauvegarde.txt.
ARG VITE_APP_VERSION=dev
ENV APP_VERSION=$VITE_APP_VERSION TZ=Europe/Paris
LABEL org.opencontainers.image.source=https://github.com/djkix/ma-cave
# root : la pile (compose, .env) peut n'être lisible que par root sur l'hôte. Tout est monté en lecture seule,
# sauf le NAS ; le service n'a aucune route vers Internet.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/planifier.sh"]
