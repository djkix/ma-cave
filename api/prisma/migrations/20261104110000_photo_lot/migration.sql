-- AlterTable
ALTER TABLE "photo" ADD COLUMN     "batch_id" UUID;

-- CreateIndex
CREATE INDEX "photo_batch_id_idx" ON "photo"("batch_id");
