-- CreateEnum
CREATE TYPE "DesignVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateTable
CREATE TABLE "studio_design" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "outline" JSONB NOT NULL,
    "params" JSONB NOT NULL,
    "visibility" "DesignVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_design_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "studio_design_slug_key" ON "studio_design"("slug");

-- CreateIndex
CREATE INDEX "studio_design_userId_idx" ON "studio_design"("userId");

-- CreateIndex
CREATE INDEX "studio_design_visibility_createdAt_idx" ON "studio_design"("visibility", "createdAt");

-- AddForeignKey
ALTER TABLE "studio_design" ADD CONSTRAINT "studio_design_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
