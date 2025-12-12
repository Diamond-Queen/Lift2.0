-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#d4af37',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalInput" TEXT NOT NULL,
    "summaries" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Class_userId_name_key" ON "Class"("userId", "name");

-- CreateIndex
CREATE INDEX "ContentItem_userId_classId_idx" ON "ContentItem"("userId", "classId");

-- CreateIndex
CREATE INDEX "ContentItem_userId_type_idx" ON "ContentItem"("userId", "type");

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;
