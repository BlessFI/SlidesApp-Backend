/**
 * Hourly MRSS ingest cron. Runs in the same process as the server.
 * Enable with MRSS_INGEST_ENABLED=1. Uses same default app/source as scripts/run-mrss-ingest.ts
 * when MRSS_INGEST_APP_ID / MRSS_INGEST_SOURCE_KEY are not set.
 * Uses a lock so overlapping runs are skipped (one batch must finish before the next is scheduled).
 */

import cron from "node-cron";
import { runMrssIngestForProvider } from "../services/mrss.service.js";

const CRON_SCHEDULE = "0 * * * *"; // every hour at minute 0
const MAX_ITEMS_PER_RUN = 10;

/** Same defaults as scripts/run-mrss-ingest.ts */
const DEFAULT_APP_ID = "cmlqd4ag90000s1hi78ws4s8h";
const DEFAULT_SOURCE_KEY = "videoelephant";

let isRunning = false;

function isCronEnabled(): boolean {
  const v = process.env.MRSS_INGEST_ENABLED;
  return v === "1" || v === "true" || v === "yes";
}

function getCronConfig(): { appId: string; sourceKey: string } | null {
  if (!isCronEnabled()) return null;
  const appId = process.env.MRSS_INGEST_APP_ID?.trim() || DEFAULT_APP_ID;
  const sourceKey = process.env.MRSS_INGEST_SOURCE_KEY?.trim() || DEFAULT_SOURCE_KEY;
  return { appId, sourceKey };
}

async function runIngest(): Promise<void> {
  const config = getCronConfig();
  if (!config) return;
  if (isRunning) {
    console.warn("[MRSS cron] Skipping run: previous ingest still in progress");
    return;
  }
  isRunning = true;
  try {
    console.log("[MRSS cron] Starting hourly ingest", config.appId, config.sourceKey);
    const result = await runMrssIngestForProvider(config.appId, config.sourceKey, {
      maxItems: MAX_ITEMS_PER_RUN,
      waitForProcessing: true,
    });
    if (result) {
      console.log("[MRSS cron] Done:", {
        fetched: result.fetched,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors.length,
      });
      if (result.errors.length) {
        result.errors.forEach((e) => console.warn("[MRSS cron]", e));
      }
    } else {
      console.warn("[MRSS cron] No active provider for", config.sourceKey);
    }
  } catch (err) {
    console.error("[MRSS cron] Ingest failed:", err);
  } finally {
    isRunning = false;
  }
}

export function startMrssIngestCron(): void {
  const config = getCronConfig();
  if (!config) {
    return;
  }
  cron.schedule(CRON_SCHEDULE, () => {
    runIngest().catch((e) => {
      console.error("[MRSS cron] Unhandled error:", e);
      isRunning = false;
    });
  });
  console.log("[MRSS cron] Scheduled hourly ingest for appId=" + config.appId + " sourceKey=" + config.sourceKey);
}
