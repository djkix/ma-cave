-- AlterTable
ALTER TABLE "wine_traits" ADD COLUMN     "region" TEXT,
ADD COLUMN     "guard_min" INTEGER,
ADD COLUMN     "guard_max" INTEGER;

-- AlterTable
ALTER TABLE "photo" ADD COLUMN     "requested_quantity" INTEGER;

-- Vins sans apogée ou sans région : une ligne est créée s'il n'y en a pas, puis tout repasse en file
-- (appellation inconnue, non millésimé, appellation sans garde ou sans région). Les champs manuels restent intacts.
INSERT INTO wine_traits (id, wine_id, updated_at)
SELECT gen_random_uuid(), w.id, now() FROM wine w
WHERE NOT EXISTS (SELECT 1 FROM wine_traits t WHERE t.wine_id = w.id);

UPDATE wine_traits SET status = 'PENDING', requested_at = now(), attempts = 0, next_attempt_at = NULL, reserved_until = NULL
WHERE status <> 'PENDING' AND wine_id IN (
  SELECT w.id FROM wine w LEFT JOIN appellation a ON a.id = w.appellation_id
  WHERE w.appellation_id IS NULL OR w.vintage IS NULL OR a.guard_min_years IS NULL OR a.region IS NULL
);
