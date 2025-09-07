-- AlterTable
ALTER TABLE "public"."Event" ADD COLUMN     "preNotify1hSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preNotify2hSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preNotify3hSent" BOOLEAN NOT NULL DEFAULT false;
