-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#7c5cff',
ADD COLUMN     "emoji" TEXT NOT NULL DEFAULT '🛡️',
ADD COLUMN     "inviteCode" TEXT;

-- AlterTable
ALTER TABLE "ClubQuiz" ADD COLUMN     "addedById" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "pushedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "allowFriendRequests" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showOnline" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "textScale" INTEGER NOT NULL DEFAULT 100;

-- CreateIndex
CREATE UNIQUE INDEX "Club_inviteCode_key" ON "Club"("inviteCode");

-- CreateIndex
CREATE INDEX "Notification_pushedAt_createdAt_idx" ON "Notification"("pushedAt", "createdAt");


-- Las notificaciones anteriores a la Fase 7 no se envían por push
UPDATE "Notification" SET "pushedAt" = "createdAt" WHERE "pushedAt" IS NULL;
