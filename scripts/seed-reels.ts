/**
 * Seed reels (videos) and categories into the database.
 * Run: npx tsx scripts/seed-reels.ts
 * Requires: DATABASE_URL, and app "slides" (created if missing) with a seed user.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const REELS_DATA = [
  { id: "1", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/Banyan_Trees.mp4", user: { name: "" } },
  { id: "2", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/Dubai.mp4", user: { name: "" } },
  { id: "3", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/Hippos.mp4", user: { name: "" } },
  { id: "4", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/Horses.mp4", user: { name: "" } },
  { id: "5", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/Japanese_Design.mp4", user: { name: "" } },
  { id: "6", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/Kayaks.mp4", user: { name: "" } },
  { id: "7", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/Koala_Bear.mp4", user: { name: "" } },
  { id: "8", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/London_Bus.mp4", user: { name: "" } },
  { id: "9", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/Parrots.mp4", user: { name: "" } },
  { id: "10", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/Plankton.mp4", user: { name: "" } },
  { id: "11", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/Polar_Bear_White_Fur.mp4", user: { name: "" } },
  { id: "12", url: "https://pub-5e66fec7de214f70bb043a60121f6c73.r2.dev/Sea_Anemones.mp4", user: { name: "" } },
];

const CATEGORIES = [
  "News", "Sports", "Entertainment", "Lifestyle", "Technology",
  "Business", "Finance", "AI", "Travel", "Fitness", "Culture", "Food",
  "Celebrity", "Music", "Gaming", "Ambient", "Motoring", "Politics",
  "Educational", "Informative",
];

const APP_SLUG = "slides";
const SEED_USER_EMAIL = "seed@reels.local";
const DEFAULT_DURATION_MS = 60_000; // 1 min placeholder

function urlToTitle(url: string): string {
  const name = url.split("/").pop() ?? "Video";
  return name.replace(/_/g, " ").replace(/\.(mp4|webm|mov)$/i, "");
}

function urlToStorageKey(url: string): string {
  return url.split("/").pop() ?? "video.mp4";
}

async function main() {
  // 1. App
  const app = await prisma.app.upsert({
    where: { slug: APP_SLUG },
    create: { name: "Slides", slug: APP_SLUG },
    update: {},
  });
  console.log("App:", app.slug, app.id);

  // 2. Seed user + profile
  const hashed = await bcrypt.hash("seed-password", 10);
  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    create: { email: SEED_USER_EMAIL, password: hashed, name: "Reels Seed" },
    update: {},
  });
  await prisma.userAppProfile.upsert({
    where: { userId_appId: { userId: user.id, appId: app.id } },
    create: { userId: user.id, appId: app.id, displayName: "Reels Seed" },
    update: {},
  });
  console.log("User:", user.email);

  // 3. Categories (TaxonomyNode kind = category)
  const categorySlugs = CATEGORIES.map((name) =>
    name.toLowerCase().replace(/\s+/g, "-")
  );
  const categoryIds: string[] = [];
  for (let i = 0; i < CATEGORIES.length; i++) {
    let node = await prisma.taxonomyNode.findFirst({
      where: { appId: app.id, kind: "category", slug: categorySlugs[i] },
    });
    if (!node) {
      node = await prisma.taxonomyNode.create({
        data: {
          appId: app.id,
          kind: "category",
          name: CATEGORIES[i],
          slug: categorySlugs[i],
        },
      });
    }
    categoryIds.push(node.id);
  }
  console.log("Categories:", categoryIds.length);

  // 4. Videos + assets (reel i -> category index i % 20)
  for (let i = 0; i < REELS_DATA.length; i++) {
    const reel = REELS_DATA[i];
    const title = urlToTitle(reel.url);
    const categoryId = categoryIds[i % CATEGORIES.length];

    const video = await prisma.video.create({
      data: {
        appId: app.id,
        creatorId: user.id,
        status: "ready",
        title,
        durationMs: DEFAULT_DURATION_MS,
        categoryId,
        guid: reel.id,
      },
    });

    const asset = await prisma.videoAsset.create({
      data: {
        appId: app.id,
        videoId: video.id,
        assetType: "mp4",
        storageProvider: "r2",
        storageKey: urlToStorageKey(reel.url),
        cdnUrl: reel.url,
        mimeType: "video/mp4",
        isPrimary: true,
      },
    });

    await prisma.video.update({
      where: { id: video.id },
      data: { primaryAssetId: asset.id },
    });

    console.log(`  Video ${i + 1}: ${title} (category ${CATEGORIES[i % CATEGORIES.length]})`);
  }

  console.log("Done. Reels seeded:", REELS_DATA.length);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
