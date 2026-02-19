import { prisma } from "../lib/prisma.js";
import {
  uploadBase64ImageToS3,
  isBase64Upload,
  type UploadResult,
} from "../lib/r2.js";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { processVideo } from "./transcode.service.js";
import { enqueueProcessVideo } from "../queues/videoQueue.js";

export interface CreateVideoInput {
  appId: string;
  creatorId: string;
  title?: string | null;
  description?: string | null;
  topicId?: string | null;
  categoryId?: string | null;
  subjectId?: string | null;
  durationMs: number;
  aspectRatio?: number | null;
  /** Existing video URL; used when not uploading base64. */
  videoUrl?: string | null;
  /** Base64 or data URL video to upload to R2. */
  videoBase64?: string | null;
  /** Base64 or data URL thumbnail to upload to R2. */
  thumbnailBase64?: string | null;
}

export interface UpdateVideoInput {
  appId: string;
  userId: string;
  videoId: string;
  title?: string | null;
  description?: string | null;
  topicId?: string | null;
  categoryId?: string | null;
  subjectId?: string | null;
  durationMs?: number;
  aspectRatio?: number | null;
  /** New primary video: base64 or data URL to upload to R2. */
  videoBase64?: string | null;
  /** New thumbnail: base64 or data URL to upload to R2. */
  thumbnailBase64?: string | null;
}

function buildR2Key(prefix: string, ext: string): string {
  return `${prefix}/${randomUUID()}.${ext}`;
}

async function uploadVideoToR2(
  videoBase64: string,
  keyPrefix: string,
  appId: string
): Promise<UploadResult> {
  const key = buildR2Key(`${keyPrefix}/${appId}`, "mp4");
  return uploadBase64ImageToS3(videoBase64, key, { mime: "video/mp4" });
}

async function uploadThumbnailToR2(
  thumbnailBase64: string,
  keyPrefix: string,
  appId: string
): Promise<UploadResult> {
  const key = buildR2Key(`${keyPrefix}/${appId}`, "png");
  return uploadBase64ImageToS3(thumbnailBase64, key);
}

async function writeSourceToTemp(
  videoBase64?: string | null,
  videoUrl?: string | null
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "upload-"));
  const sourcePath = path.join(tmpDir, "source.mp4");
  if (videoBase64 && isBase64Upload(videoBase64)) {
    let base64Data = videoBase64;
    if (videoBase64.startsWith("data:")) {
      const comma = videoBase64.indexOf(",");
      base64Data = videoBase64.slice(comma + 1);
    }
    await fs.writeFile(sourcePath, Buffer.from(base64Data, "base64"));
    return sourcePath;
  }
  if (videoUrl?.trim()) {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error("Failed to download video from URL");
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(sourcePath, buf);
    return sourcePath;
  }
  throw new Error("Either videoUrl or videoBase64 is required");
}

export async function createVideo(input: CreateVideoInput) {
  const hasUpload = isBase64Upload(input.videoBase64 ?? "");
  const hasUrl = !!input.videoUrl?.trim();
  if (!hasUpload && !hasUrl) {
    throw new Error("Either videoUrl or videoBase64 is required");
  }

  const sourcePath = await writeSourceToTemp(input.videoBase64, input.videoUrl);

  const video = await prisma.video.create({
    data: {
      appId: input.appId,
      creatorId: input.creatorId,
      status: "processing",
      title: input.title ?? null,
      description: input.description ?? null,
      topicId: input.topicId ?? null,
      categoryId: input.categoryId ?? null,
      subjectId: input.subjectId ?? null,
      durationMs: input.durationMs,
      aspectRatio: null,
      primaryAssetId: null,
    },
  });

  const enqueued = await enqueueProcessVideo(video.id, input.appId, sourcePath);
  if (!enqueued) {
    processVideo({ videoId: video.id, appId: input.appId, sourcePath })
      .catch((err) => {
        console.error("processVideo failed", video.id, err);
      })
      .finally(() => {
        fs.rm(path.dirname(sourcePath), { recursive: true, force: true }).catch(() => {});
      });
  }

  return prisma.video.findUniqueOrThrow({
    where: { id: video.id },
    include: { assets: true, primaryAsset: true },
  });
}

export async function getVideo(appId: string, videoId: string) {
  return prisma.video.findFirst({
    where: { id: videoId, appId },
    include: {
      assets: true,
      primaryAsset: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  });
}

export async function updateVideo(input: UpdateVideoInput) {
  const video = await prisma.video.findFirst({
    where: { id: input.videoId, appId: input.appId },
    include: { assets: true },
  });
  if (!video) return null;
  if (video.creatorId !== input.userId) return null;

  let newPrimaryAssetId: string | undefined;

  if (input.videoBase64 && isBase64Upload(input.videoBase64)) {
    const result = await uploadVideoToR2(
      input.videoBase64,
      "videos",
      input.appId
    );
    const asset = await prisma.videoAsset.create({
      data: {
        appId: input.appId,
        videoId: video.id,
        assetType: "master",
        storageProvider: "r2",
        storageKey: result.Key,
        cdnUrl: result.Location,
        mimeType: "video/mp4",
        isPrimary: true,
      },
    });
    newPrimaryAssetId = asset.id;
    await prisma.videoAsset.updateMany({
      where: { videoId: video.id },
      data: { isPrimary: false },
    });
  }

  if (input.thumbnailBase64 && isBase64Upload(input.thumbnailBase64)) {
    const result = await uploadThumbnailToR2(
      input.thumbnailBase64,
      "thumbnails",
      input.appId
    );
    await prisma.videoAsset.create({
      data: {
        appId: input.appId,
        videoId: video.id,
        assetType: "thumbnail",
        storageProvider: "r2",
        storageKey: result.Key,
        cdnUrl: result.Location,
        mimeType: "image/png",
        isPrimary: false,
      },
    });
  }

  const updateData: Parameters<typeof prisma.video.update>[0]["data"] = {
    title: input.title !== undefined ? input.title : undefined,
    description: input.description !== undefined ? input.description : undefined,
    topicId: input.topicId !== undefined ? input.topicId : undefined,
    categoryId: input.categoryId !== undefined ? input.categoryId : undefined,
    subjectId: input.subjectId !== undefined ? input.subjectId : undefined,
    durationMs: input.durationMs,
    aspectRatio: input.aspectRatio !== undefined ? input.aspectRatio : undefined,
  };
  if (newPrimaryAssetId) updateData.primaryAssetId = newPrimaryAssetId;
  const filtered = Object.fromEntries(
    Object.entries(updateData).filter(([, v]) => v !== undefined)
  ) as Parameters<typeof prisma.video.update>[0]["data"];

  await prisma.video.update({
    where: { id: video.id },
    data: filtered,
  });

  return prisma.video.findUniqueOrThrow({
    where: { id: video.id },
    include: { assets: true, primaryAsset: true },
  });
}
