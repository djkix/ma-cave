-- Accords vécus : un plat servi avec une bouteille, et l'avis (bon ou raté).
-- Ajout seulement ; supprimés avec leur vin.
CREATE TABLE "accord_vecu" (
    "id" TEXT NOT NULL,
    "wine_id" TEXT NOT NULL,
    "dish" TEXT NOT NULL,
    "dish_id" TEXT,
    "good" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accord_vecu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accord_vecu_wine_id_idx" ON "accord_vecu"("wine_id");

-- AddForeignKey
ALTER TABLE "accord_vecu" ADD CONSTRAINT "accord_vecu_wine_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
