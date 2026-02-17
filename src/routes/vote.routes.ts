/**
 * Video interactions: like, up_vote, super_vote.
 * POST /api/videos/:videoId/vote — requires JWT (app + user). Body: voteType, optional gestureSource, requestId, rankPosition, feedMode.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as voteService from "../services/vote.service.js";
import { authGuard, type TenantContext } from "../plugins/authGuard.js";
import { prisma } from "../lib/prisma.js";

type AuthenticatedRequest = FastifyRequest & TenantContext;

const voteTypeSchema = {
  body: {
    type: "object",
    required: ["voteType"],
    properties: {
      voteType: { type: "string", enum: ["like", "up_vote", "super_vote"] },
      gestureSource: { type: "string" },
      requestId: { type: "string" },
      rankPosition: { type: "number" },
      feedMode: { type: "string" },
    },
  },
};

export default async function voteRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Params: { videoId: string };
    Body: { voteType: string; gestureSource?: string; requestId?: string; rankPosition?: number; feedMode?: string };
  }>(
    "/:videoId/vote",
    { schema: voteTypeSchema, preHandler: authGuard },
    async (request: FastifyRequest<{ Params: { videoId: string }; Body: { voteType: string; gestureSource?: string; requestId?: string; rankPosition?: number; feedMode?: string } }>, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest;
      const { videoId } = request.params;
      const body = request.body;

      const voteType = body.voteType as voteService.VoteType;
      if (!["like", "up_vote", "super_vote"].includes(voteType)) {
        return reply.status(400).send({ error: "voteType must be like, up_vote, or super_vote" });
      }

      const video = await prisma.video.findFirst({
        where: { id: videoId, appId: req.appId },
      });
      if (!video) {
        return reply.status(404).send({ error: "Video not found" });
      }

      const result = await voteService.createVote({
        appId: req.appId,
        videoId,
        userId: req.userId,
        voteType,
        gestureSource: body.gestureSource ?? undefined,
        requestId: body.requestId ?? undefined,
        rankPosition: body.rankPosition ?? undefined,
        feedMode: body.feedMode ?? undefined,
      });

      return reply.status(201).send(result);
    }
  );
}
