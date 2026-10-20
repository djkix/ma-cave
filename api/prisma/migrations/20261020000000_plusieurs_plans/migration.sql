-- Plusieurs plans par cave : chaque plan a son nom, son image et ses repères ;
-- une zone porte au plus un repère, donc sur un seul plan. Le plan existant
-- d'une cave devient « Plan principal » (même fichier, aucun fichier déplacé).
--
-- Sauvegarder la base avant d'appliquer cette migration : elle supprime les
-- colonnes de plan de `cave` une fois les plans repris, et efface les repères
-- des zones d'une cave sans plan (ils n'étaient plus visibles).

-- 1. Plans, propres à chaque cave.
--   path          : image relative à PHOTO_STORAGE_DIR (`plans/<id>.jpg`) ;
--   width/height  : taille en pixels après normalisation ;
--   updated_at    : dernier envoi de l'image (relecture du cache) ;
--   created_at    : ordre des onglets.
-- Nom unique par cave sans tenir compte de la casse. L'index (id, cave_id) sert
-- la clé étrangère composite des zones : un repère ne pointe que vers un plan
-- de la même cave.
CREATE TABLE "cave_plan" (
  "id" UUID NOT NULL,
  "cave_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  CONSTRAINT "cave_plan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cave_plan_cave_id_fkey" FOREIGN KEY ("cave_id") REFERENCES "cave"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cave_plan_name_length_check" CHECK (char_length("name") BETWEEN 1 AND 40)
);
CREATE UNIQUE INDEX "cave_plan_cave_id_name_key" ON "cave_plan" ("cave_id", lower("name"));
CREATE UNIQUE INDEX "cave_plan_id_cave_id_key" ON "cave_plan" ("id", "cave_id");

-- 2. Reprise : le plan d'une cave devient « Plan principal », avec son chemin,
-- sa taille et sa date (aussi date de création : premier onglet).
INSERT INTO "cave_plan" ("id", "cave_id", "name", "path", "width", "height", "updated_at", "created_at")
SELECT gen_random_uuid(), "id", 'Plan principal', "plan_path", "plan_width", "plan_height", "plan_updated_at", "plan_updated_at"
FROM "cave"
WHERE "plan_path" IS NOT NULL;

-- 3. Plan du repère d'une zone : celui de sa cave (au plus un à ce stade).
ALTER TABLE "cave_zone" ADD COLUMN "plan_id" UUID;
UPDATE "cave_zone" z SET "plan_id" = p."id" FROM "cave_plan" p WHERE p."cave_id" = z."cave_id" AND z."plan_x" IS NOT NULL;

-- 4. Repères d'une cave sans plan (plan retiré auparavant, repères gardés) :
-- effacés. Seule donnée perdue ; elle n'était plus visible.
UPDATE "cave_zone" SET "plan_x" = NULL, "plan_y" = NULL WHERE "plan_x" IS NOT NULL AND "plan_id" IS NULL;

-- 5. Clé étrangère composite, sans cascade : le service efface les repères des
-- zones d'un plan, dans la même transaction, avant de supprimer ce plan.
ALTER TABLE "cave_zone" ADD CONSTRAINT "cave_zone_plan_id_cave_id_fkey"
  FOREIGN KEY ("plan_id", "cave_id") REFERENCES "cave_plan"("id", "cave_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- 6. Repère : plan, x et y tous nuls, ou tous renseignés avec x et y entre 0 et
-- 1. Les IS NOT NULL comptent : une seule valeur nulle rendrait la condition
-- inconnue (NULL), qu'un CHECK accepte.
ALTER TABLE "cave_zone" DROP CONSTRAINT "cave_zone_plan_position_check";
ALTER TABLE "cave_zone" ADD CONSTRAINT "cave_zone_plan_position_check" CHECK (
  ("plan_id" IS NULL AND "plan_x" IS NULL AND "plan_y" IS NULL)
  OR ("plan_id" IS NOT NULL AND "plan_x" IS NOT NULL AND "plan_y" IS NOT NULL AND "plan_x" BETWEEN 0 AND 1 AND "plan_y" BETWEEN 0 AND 1)
);

-- 7. Les colonnes de plan de `cave` sont reprises : supprimées.
ALTER TABLE "cave"
  DROP COLUMN "plan_path",
  DROP COLUMN "plan_width",
  DROP COLUMN "plan_height",
  DROP COLUMN "plan_updated_at";
