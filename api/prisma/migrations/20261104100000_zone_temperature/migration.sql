-- AlterTable
-- Température facultative d'une zone (°C) : aucune pour les zones existantes.
ALTER TABLE "cave_zone" ADD COLUMN "temperature_c" INTEGER,
  ADD CONSTRAINT "cave_zone_temperature_check" CHECK ("temperature_c" IS NULL OR "temperature_c" BETWEEN -5 AND 30);
