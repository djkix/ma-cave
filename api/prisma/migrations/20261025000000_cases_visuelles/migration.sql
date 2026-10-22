-- Cases visuelles : une lettre par zone à grille (cell_prefix, « C » → codes
-- C1…C48, rangée par rangée), unique parmi les zones actives d'une cave, NULL
-- sans grille ; positions des cases sur le plan de la zone (cell_boxes, objet
-- { code: [x0, y0, x1, y1] } en fractions de l'image). Ajout seulement ; zones
-- existantes : aucune lettre (NULL), aucune position ({}).
ALTER TABLE "cave_zone" ADD COLUMN "cell_prefix" TEXT;
ALTER TABLE "cave_zone" ADD CONSTRAINT "cave_zone_cell_prefix_check" CHECK ("cell_prefix" IS NULL OR "cell_prefix" ~ '^[A-Z]$');
CREATE UNIQUE INDEX "cave_zone_cave_id_cell_prefix_key" ON "cave_zone" ("cave_id", "cell_prefix") WHERE "archived_at" IS NULL AND "cell_prefix" IS NOT NULL;
ALTER TABLE "cave_zone" ADD COLUMN "cell_boxes" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "cave_zone" ADD CONSTRAINT "cave_zone_cell_boxes_check" CHECK (jsonb_typeof("cell_boxes") = 'object');
