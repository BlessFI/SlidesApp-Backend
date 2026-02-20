/**
 * Tagging queue: hook that runs after a video becomes ready.
 * M2: no-op or set tagging_source to "manual" if not set.
 * M3: behind feature flag, run AI suggestion and populate ai_suggested_* / ai_confidence / ai_model_version.
 */

import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { getRedisConnectionOptions } from "../utils/redis.js";
import { prisma } from "../lib/prisma.js";

export type TaggingJobPayload = {
  type: "after_video_ready";
  videoId: string;
  appId: string;
};

const QUEUE_NAME = "taggingQueue";

let taggingQueue: Queue<TaggingJobPayload> | null = null;
let taggingWorker: Worker<TaggingJobPayload> | null = null;

try {
  const connection = getRedisConnectionOptions();
  taggingQueue = new Queue<TaggingJobPayload>(QUEUE_NAME, {
    connection: connection as { url?: string; host?: string; port?: number; password?: string },
  });
  (async () => {
    try {
      await taggingQueue!.waitUntilReady();
      const paused = await taggingQueue!.isPaused();
      if (paused) await taggingQueue!.resume();
    } catch (e) {
      console.warn("⚠️ taggingQueue wait/resume:", (e as Error)?.message ?? e);
    }
  })().catch(() => {});
} catch (err) {
  console.warn("⚠️ Failed to initialize tagging queue:", (err as Error)?.message ?? err);
  taggingQueue = null;
}

export { taggingQueue };

/**
 * M2: Ensure tagging_source is set (default "manual" when null).
 * M3: When AI feature flag is on, call AI service and update ai_suggested_*, ai_confidence, ai_model_version.
 */
async function runTaggingHook(videoId: string, appId: string): Promise<void> {
  const video = await prisma.video.findFirst({
    where: { id: videoId, appId },
    select: { id: true, taggingSource: true },
  });
  if (!video) return;
  if (video.taggingSource == null) {
    await prisma.video.update({
      where: { id: videoId },
      data: { taggingSource: "manual" },
    });
  }
  // M3: if (process.env.AI_TAGGING_ENABLED === "true") { ... run AI, update ai_suggested_*, etc. }
}

export function startTaggingWorker(): void {
  if (!taggingQueue) {
    console.warn("⚠️ Tagging queue not available – worker not started");
    return;
  }
  try {
    const connection = getRedisConnectionOptions();
    taggingWorker = new Worker<TaggingJobPayload>(
      QUEUE_NAME,
      async (job: Job<TaggingJobPayload>) => {
        if (job.data.type !== "after_video_ready") return;
        const { videoId, appId } = job.data;
        await runTaggingHook(videoId, appId);
      },
      {
        connection: connection as { url?: string; host?: string; port?: number; password?: string },
        concurrency: 5,
      }
    );
    taggingWorker.on("ready", () => console.log("🟢 Tagging worker ready"));
    taggingWorker.on("failed", (job, err) =>
      console.error("❌ Tagging job failed:", job?.id, job?.data?.videoId, err.message)
    );
  } catch (err) {
    console.warn("⚠️ Failed to start tagging worker:", (err as Error)?.message ?? err);
  }
}

export async function enqueueTaggingAfterVideoReady(
  videoId: string,
  appId: string,
  opts?: JobsOptions
): Promise<boolean> {
  if (!taggingQueue) return false;
  try {
    await taggingQueue.add(
      "after-video-ready",
      { type: "after_video_ready", videoId, appId },
      {
        attempts: 2,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        ...opts,
      }
    );
    return true;
  } catch (err) {
    console.warn("⚠️ Failed to enqueue tagging job:", (err as Error)?.message ?? err);
    return false;
  }
}
