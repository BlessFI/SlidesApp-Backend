import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { getRedisConnectionOptions } from "../utils/redis.js";
import { processVideo } from "../services/transcode.service.js";
import fs from "fs/promises";
import path from "path";

export type VideoProcessJobPayload = {
  type: "process_video";
  videoId: string;
  appId: string;
  sourcePath: string;
};

const QUEUE_NAME = "videoProcessQueue";

let videoProcessQueue: Queue<VideoProcessJobPayload> | null = null;
let videoProcessWorker: Worker<VideoProcessJobPayload> | null = null;

try {
  const connection = getRedisConnectionOptions();
  videoProcessQueue = new Queue<VideoProcessJobPayload>(QUEUE_NAME, {
    connection: connection as { url?: string; host?: string; port?: number; password?: string },
  });
  (async () => {
    try {
      await videoProcessQueue!.waitUntilReady();
      const paused = await videoProcessQueue!.isPaused();
      if (paused) await videoProcessQueue!.resume();
    } catch (e) {
      console.warn(
        "⚠️ videoProcessQueue wait/resume:",
        (e as Error)?.message ?? e
      );
    }
  })().catch(() => {});
} catch (err) {
  console.warn(
    "⚠️ Failed to initialize video process Redis queue:",
    (err as Error)?.message ?? err
  );
  videoProcessQueue = null;
}

export { videoProcessQueue };

export function startVideoProcessWorker(): void {
  if (!videoProcessQueue) {
    console.warn(
      "⚠️ Video process queue not available – worker not started"
    );
    return;
  }
  try {
    const connection = getRedisConnectionOptions();
    videoProcessWorker = new Worker<VideoProcessJobPayload>(
      QUEUE_NAME,
      async (job: Job<VideoProcessJobPayload>) => {
        if (job.data.type !== "process_video") return;
        const { videoId, appId, sourcePath } = job.data;
        try {
          await processVideo({ videoId, appId, sourcePath });
        } finally {
          await fs
            .rm(path.dirname(sourcePath), { recursive: true, force: true })
            .catch(() => {});
        }
      },
      {
        connection: connection as { url?: string; host?: string; port?: number; password?: string },
        concurrency: 2,
      }
    );
    videoProcessWorker.on("ready", () =>
      console.log("🟢 Video process worker ready")
    );
    videoProcessWorker.on("active", (job) =>
      console.log("🔄 Video process job started:", job.id, job.data.videoId)
    );
    videoProcessWorker.on("completed", (job) =>
      console.log("✅ Video process job completed:", job.id, job.data.videoId)
    );
    videoProcessWorker.on("failed", (job, err) =>
      console.error(
        "❌ Video process job failed:",
        job?.id,
        job?.data?.videoId,
        err.message
      )
    );
    videoProcessWorker.on("error", (err) =>
      console.error("💥 Video process worker error:", err.message)
    );
  } catch (err) {
    console.warn(
      "⚠️ Failed to start video process worker:",
      (err as Error)?.message ?? err
    );
  }
}

export async function enqueueProcessVideo(
  videoId: string,
  appId: string,
  sourcePath: string,
  opts?: JobsOptions
): Promise<boolean> {
  if (!videoProcessQueue) {
    console.warn(
      "⚠️ Redis queue not available – video process job skipped, run in-process"
    );
    return false;
  }
  try {
    await videoProcessQueue.add(
      "process-video",
      { type: "process_video", videoId, appId, sourcePath },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: false,
        removeOnFail: false,
        ...opts,
      }
    );
    return true;
  } catch (err) {
    console.warn(
      "⚠️ Failed to enqueue video process job:",
      (err as Error)?.message ?? err
    );
    return false;
  }
}
