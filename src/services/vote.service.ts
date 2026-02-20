import { prisma } from "../lib/prisma.js";

const WEIGHT: Record<string, number> = {
  like: 1,
  up_vote: 3,
  super_vote: 10,
};

const GESTURE_SOURCE_DEFAULT: Record<string, string> = {
  like: "double_tap",
  up_vote: "triple_tap",
  super_vote: "s_gesture",
};

export type VoteType = "like" | "up_vote" | "super_vote";

export interface CreateVoteInput {
  appId: string;
  videoId: string;
  userId: string;
  voteType: VoteType;
  gestureSource?: string | null;
  requestId?: string | null;
  rankPosition?: number | null;
  feedMode?: string | null;
  isDenied?: boolean;
  denyReason?: string | null;
}

export interface VoteFlags {
  like: boolean;
  up_vote: boolean;
  super_vote: boolean;
}

/** Get which vote types the user has cast for each video (for feed/single video "by you" flags). */
export async function getVoteFlagsByUserForVideos(
  userId: string,
  videoIds: string[]
): Promise<Map<string, VoteFlags>> {
  if (videoIds.length === 0) return new Map();
  const votes = await prisma.vote.findMany({
    where: { userId, videoId: { in: videoIds } },
    select: { videoId: true, voteType: true },
  });
  const map = new Map<string, VoteFlags>();
  for (const id of videoIds) {
    map.set(id, { like: false, up_vote: false, super_vote: false });
  }
  for (const v of votes) {
    const flags = map.get(v.videoId)!;
    if (v.voteType === "like") flags.like = true;
    else if (v.voteType === "up_vote") flags.up_vote = true;
    else if (v.voteType === "super_vote") flags.super_vote = true;
  }
  return map;
}

export async function createVote(input: CreateVoteInput) {
  const weight = WEIGHT[input.voteType] ?? 1;
  const gestureSource = input.gestureSource ?? GESTURE_SOURCE_DEFAULT[input.voteType] ?? null;

  const [vote, video] = await prisma.$transaction(async (tx) => {
    const v = await tx.vote.create({
      data: {
        appId: input.appId,
        videoId: input.videoId,
        userId: input.userId,
        voteType: input.voteType,
        gestureSource,
        requestId: input.requestId ?? undefined,
        rankPosition: input.rankPosition ?? undefined,
        feedMode: input.feedMode ?? undefined,
        weight,
        isDenied: input.isDenied ?? false,
        denyReason: input.denyReason ?? undefined,
      },
    });

    if (!input.isDenied) {
      const field = input.voteType === "like" ? "likeCount" : input.voteType === "up_vote" ? "upVoteCount" : "superVoteCount";
      await tx.video.update({
        where: { id: input.videoId },
        data: { [field]: { increment: 1 } },
      });
    }

    const updated = await tx.video.findUniqueOrThrow({
      where: { id: input.videoId },
      select: { likeCount: true, upVoteCount: true, superVoteCount: true },
    });

    return [v, updated] as const;
  });

  return {
    vote: {
      id: vote.id,
      videoId: vote.videoId,
      voteType: vote.voteType,
      gestureSource: vote.gestureSource,
      weight: vote.weight,
      isDenied: vote.isDenied,
      denyReason: vote.denyReason,
      createdAt: vote.createdAt.toISOString(),
    },
    counts: {
      likeCount: video.likeCount,
      upVoteCount: video.upVoteCount,
      superVoteCount: video.superVoteCount,
    },
  };
}
