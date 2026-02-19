/**
 * Video create, get, and update (upload).
 * POST /api/videos — create video (videoUrl or videoBase64). Auth required.
 * GET /api/videos — list videos the current user posted (same app as token). Auth required.
 * GET /api/videos/:videoId — fetch a single video (same app as token). Auth required.
 * PATCH /api/videos/:videoId — update video metadata and/or upload new primary/thumbnail. Auth required.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as videoService from "../services/video.service.js";
import { authGuard, type TenantContext } from "../plugins/authGuard.js";

type AuthenticatedRequest = FastifyRequest & TenantContext;

const createVideoSchema = {
  body: {
    type: "object",
    required: ["durationMs"],
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      categoryIds: { type: "array", items: { type: "string", format: "uuid" } },
      topicIds: { type: "array", items: { type: "string", format: "uuid" } },
      subjectIds: { type: "array", items: { type: "string", format: "uuid" } },
      durationMs: { type: "number" },
      aspectRatio: { type: "number" },
      videoUrl: { type: "string" },
      videoBase64: { type: "string" },
      thumbnailBase64: { type: "string" },
    },
  },
};

const updateVideoSchema = {
  body: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      categoryIds: { type: "array", items: { type: "string", format: "uuid" } },
      topicIds: { type: "array", items: { type: "string", format: "uuid" } },
      subjectIds: { type: "array", items: { type: "string", format: "uuid" } },
      durationMs: { type: "number" },
      aspectRatio: { type: "number" },
      videoBase64: { type: "string" },
      thumbnailBase64: { type: "string" },
    },
  },
};

export default async function videoRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      title?: string;
      description?: string;
      categoryIds?: string[];
      topicIds?: string[];
      subjectIds?: string[];
      durationMs: number;
      aspectRatio?: number;
      videoUrl?: string;
      videoBase64?: string;
      thumbnailBase64?: string;
    };
  }>(
    "/",
    { schema: createVideoSchema, preHandler: authGuard },
    async (
      request: FastifyRequest<{
        Body: {
          title?: string;
          description?: string;
          categoryIds?: string[];
          topicIds?: string[];
          subjectIds?: string[];
          durationMs: number;
          aspectRatio?: number;
          videoUrl?: string;
          videoBase64?: string;
          thumbnailBase64?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const req = request as AuthenticatedRequest;
      const body = request.body;
      try {
        const video = await videoService.createVideo({
          appId: req.appId,
          creatorId: req.userId,
          title: body.title ?? null,
          description: body.description ?? null,
          categoryIds: body.categoryIds ?? [],
          topicIds: body.topicIds ?? [],
          subjectIds: body.subjectIds ?? [],
          durationMs: body.durationMs,
          aspectRatio: body.aspectRatio ?? null,
          videoUrl: body.videoUrl ?? null,
          videoBase64: body.videoBase64 ?? null,
          thumbnailBase64: body.thumbnailBase64 ?? null,
        });
        return reply.status(201).send(video);
      } catch (e) {
        const err = e as Error;
        if (err.message?.includes("Either videoUrl or videoBase64")) {
          return reply.status(400).send({ error: err.message });
        }
        if (err.message?.includes("Missing Cloudflare R2")) {
          return reply.status(503).send({ error: "Upload service unavailable" });
        }
        throw e;
      }
    }
  );

  fastify.get<{ Querystring: { limit?: string; cursor?: string } }>(
    "/",
    { preHandler: authGuard },
    async (
      request: FastifyRequest<{ Querystring: { limit?: string; cursor?: string } }>,
      reply: FastifyReply
    ) => {
      const req = request as AuthenticatedRequest;
      const q = request.query;
      const limit = q.limit ? Math.min(100, parseInt(q.limit, 10) || 50) : 50;
      const result = await videoService.getMyVideos(req.appId, req.userId, {
        limit,
        cursor: q.cursor ?? undefined,
      });
      return reply.send(result);
    }
  );

  fastify.get<{ Params: { videoId: string } }>(
    "/:videoId",
    { preHandler: authGuard },
    async (
      request: FastifyRequest<{ Params: { videoId: string } }>,
      reply: FastifyReply
    ) => {
      const req = request as AuthenticatedRequest;
      const { videoId } = request.params;
      const video = await videoService.getVideo(req.appId, videoId);
      if (!video) {
        return reply.status(404).send({ error: "Video not found" });
      }
      return reply.send(video);
    }
  );

  fastify.patch<{
    Params: { videoId: string };
    Body: {
      title?: string;
      description?: string;
      categoryIds?: string[];
      topicIds?: string[];
      subjectIds?: string[];
      durationMs?: number;
      aspectRatio?: number;
      videoBase64?: string;
      thumbnailBase64?: string;
    };
  }>(
    "/:videoId",
    { schema: updateVideoSchema, preHandler: authGuard },
    async (
      request: FastifyRequest<{
        Params: { videoId: string };
        Body: {
          title?: string;
          description?: string;
          categoryIds?: string[];
          topicIds?: string[];
          subjectIds?: string[];
          durationMs?: number;
          aspectRatio?: number;
          videoBase64?: string;
          thumbnailBase64?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const req = request as AuthenticatedRequest;
      const { videoId } = request.params;
      const body = request.body;
      try {
        const video = await videoService.updateVideo({
          appId: req.appId,
          userId: req.userId,
          videoId,
          title: body.title,
          description: body.description,
          categoryIds: body.categoryIds,
          topicIds: body.topicIds,
          subjectIds: body.subjectIds,
          durationMs: body.durationMs,
          aspectRatio: body.aspectRatio,
          videoBase64: body.videoBase64,
          thumbnailBase64: body.thumbnailBase64,
        });
        if (!video) {
          return reply.status(404).send({ error: "Video not found" });
        }
        return reply.send(video);
      } catch (e) {
        const err = e as Error;
        if (err.message?.includes("Missing Cloudflare R2")) {
          return reply.status(503).send({ error: "Upload service unavailable" });
        }
        throw e;
      }
    }
  );
}
