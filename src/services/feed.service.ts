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
    ...(query.categoryIds?.length ? { categoryIds: { hasSome: query.categoryIds } } : {}),
    ...(query.topicIds?.length ? { topicIds: { hasSome: query.topicIds } } : {}),
    ...(query.subjectIds?.length ? { subjectIds: { hasSome: query.subjectIds } } : {}),
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
    },
  });

  const hasMore = videos.length > limit;
  const items = hasMore ? videos.slice(0, limit) : videos;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  const allCategoryIds = [...new Set(items.flatMap((v) => v.categoryIds))];
  const allTopicIds = [...new Set(items.flatMap((v) => v.topicIds))];
  const allSubjectIds = [...new Set(items.flatMap((v) => v.subjectIds))];
  const [categoryNodes, topicNodes, subjectNodes] = await Promise.all([
    allCategoryIds.length ? prisma.taxonomyNode.findMany({ where: { id: { in: allCategoryIds } }, select: { id: true, name: true, slug: true } }) : [],
    allTopicIds.length ? prisma.taxonomyNode.findMany({ where: { id: { in: allTopicIds } }, select: { id: true, name: true, slug: true } }) : [],
    allSubjectIds.length ? prisma.taxonomyNode.findMany({ where: { id: { in: allSubjectIds } }, select: { id: true, name: true, slug: true } }) : [],
  ]);
  const categoryMap = new Map(categoryNodes.map((n) => [n.id, n]));
  const topicMap = new Map(topicNodes.map((n) => [n.id, n]));
  const subjectMap = new Map(subjectNodes.map((n) => [n.id, n]));

  const feed = items.map((v) => {
    const assets = v.assets ?? [];
    const thumbnails = assets
      .filter((a) => a.assetType === "thumbnail" && a.variantLabel)
      .reduce<Record<string, string>>((acc, a) => {
        if (a.variantLabel) acc[a.variantLabel] = a.cdnUrl;
        return acc;
      }, {});
    const mp4Asset = assets.find((a) => a.assetType === "master");
    const categories = v.categoryIds.map((id) => categoryMap.get(id)).filter(Boolean) as { id: string; name: string; slug: string | null }[];
    const topics = v.topicIds.map((id) => topicMap.get(id)).filter(Boolean) as { id: string; name: string; slug: string | null }[];
    const subjects = v.subjectIds.map((id) => subjectMap.get(id)).filter(Boolean) as { id: string; name: string; slug: string | null }[];
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
      categories,
      topics,
      subjects,
      likeCount: v.likeCount,
      upVoteCount: v.upVoteCount,
      superVoteCount: v.superVoteCount,
      createdAt: v.createdAt.toISOString(),
    };
  });

  return { items: feed, nextCursor, hasMore };
}
