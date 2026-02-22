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
import { validateTaxonomyIds } from "./taxonomy.service.js";
import { getVoteFlagsByUserForVideos } from "./vote.service.js";

export const TAGGING_SOURCE = ["manual", "rule", "ai_suggested", "ai_confirmed"] as const;
export type TaggingSource = (typeof TAGGING_SOURCE)[number];

export interface CreateVideoInput {
  appId: string;
  creatorId: string;
  title?: string | null;
  description?: string | null;
  /** Required: exactly one primary category UUID (powers "Same Category", feed). Must exist in app taxonomy (kind=category). */
  primaryCategoryId: string;
  /** Optional: secondary labels e.g. ["Weather", "Fashion"] (mapped to primary for display). */
  secondaryLabels?: string[];
  /** Optional: ingest rules may set; otherwise leave empty. topicIds/subjectIds for future derivation. */
  categoryIds?: string[];
  topicIds?: string[];
  subjectIds?: string[];
  /** Ingest source key for deterministic defaults (e.g. "partner_x" → default primary category). */
  ingestSource?: string | null;
  durationMs: number;
  aspectRatio?: number | null;
  videoUrl?: string | null;
  videoBase64?: string | null;
  thumbnailBase64?: string | null;
}

export interface UpdateVideoInput {
  appId: string;
  userId: string;
  videoId: string;
  title?: string | null;
  description?: string | null;
  primaryCategoryId?: string | null;
  secondaryLabels?: string[];
  categoryIds?: string[];
  topicIds?: string[];
  subjectIds?: string[];
  taggingSource?: TaggingSource | null;
  durationMs?: number;
  aspectRatio?: number | null;
  videoBase64?: string | null;
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

  let primaryCategoryId = input.primaryCategoryId;
  let secondaryLabels = input.secondaryLabels ?? [];
  let categoryIds = input.categoryIds ?? [];
  let topicIds = input.topicIds ?? [];
  let subjectIds = input.subjectIds ?? [];
  let taggingSource: TaggingSource = "manual";

  if (input.ingestSource?.trim()) {
    const rule = await prisma.ingestDefaultRule.findUnique({
      where: { appId_sourceKey: { appId: input.appId, sourceKey: input.ingestSource.trim() } },
    });
    if (rule) {
      if (rule.defaultCategoryIds.length > 0) {
        primaryCategoryId = primaryCategoryId || rule.defaultCategoryIds[0];
        if (categoryIds.length === 0) categoryIds = rule.defaultCategoryIds;
      }
      if (topicIds.length === 0) topicIds = rule.defaultTopicIds;
      if (subjectIds.length === 0) subjectIds = rule.defaultSubjectIds;
      taggingSource = "rule";
    }
  }

  const validation = await validateTaxonomyIds(input.appId, {
    categoryIds: primaryCategoryId ? [primaryCategoryId] : undefined,
    topicIds: topicIds.length ? topicIds : undefined,
    subjectIds: subjectIds.length ? subjectIds : undefined,
  });
  if (!validation.valid) {
    const msg = [
      validation.invalidCategoryIds?.length ? `Invalid primary category ID: ${validation.invalidCategoryIds.join(", ")}` : null,
      validation.invalidTopicIds?.length ? `Invalid topic IDs: ${validation.invalidTopicIds.join(", ")}` : null,
      validation.invalidSubjectIds?.length ? `Invalid subject IDs: ${validation.invalidSubjectIds.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(msg);
  }

  const categoryIdsForVideo = categoryIds.length > 0 ? categoryIds : [primaryCategoryId];

  const sourcePath = await writeSourceToTemp(input.videoBase64, input.videoUrl);

  const video = await prisma.video.create({
    data: {
      appId: input.appId,
      creatorId: input.creatorId,
      status: "processing",
      title: input.title ?? null,
      description: input.description ?? null,
      primaryCategoryId,
      secondaryLabels,
      categoryIds: categoryIdsForVideo,
      topicIds,
      subjectIds,
      ingestSource: input.ingestSource?.trim() ?? null,
      taggingSource,
      durationMs: input.durationMs,
      aspectRatio: null,
      primaryAssetId: null,
    },
  });

  // MP4 upload + HLS run in the worker; API returns immediately
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

  const created = await prisma.video.findUniqueOrThrow({
    where: { id: video.id },
    include: { assets: true, primaryAsset: true },
  });
  const [categories, topics, subjects, primaryCategory] = await Promise.all([
    created.categoryIds.length
      ? prisma.taxonomyNode.findMany({ where: { id: { in: created.categoryIds } }, select: { id: true, name: true, slug: true } })
      : [],
    created.topicIds.length
      ? prisma.taxonomyNode.findMany({ where: { id: { in: created.topicIds } }, select: { id: true, name: true, slug: true } })
      : [],
    created.subjectIds.length
      ? prisma.taxonomyNode.findMany({ where: { id: { in: created.subjectIds } }, select: { id: true, name: true, slug: true } })
      : [],
    created.primaryCategoryId
      ? prisma.taxonomyNode.findUnique({ where: { id: created.primaryCategoryId }, select: { id: true, name: true, slug: true } })
      : null,
  ]);
  return { ...created, categories, topics, subjects, primaryCategory: primaryCategory ?? undefined };
}

export async function getVideo(appId: string, videoId: string, userId?: string | null) {
  const video = await prisma.video.findFirst({
    where: { id: videoId, appId },
    include: { assets: true, primaryAsset: true },
  });
  if (!video) return null;
  const [categories, topics, subjects, primaryCategory, voteFlagsMap] = await Promise.all([
    video.categoryIds.length
      ? prisma.taxonomyNode.findMany({ where: { id: { in: video.categoryIds } }, select: { id: true, name: true, slug: true } })
      : [],
    video.topicIds.length
      ? prisma.taxonomyNode.findMany({ where: { id: { in: video.topicIds } }, select: { id: true, name: true, slug: true } })
      : [],
    video.subjectIds.length
      ? prisma.taxonomyNode.findMany({ where: { id: { in: video.subjectIds } }, select: { id: true, name: true, slug: true } })
      : [],
    video.primaryCategoryId
      ? prisma.taxonomyNode.findUnique({ where: { id: video.primaryCategoryId }, select: { id: true, name: true, slug: true } })
      : null,
    userId ? getVoteFlagsByUserForVideos(userId, [videoId]) : Promise.resolve(new Map()),
  ]);
  const flags = voteFlagsMap.get(videoId) ?? { like: false, up_vote: false, super_vote: false };
  return {
    ...video,
    categories,
    topics,
    subjects,
    primaryCategory: primaryCategory ?? undefined,
    secondaryLabels: video.secondaryLabels ?? [],
    like_by_you: flags.like,
    upvote_by_you: flags.up_vote,
    supervote_by_you: flags.super_vote,
  };
}

export async function getMyVideos(
  appId: string,
  creatorId: string,
  opts?: { limit?: number; cursor?: string }
) {
  const limit = Math.min(Math.max(1, opts?.limit ?? 50), 100);
  const videos = await prisma.video.findMany({
    where: { appId, creatorId },
    take: limit + 1,
    cursor: opts?.cursor ? { id: opts.cursor } : undefined,
    orderBy: { createdAt: "desc" },
    include: { assets: true, primaryAsset: true },
  });
  const hasMore = videos.length > limit;
  const items = hasMore ? videos.slice(0, limit) : videos;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;
  const allCategoryIds = [...new Set(items.flatMap((v) => [...v.categoryIds, v.primaryCategoryId].filter(Boolean) as string[]))];
  const allTopicIds = [...new Set(items.flatMap((v) => v.topicIds))];
  const allSubjectIds = [...new Set(items.flatMap((v) => v.subjectIds))];
  const [categoryNodes, topicNodes, subjectNodes, voteFlagsMap] = await Promise.all([
    allCategoryIds.length ? prisma.taxonomyNode.findMany({ where: { id: { in: allCategoryIds } }, select: { id: true, name: true, slug: true } }) : [],
    allTopicIds.length ? prisma.taxonomyNode.findMany({ where: { id: { in: allTopicIds } }, select: { id: true, name: true, slug: true } }) : [],
    allSubjectIds.length ? prisma.taxonomyNode.findMany({ where: { id: { in: allSubjectIds } }, select: { id: true, name: true, slug: true } }) : [],
    getVoteFlagsByUserForVideos(creatorId, items.map((v) => v.id)),
  ]);
  const categoryMap = new Map(categoryNodes.map((n) => [n.id, n]));
  const topicMap = new Map(topicNodes.map((n) => [n.id, n]));
  const subjectMap = new Map(subjectNodes.map((n) => [n.id, n]));
  const videosWithTaxonomy = items.map((v) => {
    const flags = voteFlagsMap.get(v.id) ?? { like: false, up_vote: false, super_vote: false };
    const primaryCategory = v.primaryCategoryId ? categoryMap.get(v.primaryCategoryId) : undefined;
    return {
      ...v,
      categories: v.categoryIds.map((id) => categoryMap.get(id)).filter(Boolean) as { id: string; name: string; slug: string | null }[],
      topics: v.topicIds.map((id) => topicMap.get(id)).filter(Boolean) as { id: string; name: string; slug: string | null }[],
      subjects: v.subjectIds.map((id) => subjectMap.get(id)).filter(Boolean) as { id: string; name: string; slug: string | null }[],
      primaryCategory: primaryCategory ?? undefined,
      secondaryLabels: v.secondaryLabels ?? [],
      like_by_you: flags.like,
      upvote_by_you: flags.up_vote,
      supervote_by_you: flags.super_vote,
    };
  });
  return { videos: videosWithTaxonomy, nextCursor, hasMore };
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

  if (
    input.primaryCategoryId !== undefined ||
    input.categoryIds !== undefined ||
    input.topicIds !== undefined ||
    input.subjectIds !== undefined
  ) {
    const validation = await validateTaxonomyIds(input.appId, {
      categoryIds:
        input.primaryCategoryId !== undefined
          ? [input.primaryCategoryId]
          : input.categoryIds?.length
            ? input.categoryIds
            : undefined,
      topicIds: input.topicIds?.length ? input.topicIds : undefined,
      subjectIds: input.subjectIds?.length ? input.subjectIds : undefined,
    });
    if (!validation.valid) {
      const msg = [
        validation.invalidCategoryIds?.length ? `Invalid category/primary category IDs: ${validation.invalidCategoryIds.join(", ")}` : null,
        validation.invalidTopicIds?.length ? `Invalid topic IDs: ${validation.invalidTopicIds.join(", ")}` : null,
        validation.invalidSubjectIds?.length ? `Invalid subject IDs: ${validation.invalidSubjectIds.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      throw new Error(msg);
    }
  }

  const updateData: Parameters<typeof prisma.video.update>[0]["data"] = {
    title: input.title !== undefined ? input.title : undefined,
    description: input.description !== undefined ? input.description : undefined,
    primaryCategoryId: input.primaryCategoryId !== undefined ? input.primaryCategoryId : undefined,
    secondaryLabels: input.secondaryLabels !== undefined ? input.secondaryLabels : undefined,
    categoryIds: input.categoryIds !== undefined ? input.categoryIds : undefined,
    topicIds: input.topicIds !== undefined ? input.topicIds : undefined,
    subjectIds: input.subjectIds !== undefined ? input.subjectIds : undefined,
    taggingSource: input.taggingSource !== undefined ? input.taggingSource : undefined,
    durationMs: input.durationMs,
    aspectRatio: input.aspectRatio !== undefined ? input.aspectRatio : undefined,
  };
  if (input.primaryCategoryId !== undefined && input.categoryIds === undefined) {
    updateData.categoryIds = [input.primaryCategoryId];
  }
  if (newPrimaryAssetId) updateData.primaryAssetId = newPrimaryAssetId;
  const filtered = Object.fromEntries(
    Object.entries(updateData).filter(([, v]) => v !== undefined)
  ) as Parameters<typeof prisma.video.update>[0]["data"];

  await prisma.video.update({
    where: { id: video.id },
    data: filtered,
  });

  const updated = await prisma.video.findUniqueOrThrow({
    where: { id: video.id },
    include: { assets: true, primaryAsset: true },
  });
  const [categories, topics, subjects, primaryCategory] = await Promise.all([
    updated.categoryIds.length
      ? prisma.taxonomyNode.findMany({ where: { id: { in: updated.categoryIds } }, select: { id: true, name: true, slug: true } })
      : [],
    updated.topicIds.length
      ? prisma.taxonomyNode.findMany({ where: { id: { in: updated.topicIds } }, select: { id: true, name: true, slug: true } })
      : [],
    updated.subjectIds.length
      ? prisma.taxonomyNode.findMany({ where: { id: { in: updated.subjectIds } }, select: { id: true, name: true, slug: true } })
      : [],
    updated.primaryCategoryId
      ? prisma.taxonomyNode.findUnique({ where: { id: updated.primaryCategoryId }, select: { id: true, name: true, slug: true } })
      : null,
  ]);
  return { ...updated, categories, topics, subjects, primaryCategory: primaryCategory ?? undefined };
}

export interface BulkTagInput {
  appId: string;
  userId: string;
  videoIds: string[];
  categoryIds?: string[];
  topicIds?: string[];
  subjectIds?: string[];
  taggingSource?: TaggingSource | null;
}

/**
 * Bulk update tags (and optionally tagging_source) for multiple videos in the app.
 * Only videos in the app are updated. Validates taxonomy IDs.
 */
export async function bulkTagVideos(input: BulkTagInput): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  if (input.videoIds.length === 0) {
    return { updated: 0, errors: ["videoIds must not be empty"] };
  }

  if (
    (input.categoryIds?.length ?? 0) > 0 ||
    (input.topicIds?.length ?? 0) > 0 ||
    (input.subjectIds?.length ?? 0) > 0
  ) {
    const validation = await validateTaxonomyIds(input.appId, {
      categoryIds: input.categoryIds,
      topicIds: input.topicIds,
      subjectIds: input.subjectIds,
    });
    if (!validation.valid) {
      if (validation.invalidCategoryIds?.length)
        errors.push(`Invalid category IDs: ${validation.invalidCategoryIds.join(", ")}`);
      if (validation.invalidTopicIds?.length)
        errors.push(`Invalid topic IDs: ${validation.invalidTopicIds.join(", ")}`);
      if (validation.invalidSubjectIds?.length)
        errors.push(`Invalid subject IDs: ${validation.invalidSubjectIds.join(", ")}`);
      return { updated: 0, errors };
    }
  }

  const data: Parameters<typeof prisma.video.updateMany>[0]["data"] = {};
  if (input.categoryIds !== undefined) data.categoryIds = input.categoryIds;
  if (input.topicIds !== undefined) data.topicIds = input.topicIds;
  if (input.subjectIds !== undefined) data.subjectIds = input.subjectIds;
  if (input.taggingSource !== undefined) data.taggingSource = input.taggingSource;

  if (Object.keys(data).length === 0) {
    return { updated: 0, errors: ["Provide at least one of categoryIds, topicIds, subjectIds, taggingSource"] };
  }

  const result = await prisma.video.updateMany({
    where: {
      id: { in: input.videoIds },
      appId: input.appId,
    },
    data,
  });

  return { updated: result.count, errors };
}
