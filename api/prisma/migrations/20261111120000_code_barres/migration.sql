-- Entrée par code-barres : le code est retenu sur le vin (plusieurs millésimes
-- peuvent le partager) et, pour un code inconnu, sur la photo prise ensuite.
ALTER TABLE "wine" ADD COLUMN "ean" TEXT;
ALTER TABLE "photo" ADD COLUMN "ean" TEXT;

-- CreateIndex
CREATE INDEX "wine_cave_id_ean_idx" ON "wine"("cave_id", "ean");
