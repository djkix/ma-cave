-- Sauvegarde vers le NAS : tentatives (écrites par le service sauvegarde, lues
-- par l'Administration) et demandes « Sauvegarder maintenant ». Ajout seulement.
CREATE TABLE "backup_run" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "backup_run_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "backup_run_finished_at_idx" ON "backup_run"("finished_at");

CREATE TABLE "backup_request" (
    "id" SERIAL NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_request_pkey" PRIMARY KEY ("id")
);
