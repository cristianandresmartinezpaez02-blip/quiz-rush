-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "soloKey" TEXT;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "stats" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "AdventureProgress" (
    "userId" TEXT NOT NULL,
    "levelKey" TEXT NOT NULL,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdventureProgress_pkey" PRIMARY KEY ("userId","levelKey")
);

-- CreateTable
CREATE TABLE "RewardLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardLog_userId_createdAt_idx" ON "RewardLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RewardLog_userId_source_refId_key" ON "RewardLog"("userId", "source", "refId");

-- CreateIndex
CREATE INDEX "GameSession_soloKey_createdAt_idx" ON "GameSession"("soloKey", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AdventureProgress" ADD CONSTRAINT "AdventureProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardLog" ADD CONSTRAINT "RewardLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
