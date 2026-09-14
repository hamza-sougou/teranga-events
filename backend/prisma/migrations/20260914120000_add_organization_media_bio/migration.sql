-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "avatar_storage_key" TEXT,
ADD COLUMN     "avatar_image_url" TEXT,
ADD COLUMN     "cover_storage_key" TEXT,
ADD COLUMN     "cover_image_url" TEXT,
ADD COLUMN     "bio" VARCHAR(500);
