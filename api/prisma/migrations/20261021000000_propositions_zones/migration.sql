-- Propositions de zones à partir de la photo du plan : état de l'analyse et
-- propositions en attente sur chaque plan, grille de cases sur chaque zone.
-- Ajout seulement : plans existants `NONE` sans proposition, zones sans grille.

-- 1. Plan : état de l'analyse de sa photo (NONE pour les plans existants) et
-- propositions en attente, chacune { id, kind, name, box, rows, cols }.
ALTER TABLE "cave_plan"
  ADD COLUMN "analysis_status" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "suggestions" JSONB NOT NULL DEFAULT '[]',
  ADD CONSTRAINT "cave_plan_analysis_status_check" CHECK ("analysis_status" IN ('NONE', 'PENDING', 'DONE', 'FAILED'));

-- 2. Zone : grille de cases (lignes A à Z, colonnes 1 à 30), toutes deux nulles
-- ou toutes deux renseignées. Les IS NOT NULL comptent : une seule valeur nulle
-- rendrait la condition inconnue (NULL), qu'un CHECK accepte.
ALTER TABLE "cave_zone"
  ADD COLUMN "grid_rows" INTEGER,
  ADD COLUMN "grid_cols" INTEGER,
  ADD CONSTRAINT "cave_zone_grid_check" CHECK (
    ("grid_rows" IS NULL AND "grid_cols" IS NULL)
    OR ("grid_rows" IS NOT NULL AND "grid_cols" IS NOT NULL AND "grid_rows" BETWEEN 1 AND 26 AND "grid_cols" BETWEEN 1 AND 30)
  );
