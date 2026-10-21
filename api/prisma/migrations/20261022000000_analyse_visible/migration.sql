-- Analyse du plan plus visible : raison d'un échec et horodatage de la demande
-- d'analyse sur chaque plan. Ajout seulement.

-- 1. Raison d'un échec d'analyse (GEMINI, BUDGET, IMAGE, ILLISIBLE, ERREUR),
-- NULL tant que l'analyse n'a pas échoué. Plans existants : NULL.
ALTER TABLE "cave_plan" ADD COLUMN "analysis_error" TEXT;

-- 2. Dernière demande d'analyse (envoi, remplacement ou relance) : jeton de
-- garde de l'écriture du résultat et identifiant de la tâche. Plans existants :
-- la date de leur image, valeur qui servait jusqu'ici à ces deux usages (une
-- tâche encore en file garde ainsi son identifiant).
ALTER TABLE "cave_plan" ADD COLUMN "analysis_requested_at" TIMESTAMP(3);
UPDATE "cave_plan" SET "analysis_requested_at" = "updated_at";
ALTER TABLE "cave_plan"
  ALTER COLUMN "analysis_requested_at" SET NOT NULL,
  ALTER COLUMN "analysis_requested_at" SET DEFAULT CURRENT_TIMESTAMP;
