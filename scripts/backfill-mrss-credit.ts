/**
 * Backfill Video.credit for MRSS-ingested videos using media:credit from the feed.
 *
 * This is a one-off / occasional script to populate the `credit` field on existing videos,
 * so you can track views/revenue per underlying provider (e.g. Bloomberg).
 *
 * It:
 * - Fetches the MRSS feed for a given ContentProvider (default: VideoElephant).
 * - For each item with a guid and media:credit, updates videos in that app
 *   where guid matches and credit is currently null.
 *
 * Usage:
 *   npx tsx scripts/backfill-mrss-credit.ts [appId] [sourceKey]
 *
 * Examples:
 *   npx tsx scripts/backfill-mrss-credit.ts
 *   npx tsx scripts/backfill-mrss-credit.ts cmlqd4ag90000s1hi78ws4s8h videoelephant
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { XMLParser } from "fast-xml-parser";

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

import { prisma } from "../src/lib/prisma.js";

function getEnvAuth(sourceKey: string): { username: string; password: string } | null {
  const key = sourceKey.replace(/-/g, "_").toUpperCase();
  const username = process.env[`MRSS_${key}_USERNAME`];
  const password = process.env[`MRSS_${key}_PASSWORD`];
  if (username && password) return { username, password };
  return null;
}

function getString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && "#text" in v) return String((v as { "#text": unknown })["#text"]).trim() || null;
  return null;
}

function getMediaCredit(item: Record<string, unknown>): string | null {
  const media = item["media:group"] ?? item.media;
  if (!media || typeof media !== "object") return null;
  const m = media as Record<string, unknown>;
  const v = m["media:credit"] ?? m["credit"];
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && "#text" in v) {
    return String((v as { "#text": unknown })["#text"]).trim() || null;
  }
  return null;
}

async function main() {
  const DEFAULT_APP_ID = "cmlqd4ag90000s1hi78ws4s8h";
  const DEFAULT_SOURCE_KEY = "videoelephant";

  const appId = process.argv[2] ?? DEFAULT_APP_ID;
  const sourceKey = process.argv[3] ?? DEFAULT_SOURCE_KEY;

  const provider = await prisma.contentProvider.findUnique({
    where: { appId_sourceKey: { appId, sourceKey } },
  });
  if (!provider || !provider.isActive) {
    console.error("ContentProvider not found or inactive for app/sourceKey:", appId, sourceKey);
    process.exit(1);
  }

  const auth = getEnvAuth(provider.sourceKey);
  const url = provider.mrssUrl;
  let xml: string;
  try {
    const headers: Record<string, string> = {};
    if (auth) {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`, "utf8").toString("base64");
      headers["Authorization"] = `Basic ${encoded}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`MRSS fetch failed: ${res.status} ${res.statusText}`);
    xml = await res.text();
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("Failed to fetch MRSS:", err);
    process.exit(1);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const rss = parsed?.rss ?? parsed?.RSS;
  const feed = parsed?.feed;
  let channel: unknown = (rss && typeof rss === "object" && (rss as Record<string, unknown>).channel) ?? feed;
  if (Array.isArray(channel)) channel = channel[0];
  if (!channel || typeof channel !== "object") {
    console.error("Invalid MRSS: no channel/feed");
    process.exit(1);
  }

  let rawItems: unknown = (channel as Record<string, unknown>).item;
  if (!rawItems) rawItems = (channel as Record<string, unknown>).entry;
  const items: Record<string, unknown>[] = Array.isArray(rawItems)
    ? rawItems
    : rawItems
      ? [rawItems as Record<string, unknown>]
      : [];

  let updated = 0;
  for (const entry of items) {
    const guid = getString(entry, "guid") ?? getString(entry, "link") ?? getString(entry, "id");
    const credit = getMediaCredit(entry);
    if (!guid || !credit) continue;

    const res = await prisma.video.updateMany({
      where: { appId, guid, credit: null },
      data: { credit },
    });
    updated += res.count;
  }

  console.log("Backfill complete. Updated credit on", updated, "video(s).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

