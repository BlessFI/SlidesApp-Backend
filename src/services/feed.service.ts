import { prisma } from "../lib/prisma.js";

export interface FeedQuery {
  appId: string;
  categoryIds?: string[];
  topicIds?: string[];
  subjectIds?: string[];
  limit?: number;
  cursor?: string;
}

export async function getFeedForApp(query: FeedQuery) {
  const limit = Math.min(Math.max(1, query.limit ?? 50), 100);
  const where = {
    appId: query.appId,
    status: "ready" as const,
    ...(query.categoryIds?.length ? { categoryId: query.categoryIds.length === 1 ? query.categoryIds[0] : { in: query.categoryIds } } : {}),
    ...(query.topicIds?.length ? { topicId: query.topicIds.length === 1 ? query.topicIds[0] : { in: query.topicIds } } : {}),
    ...(query.subjectIds?.length ? { subjectId: query.subjectIds.length === 1 ? query.subjectIds[0] : { in: query.subjectIds } } : {}),
  };

  const videos = await prisma.video.findMany({
    where,
    take: limit + 1,
    cursor: query.cursor ? { id: query.cursor } : undefined,
    orderBy: [{ rankingScore: "desc" }, { createdAt: "desc" }],
    include: {
      primaryAsset: true,
      assets: {
        select: { assetType: true, variantLabel: true, cdnUrl: true },
      },
      category: { select: { id: true, name: true, slug: true } },
      topic: { select: { id: true, name: true, slug: true } },
      subject: { select: { id: true, name: true, slug: true } },
    },
  });

  const hasMore = videos.length > limit;
  const items = hasMore ? videos.slice(0, limit) : videos;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  const feed = items.map((v) => {
    const assets = v.assets ?? [];
    const thumbnails = assets
      .filter((a) => a.assetType === "thumbnail" && a.variantLabel)
      .reduce<Record<string, string>>((acc, a) => {
        if (a.variantLabel) acc[a.variantLabel] = a.cdnUrl;
        return acc;
      }, {});
    const mp4Asset = assets.find((a) => a.assetType === "master");
    return {
      id: v.id,
      guid: v.guid ?? v.id,
      title: v.title,
      description: v.description,
      durationMs: v.durationMs,
      aspectRatio: v.aspectRatio != null ? Number(v.aspectRatio) : null,
      url: v.primaryAsset?.cdnUrl ?? null,
      mp4Url: mp4Asset?.cdnUrl ?? null,
      thumbnailUrl: thumbnails["5"] ?? thumbnails["15"] ?? thumbnails["30"] ?? null,
      thumbnailUrls: thumbnails as { "5"?: string; "15"?: string; "30"?: string },
      category: v.category ? { id: v.category.id, name: v.category.name, slug: v.category.slug } : null,
      topic: v.topic ? { id: v.topic.id, name: v.topic.name, slug: v.topic.slug } : null,
      subject: v.subject ? { id: v.subject.id, name: v.subject.name, slug: v.subject.slug } : null,
      likeCount: v.likeCount,
      upVoteCount: v.upVoteCount,
      superVoteCount: v.superVoteCount,
      createdAt: v.createdAt.toISOString(),
    };
  });

  return { items: feed, nextCursor, hasMore };
}
