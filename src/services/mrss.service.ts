/**
 * MRSS (Media RSS) ingest: fetch feed per Content Provider, parse XML, create/update videos.
 * Auth (Basic) from env: MRSS_<SOURCE_KEY_UPPER>_USERNAME, MRSS_<SOURCE_KEY_UPPER>_PASSWORD.
 */

import { XMLParser } from "fast-xml-parser";
import { prisma } from "../lib/prisma.js";
import * as videoService from "./video.service.js";

function getEnvAuth(sourceKey: string): { username: string; password: string } | null {
  const key = sourceKey.replace(/-/g, "_").toUpperCase();
  const username = process.env[`MRSS_${key}_USERNAME`];
  const password = process.env[`MRSS_${key}_PASSWORD`];
  if (username && password) return { username, password };
  return null;
}

export interface MrssIngestResult {
  providerId: string;
  sourceKey: string;
  fetched: number;
  created: number;
  skipped: number;
  errors: string[];
}

/** Options for runMrssIngestForProvider. */
export interface MrssIngestOptions {
  /** Max number of new videos to create in this run (default: no limit). Use e.g. 5 for testing. */
  maxItems?: number;
  /** When true, wait for each video to finish processing (ready) before creating the next. One-at-a-time. */
  waitForProcessing?: boolean;
  /** Max ms to wait for one video to become ready when waitForProcessing is true (default 600000). */
  waitForProcessingPollMs?: number;
  /** Poll interval in ms when waiting for ready (default 2000). */
  waitForProcessingPollIntervalMs?: number;
}

/**
 * Run MRSS ingest for one provider. Fetches XML with Basic auth (from env), parses items,
 * skips items that already exist (by guid), creates new videos via videoService.createVideo.
 */
export async function runMrssIngestForProvider(
  appId: string,
  sourceKey: string,
  opts?: MrssIngestOptions
): Promise<MrssIngestResult | null> {
  const provider = await prisma.contentProvider.findUnique({
    where: { appId_sourceKey: { appId, sourceKey } },
    include: { ingestUser: true },
  });
  if (!provider || !provider.isActive) return null;

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
    return {
      providerId: provider.id,
      sourceKey: provider.sourceKey,
      fetched: 0,
      created: 0,
      skipped: 0,
      errors: [`Fetch failed: ${err}`],
    };
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
    return {
      providerId: provider.id,
      sourceKey: provider.sourceKey,
      fetched: 0,
      created: 0,
      skipped: 0,
      errors: ["Invalid MRSS: no channel/feed"],
    };
  }

  let rawItems: unknown = (channel as Record<string, unknown>).item;
  if (!rawItems) rawItems = (channel as Record<string, unknown>).entry;
  let items: Record<string, unknown>[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems as Record<string, unknown>] : [];
  const maxItems = opts?.maxItems;
  if (typeof maxItems === "number" && maxItems > 0) {
    items = items.slice(0, maxItems);
  }
  const result: MrssIngestResult = {
    providerId: provider.id,
    sourceKey: provider.sourceKey,
    fetched: items.length,
    created: 0,
    skipped: 0,
    errors: [],
  };

  const defaultCategoryId =
    provider.defaultPrimaryCategoryId ??
    (await getDefaultCategoryFromRule(appId, sourceKey));

  if (!defaultCategoryId) {
    result.errors.push("No default primary category: set on provider or ingest rule");
    return result;
  }

  const creatorId = provider.ingestUserId;

  for (const entry of items) {
    const guid = getString(entry, "guid") ?? getString(entry, "link") ?? getString(entry, "id");
    if (guid) {
      const existing = await prisma.video.findFirst({
        where: { appId, guid },
      });
      if (existing) {
        result.skipped++;
        continue;
      }
    }

    const mediaUrl = getMediaContentUrl(entry);
    if (!mediaUrl) {
      result.errors.push(`Item missing media URL (guid=${guid ?? "?"})`);
      continue;
    }

    const title = getString(entry, "title") ?? getMediaString(entry, "title") ?? "Untitled";
    const description =
      getString(entry, "description") ?? getMediaString(entry, "description") ?? null;
    const durationSec = getMediaDuration(entry);
    const durationMs = durationSec != null ? Math.round(durationSec * 1000) : 60000;

    try {
      const created = await videoService.createVideo({
        appId,
        creatorId,
        primaryCategoryId: defaultCategoryId,
        ingestSource: sourceKey,
        guid: guid ?? undefined,
        title: title || null,
        description,
        durationMs,
        videoUrl: mediaUrl,
        waitUntilProcessed: opts?.waitForProcessing,
      });
      result.created++;
      if (opts?.waitForProcessing && created?.id) {
        await waitUntilVideoReady(created.id, opts.waitForProcessingPollMs ?? 600_000, opts.waitForProcessingPollIntervalMs ?? 2000);
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      result.errors.push(`Create failed (${guid ?? "?"}): ${err}`);
    }
  }

  return result;
}

async function waitUntilVideoReady(
  videoId: string,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await prisma.video.findUnique({
      where: { id: videoId },
      select: { status: true },
    });
    if (v?.status === "ready") return;
    if (v?.status && v.status !== "processing") return; // failed or other terminal state
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`Video ${videoId} did not become ready within ${timeoutMs}ms`);
}

async function getDefaultCategoryFromRule(
  appId: string,
  sourceKey: string
): Promise<string | null> {
  const rule = await prisma.ingestDefaultRule.findUnique({
    where: { appId_sourceKey: { appId, sourceKey } },
  });
  return rule?.defaultCategoryIds?.[0] ?? null;
}

function getString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && "#text" in v) return String((v as { "#text": unknown })["#text"]).trim() || null;
  return null;
}

function getMediaString(obj: Record<string, unknown>, key: string): string | null {
  const media = obj["media:group"] ?? obj.media;
  if (!media || typeof media !== "object") return null;
  const m = media as Record<string, unknown>;
  const v = m[key] ?? m[`media:${key}`];
  if (typeof v === "string") return v.trim() || null;
  return null;
}

function getMediaContentUrl(item: Record<string, unknown>): string | null {
  const media = item["media:group"] ?? item["media:content"] ?? item.media;
  if (!media) return null;
  const contents = Array.isArray(media) ? media : [media];
  for (const c of contents) {
    if (c && typeof c === "object" && "@_url" in c) {
      const url = (c as { "@_url": string })["@_url"];
      if (typeof url === "string" && url.trim()) return url.trim();
    }
  }
  if (item["media:content"] && typeof item["media:content"] === "object") {
    const c = item["media:content"] as Record<string, string>;
    if (c["@_url"]) return c["@_url"].trim();
  }
  return null;
}

function getMediaDuration(item: Record<string, unknown>): number | null {
  const media = item["media:group"] ?? item["media:content"] ?? item.media;
  if (!media) return null;
  const contents = Array.isArray(media) ? media : [media];
  for (const c of contents) {
    if (c && typeof c === "object" && "@_duration" in c) {
      const d = (c as { "@_duration": string | number })["@_duration"];
      const n = typeof d === "number" ? d : parseInt(String(d), 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}
