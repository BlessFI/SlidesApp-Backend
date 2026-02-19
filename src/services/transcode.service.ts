/**
 * Video processing: convert to HLS (9:16, 1920p), extract thumbnails at 5s, 15s, 30s.
 * Uses ffmpeg-static binary when available; otherwise FFmpeg must be on PATH.
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { prisma } from "../lib/prisma.js";
import { uploadBufferToR2 } from "../lib/r2.js";

if (typeof ffmpegStatic === "string" && ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const HLS_WIDTH = 1080;
const HLS_HEIGHT = 1920; // 9:16 vertical, 1920p on long edge
const THUMBNAIL_SECONDS = [5, 15, 30] as const;
const ASPECT_RATIO_9_16 = 9 / 16; // 0.5625

export interface ProcessVideoInput {
  videoId: string;
  appId: string;
  /** Path to source video file (local). */
  sourcePath: string;
}

function runFfmpeg(
  inputPath: string,
  outputPath: string,
  options: { hls?: { segmentPattern: string }; thumbnail?: { seekSec: number } }
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath);
    if (options.hls) {
      cmd = cmd
        .videoFilters(
          `scale=${HLS_WIDTH}:${HLS_HEIGHT}:force_original_aspect_ratio=decrease,pad=${HLS_WIDTH}:${HLS_HEIGHT}:(ow-iw)/2:(oh-ih)/2`
        )
        .videoCodec("libx264")
        .outputOptions([
          "-preset fast",
          "-crf 23",
          "-maxrate 5M",
          "-bufsize 10M",
          "-pix_fmt yuv420p",
          "-c:a aac",
          "-b:a 128k",
          "-hls_time 6",
          "-hls_playlist_type vod",
          "-hls_segment_filename",
          options.hls.segmentPattern,
        ])
        .output(outputPath);
    } else if (options.thumbnail) {
      cmd = cmd
        .seekInput(options.thumbnail.seekSec)
        .frames(1)
        .outputOptions(["-vf", `scale=${HLS_WIDTH}:${HLS_HEIGHT}:force_original_aspect_ratio=decrease`])
        .output(outputPath);
    }
    cmd
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * Process source video: (0) upload MP4 to R2 and set video ready, then (1) transcode to HLS (9:16, 1920p), extract 3 thumbnails, upload to R2, set HLS as primary.
 */
export async function processVideo(input: ProcessVideoInput): Promise<void> {
  const { videoId, appId, sourcePath } = input;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-"));
  const hlsDir = path.join(tmpDir, "hls");
  await fs.mkdir(hlsDir, { recursive: true });

  try {
    // 0. Upload source MP4 to R2 so video appears in feed right away (worker does this, not the API)
    const sourceKey = `videos/${appId}/${videoId}/source.mp4`;
    const sourceBuffer = await fs.readFile(sourcePath);
    const sourceResult = await uploadBufferToR2(sourceKey, sourceBuffer, "video/mp4");
    const mp4Asset = await prisma.videoAsset.create({
      data: {
        appId,
        videoId,
        assetType: "master",
        storageProvider: "r2",
        storageKey: sourceResult.Key,
        cdnUrl: sourceResult.Location,
        mimeType: "video/mp4",
        isPrimary: true,
      },
    });
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "ready", primaryAssetId: mp4Asset.id },
    });

    // 1. Transcode to HLS (9:16, 1080x1920)
    const manifestPath = path.join(hlsDir, "master.m3u8");
    const segmentPattern = path.join(hlsDir, "segment_%d.ts").replace(/\\/g, "/");
    await runFfmpeg(sourcePath, manifestPath, {
      hls: { segmentPattern },
    });

    // 2. Extract thumbnails at 5s, 15s, 30s
    const thumbDir = path.join(tmpDir, "thumbnails");
    await fs.mkdir(thumbDir, { recursive: true });
    for (const sec of THUMBNAIL_SECONDS) {
      const thumbPath = path.join(thumbDir, `${sec}.png`);
      await runFfmpeg(sourcePath, thumbPath, { thumbnail: { seekSec: sec } });
    }

    // 3. Upload HLS files to R2
    const hlsPrefix = `videos/${appId}/${videoId}/hls`;
    const manifestKey = `${hlsPrefix}/master.m3u8`;
    const manifestBody = await fs.readFile(manifestPath);
    const manifestResult = await uploadBufferToR2(
      manifestKey,
      manifestBody,
      "application/vnd.apple.mpegurl"
    );

    const hlsFiles = await fs.readdir(hlsDir);
    for (const name of hlsFiles) {
      if (name.endsWith(".ts")) {
        const fullPath = path.join(hlsDir, name);
        const body = await fs.readFile(fullPath);
        await uploadBufferToR2(`${hlsPrefix}/${name}`, body, "video/MP2T");
      }
    }

    // 4. Upload thumbnails to R2
    const thumbPrefix = `thumbnails/${appId}/${videoId}`;
    const thumbnailResults: { sec: number; key: string; location: string }[] = [];
    for (const sec of THUMBNAIL_SECONDS) {
      const thumbPath = path.join(thumbDir, `${sec}.png`);
      try {
        const body = await fs.readFile(thumbPath);
        const key = `${thumbPrefix}/${sec}.png`;
        const result = await uploadBufferToR2(key, body, "image/png");
        thumbnailResults.push({ sec, key: result.Key, location: result.Location });
      } catch {
        // Skip if frame not available (e.g. video shorter than 30s)
      }
    }

    // 5. Set existing assets (e.g. MP4) to non-primary, create HLS as new primary, update video
    await prisma.videoAsset.updateMany({
      where: { videoId },
      data: { isPrimary: false },
    });
    const hlsAsset = await prisma.videoAsset.create({
      data: {
        appId,
        videoId,
        assetType: "hls",
        storageProvider: "r2",
        storageKey: manifestKey,
        cdnUrl: manifestResult.Location,
        mimeType: "application/vnd.apple.mpegurl",
        width: HLS_WIDTH,
        height: HLS_HEIGHT,
        isPrimary: true,
      },
    });

    for (const { sec, key, location } of thumbnailResults) {
      await prisma.videoAsset.create({
        data: {
          appId,
          videoId,
          assetType: "thumbnail",
          variantLabel: String(sec),
          storageProvider: "r2",
          storageKey: key,
          cdnUrl: location,
          mimeType: "image/png",
          width: HLS_WIDTH,
          height: HLS_HEIGHT,
          isPrimary: false,
        },
      });
    }

    await prisma.video.update({
      where: { id: videoId },
      data: {
        primaryAssetId: hlsAsset.id,
        aspectRatio: ASPECT_RATIO_9_16,
      },
    });
  } catch (err) {
    // Video already has MP4 and status "ready"; don't set "failed" so feed still shows it
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
