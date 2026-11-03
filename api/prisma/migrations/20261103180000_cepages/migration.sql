-- AlterTable
ALTER TABLE "wine_traits" ADD COLUMN     "grapes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Cépages par vin : une ligne est créée s'il n'y en a pas, puis tous les vins repassent en file
-- pour que la caractérisation les complète. Les champs corrigés à la main restent intacts.
INSERT INTO wine_traits (id, wine_id, updated_at)
SELECT gen_random_uuid(), w.id, now() FROM wine w
WHERE NOT EXISTS (SELECT 1 FROM wine_traits t WHERE t.wine_id = w.id);

UPDATE wine_traits SET status = 'PENDING', requested_at = now(), attempts = 0, next_attempt_at = NULL, reserved_until = NULL
WHERE status <> 'PENDING';
