import { prisma } from "../lib/prisma.js";

export interface FeedQuery {
  appId: string;
  categoryId?: string;
  limit?: number;
  cursor?: string;
}

export async function getFeedForApp(query: FeedQuery) {
  const limit = Math.min(Math.max(1, query.limit ?? 50), 100);
  const where = {
    appId: query.appId,
    status: "ready" as const,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
  };

  const videos = await prisma.video.findMany({
    where,
    take: limit + 1,
    cursor: query.cursor ? { id: query.cursor } : undefined,
    orderBy: [{ rankingScore: "desc" }, { createdAt: "desc" }],
    include: {
      primaryAsset: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  });

  const hasMore = videos.length > limit;
  const items = hasMore ? videos.slice(0, limit) : videos;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  const feed = items.map((v) => ({
    id: v.id,
    guid: v.guid ?? v.id,
    title: v.title,
    description: v.description,
    durationMs: v.durationMs,
    aspectRatio: v.aspectRatio != null ? Number(v.aspectRatio) : null,
    url: v.primaryAsset?.cdnUrl ?? null,
    thumbnailUrl: null as string | null, // could be resolved from assets with assetType=thumbnail
    category: v.category ? { id: v.category.id, name: v.category.name, slug: v.category.slug } : null,
    likeCount: v.likeCount,
    upVoteCount: v.upVoteCount,
    superVoteCount: v.superVoteCount,
    createdAt: v.createdAt.toISOString(),
  }));

  return { items: feed, nextCursor, hasMore };
}
