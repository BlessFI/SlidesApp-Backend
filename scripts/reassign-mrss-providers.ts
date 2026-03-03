/**
 * Reassign MRSS-ingested videos to provider accounts based on Video.credit.
 *
 * This script is meant to be run AFTER you've created ContentProvider rows
 * for individual providers (e.g. Bloomberg, Reuters) with `name` matching
 * the `media:credit` in the MRSS feed and with `ingestUserId` pointing to
 * that provider's user/profile.
 *
 * For each such ContentProvider, it:
 *   - Finds videos in that app whose `credit` matches provider.name
 *   - And whose creatorId is NOT already provider.ingestUserId
 *   - Updates those videos so:
 *       creatorId   = provider.ingestUserId
 *       ingestSource = provider.sourceKey
 *
 * This lets you move already-ingested videos from the generic MRSS account
 * into each provider's own account/profile, matching the client's spec.
 *
 * Usage:
 *   npx tsx scripts/reassign-mrss-providers.ts [appId]
 *
 * Examples:
 *   npx tsx scripts/reassign-mrss-providers.ts
 *   npx tsx scripts/reassign-mrss-providers.ts cmlqd4ag90000s1hi78ws4s8h
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { prisma } from "../src/lib/prisma.js";

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
    if (val.startsWith("\"") && val.endsWith("\"")) val = val.slice(1, -1).replace(/\\"/g, "\"");
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

async function main() {
  const DEFAULT_APP_ID = "cmlqd4ag90000s1hi78ws4s8h";
  const appId = process.argv[2] ?? DEFAULT_APP_ID;

  const app = await prisma.app.findUnique({ where: { id: appId } });
  if (!app) {
    console.error("App not found:", appId);
    process.exit(1);
  }

  // Get all ContentProviders for this app that have a non-null name.
  const providers = await prisma.contentProvider.findMany({
    where: { appId, isActive: true, name: { not: null } },
    select: { id: true, name: true, sourceKey: true, ingestUserId: true },
    orderBy: { name: "asc" },
  });

  if (providers.length === 0) {
    console.log("No ContentProviders with names found for app:", appId);
    return;
  }

  console.log("Reassigning MRSS videos for app:", appId);
  console.log("Providers:", providers.map((p) => `${p.name} (${p.sourceKey})`).join(", "));

  let totalUpdated = 0;

  for (const provider of providers) {
    const name = provider.name?.trim();
    if (!name) continue;

    const result = await prisma.video.updateMany({
      where: {
        appId,
        credit: name,
        creatorId: { not: provider.ingestUserId },
      },
      data: {
        creatorId: provider.ingestUserId,
        ingestSource: provider.sourceKey,
      },
    });

    console.log(
      `Provider ${name} (${provider.sourceKey}): reassigned ${result.count} video(s) to user ${provider.ingestUserId}.`
    );
    totalUpdated += result.count;
  }

  console.log("Done. Total videos reassigned:", totalUpdated);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

