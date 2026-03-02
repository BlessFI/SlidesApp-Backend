/**
 * What this is for (use case)
 * --------------------------
 * VideoElephant (and similar providers) publish a "Media RSS" (MRSS) feed: an URL that
 * returns XML listing videos (title, description, media URL, etc.). This script:
 * 1) Ensures your app has a "content provider" and default category for VideoElephant,
 * 2) Fetches that feed (with the credentials you set in .env),
 * 3) Creates new videos in your app for each feed item so they appear in the main feed.
 * No admin UI needed — run this script whenever you want to pull in the latest from the feed
 * (e.g. once per day via cron, or on demand).
 *
 * Usage
 * -----
 * 1. Set in .env (do not commit real values):
 *    MRSS_VIDEOELEPHANT_USERNAME=verticalapp@videoelephant.com
 *    MRSS_VIDEOELEPHANT_PASSWORD=your-password
 * 2. Ensure the app has at least one category (e.g. run seed-categories first).
 * 3. Run:
 *    npx tsx scripts/run-mrss-ingest.ts <appId> <userId>
 * Example:
 *    npx tsx scripts/run-mrss-ingest.ts cmlqd4ag90000s1hi78ws4s8h cmlphwbpm0000s1kghvutddak
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env from project root so DATABASE_URL and MRSS_* are set
function loadEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

import { prisma } from "../src/lib/prisma.js";
import { runMrssIngestForProvider } from "../src/services/mrss.service.js";

const APP_ID = "cmlqd4ag90000s1hi78ws4s8h";
const USER_ID = "cmlphwbpm0000s1kghvutddak";
const SOURCE_KEY = "videoelephant";
const MRSS_URL = "https://mrss.videoelephant.com/mrss?original=true";
/** Max new videos to create per run (avoids pulling the whole feed at once). */
const MAX_ITEMS_PER_RUN = 10;

async function main() {
  const appId = process.argv[2] ?? APP_ID;
  const userId = process.argv[3] ?? USER_ID;

  if (!process.env.MRSS_VIDEOELEPHANT_USERNAME || !process.env.MRSS_VIDEOELEPHANT_PASSWORD) {
    console.error("Set MRSS_VIDEOELEPHANT_USERNAME and MRSS_VIDEOELEPHANT_PASSWORD in .env");
    process.exit(1);
  }

  const app = await prisma.app.findUnique({ where: { id: appId } });
  if (!app) {
    console.error("App not found:", appId);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error("User not found:", userId);
    process.exit(1);
  }

  const profile = await prisma.userAppProfile.findUnique({
    where: { userId_appId: { userId, appId } },
  });
  if (!profile) {
    console.error("User has no profile in this app. Add them to the app first.");
    process.exit(1);
  }

  let categoryId: string | null = null;
  const firstCategory = await prisma.taxonomyNode.findFirst({
    where: { appId, kind: "category" },
    select: { id: true },
  });
  if (firstCategory) {
    categoryId = firstCategory.id;
  } else {
    const created = await prisma.taxonomyNode.create({
      data: { appId, kind: "category", name: "Entertainment", slug: "entertainment" },
    });
    categoryId = created.id;
    console.log("Created default category:", created.name, categoryId);
  }

  await prisma.ingestDefaultRule.upsert({
    where: { appId_sourceKey: { appId, sourceKey: SOURCE_KEY } },
    create: {
      appId,
      sourceKey: SOURCE_KEY,
      defaultCategoryIds: [categoryId],
    },
    update: {
      defaultCategoryIds: [categoryId],
    },
  });
  console.log("Ingest default rule OK for sourceKey:", SOURCE_KEY);

  const provider = await prisma.contentProvider.upsert({
    where: { appId_sourceKey: { appId, sourceKey: SOURCE_KEY } },
    create: {
      appId,
      sourceKey: SOURCE_KEY,
      name: "VideoElephant",
      mrssUrl: MRSS_URL,
      defaultPrimaryCategoryId: categoryId,
      ingestUserId: userId,
    },
    update: {
      mrssUrl: MRSS_URL,
      defaultPrimaryCategoryId: categoryId,
      ingestUserId: userId,
      isActive: true,
    },
  });
  console.log("Content provider OK:", provider.id);

  console.log("Running MRSS ingest (max", MAX_ITEMS_PER_RUN, "new items, one-at-a-time)...");
  const result = await runMrssIngestForProvider(appId, SOURCE_KEY, {
    maxItems: MAX_ITEMS_PER_RUN,
    waitForProcessing: true,
  });
  if (!result) {
    console.error("Ingest returned null (provider not found or inactive)");
    process.exit(1);
  }

  console.log("Result:", {
    fetched: result.fetched,
    created: result.created,
    skipped: result.skipped,
    errors: result.errors.length ? result.errors : undefined,
  });
  if (result.errors.length) {
    result.errors.forEach((e) => console.warn("  -", e));
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
