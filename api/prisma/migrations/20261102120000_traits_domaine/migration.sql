-- AlterTable
ALTER TABLE "producer_profile" ADD COLUMN     "cepages" TEXT,
ADD COLUMN     "histoire" TEXT,
ADD COLUMN     "manual_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "nez" TEXT,
ADD COLUMN     "style" TEXT,
ADD COLUMN     "terroir" TEXT;

-- CreateTable
CREATE TABLE "wine_traits" (
    "id" TEXT NOT NULL,
    "wine_id" TEXT NOT NULL,
    "status" "PairingStatus" NOT NULL DEFAULT 'PENDING',
    "tannin" TEXT,
    "aromas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT,
    "manual_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "cost_cents" INTEGER,
    "error_message" TEXT,
    "generated_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "reserved_until" TIMESTAMP(3),

    CONSTRAINT "wine_traits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wine_traits_wine_id_key" ON "wine_traits"("wine_id");

-- CreateIndex
CREATE INDEX "wine_traits_status_requested_at_idx" ON "wine_traits"("status", "requested_at");

-- AddForeignKey
ALTER TABLE "wine_traits" ADD CONSTRAINT "wine_traits_wine_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise des domaines existants : l'ancien descriptif devient « histoire », une saisie manuelle est conservée,
-- le reste repasse en file pour être régénéré avec les nouveaux champs.
UPDATE producer_profile SET
  histoire = description,
  manual_fields = CASE WHEN source = 'MANUEL' AND description IS NOT NULL THEN ARRAY['histoire'] ELSE '{}' END,
  source = 'GEMINI', status = 'PENDING', requested_at = now(), attempts = 0, next_attempt_at = NULL, reserved_until = NULL;
