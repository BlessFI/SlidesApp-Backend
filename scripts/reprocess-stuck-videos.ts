/**
 * Reprocess videos stuck in "processing" (e.g. after stopping the MRSS ingest script).
 * Only videos that have a stored source URL (link) can be reprocessed. Videos created
 * before we stored link cannot be reprocessed; use --delete-no-link to remove those.
 *
 * Usage:
 *   npx tsx scripts/reprocess-stuck-videos.ts [appId] [limit]
 *   npx tsx scripts/reprocess-stuck-videos.ts [appId] [limit] --delete-no-link
 *   npx tsx scripts/reprocess-stuck-videos.ts [appId] --delete-all   (remove all processing)
 *
 * Examples:
 *   npx tsx scripts/reprocess-stuck-videos.ts
 *   npx tsx scripts/reprocess-stuck-videos.ts cmlqd4ag90000s1hi78ws4s8h 10
 *   npx tsx scripts/reprocess-stuck-videos.ts --delete-all
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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
import { reprocessVideo } from "../src/services/video.service.js";

const DEFAULT_LIMIT = 50;

async function main() {
  const deleteAll = process.argv.includes("--delete-all");
  const args = process.argv.slice(2).filter((a) => a !== "--delete-no-link" && a !== "--delete-all");
  const deleteNoLink = process.argv.includes("--delete-no-link");
  const appId = args[0] ?? undefined;
  const limit = Math.max(0, parseInt(args[1] ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT);

  const baseWhere = appId ? { appId, status: "processing" as const } : { status: "processing" as const };

  if (deleteAll) {
    const result = await prisma.video.deleteMany({ where: baseWhere });
    console.log("Deleted", result.count, "processing video(s).");
    return;
  }

  if (deleteNoLink) {
    const toDelete = await prisma.video.findMany({
      where: { ...baseWhere, link: null },
      select: { id: true },
    });
    if (toDelete.length === 0) {
      console.log("No processing videos without link to delete.");
    } else {
      await prisma.video.deleteMany({ where: { id: { in: toDelete.map((v) => v.id) } } });
      console.log("Deleted", toDelete.length, "processing video(s) with no source link.");
    }
  }

  const reprocessWhere = {
    ...(appId ? { appId } : {}),
    status: { in: ["processing", "failed"] },
    link: { not: null },
  };
  const stuck = await prisma.video.findMany({
    where: reprocessWhere,
    select: { id: true },
    take: limit,
  });

  if (stuck.length === 0) {
    const noLinkCount = await prisma.video.count({
      where: { ...baseWhere, link: null },
    });
    if (noLinkCount > 0) {
      console.log(
        noLinkCount,
        "processing video(s) have no stored source URL (created before we saved link).",
      );
      console.log("To remove them run: npx tsx scripts/reprocess-stuck-videos.ts" + (appId ? " " + appId : "") + " 0 --delete-no-link");
    } else {
      console.log("No processing or failed videos with link to reprocess.");
    }
    return;
  }

  console.log("Reprocessing", stuck.length, "video(s) (processing or failed with link)...");
  let ok = 0;
  for (const v of stuck) {
    if (await reprocessVideo(v.id)) ok++;
  }
  console.log("Started reprocess for", ok, "of", stuck.length, "video(s).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
