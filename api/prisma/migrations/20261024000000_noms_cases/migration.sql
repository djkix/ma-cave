-- Noms des cases : un nom d'affichage par case d'une zone à grille, objet
-- { code: nom } (« B3 » → « Champagnes »). Le code reste la valeur enregistrée
-- dans location.casier. Ajout seulement ; zones existantes : aucun nom ({}).
ALTER TABLE "cave_zone" ADD COLUMN "cell_names" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "cave_zone" ADD CONSTRAINT "cave_zone_cell_names_check" CHECK (jsonb_typeof("cell_names") = 'object');
