import { prisma } from "../lib/prisma.js";
import { getVoteFlagsByUserForVideos } from "./vote.service.js";

export interface FeedQuery {
  appId: string;
  /** If set, include like_by_you, upvote_by_you, supervote_by_you per item */
  userId?: string | null;
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

  let voteFlagsMap = new Map<string, { like: boolean; up_vote: boolean; super_vote: boolean }>();
  if (query.userId && items.length > 0) {
    voteFlagsMap = await getVoteFlagsByUserForVideos(
      query.userId,
      items.map((v) => v.id)
    );
  }

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
    const flags = voteFlagsMap.get(v.id) ?? { like: false, up_vote: false, super_vote: false };
    const item = {
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
      like_by_you: Boolean(flags.like),
      upvote_by_you: Boolean(flags.up_vote),
      supervote_by_you: Boolean(flags.super_vote),
    };
    return item;
  });

  return { items: feed, nextCursor, hasMore };
}
