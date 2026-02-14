-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "upgradedFromId" TEXT,
ADD COLUMN "upgradedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_upgradedFromId_fkey" FOREIGN KEY ("upgradedFromId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
