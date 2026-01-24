-- AlterTable
ALTER TABLE "Class" ALTER COLUMN "color" SET DEFAULT '#8b7500';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "stripeSubscriptionId" TEXT;
