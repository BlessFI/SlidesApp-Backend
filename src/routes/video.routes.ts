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
    required: ["durationMs", "primaryCategoryId"],
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      primaryCategoryId: { type: "string", format: "uuid" },
      secondaryLabels: { type: "array", items: { type: "string" } },
      categoryIds: { type: "array", items: { type: "string", format: "uuid" } },
      topicIds: { type: "array", items: { type: "string", format: "uuid" } },
      subjectIds: { type: "array", items: { type: "string", format: "uuid" } },
      ingestSource: { type: "string" },
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
      primaryCategoryId: { type: "string", format: "uuid" },
      secondaryLabels: { type: "array", items: { type: "string" } },
      categoryIds: { type: "array", items: { type: "string", format: "uuid" } },
      topicIds: { type: "array", items: { type: "string", format: "uuid" } },
      subjectIds: { type: "array", items: { type: "string", format: "uuid" } },
      taggingSource: { type: "string", enum: ["manual", "rule", "ai_suggested", "ai_confirmed"] },
      durationMs: { type: "number" },
      aspectRatio: { type: "number" },
      videoBase64: { type: "string" },
      thumbnailBase64: { type: "string" },
    },
  },
};

const bulkTagSchema = {
  body: {
    type: "object",
    required: ["videoIds"],
    properties: {
      videoIds: { type: "array", items: { type: "string", format: "uuid" } },
      categoryIds: { type: "array", items: { type: "string", format: "uuid" } },
      topicIds: { type: "array", items: { type: "string", format: "uuid" } },
      subjectIds: { type: "array", items: { type: "string", format: "uuid" } },
      taggingSource: { type: "string", enum: ["manual", "rule", "ai_suggested", "ai_confirmed"] },
    },
  },
};

export default async function videoRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      title?: string;
      description?: string;
      primaryCategoryId: string;
      secondaryLabels?: string[];
      categoryIds?: string[];
      topicIds?: string[];
      subjectIds?: string[];
      ingestSource?: string;
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
          primaryCategoryId: string;
          secondaryLabels?: string[];
          categoryIds?: string[];
          topicIds?: string[];
          subjectIds?: string[];
          ingestSource?: string;
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
          primaryCategoryId: body.primaryCategoryId,
          secondaryLabels: body.secondaryLabels ?? undefined,
          categoryIds: body.categoryIds ?? undefined,
          topicIds: body.topicIds ?? undefined,
          subjectIds: body.subjectIds ?? undefined,
          ingestSource: body.ingestSource ?? null,
          durationMs: body.durationMs,
          aspectRatio: body.aspectRatio ?? null,
          videoUrl: body.videoUrl ?? null,
          videoBase64: body.videoBase64 ?? null,
          thumbnailBase64: body.thumbnailBase64 ?? null,
        });
        return reply.status(201).send(video);
      } catch (e) {
        const err = e as Error;
        if (err.message?.includes("Invalid category") || err.message?.includes("Invalid topic") || err.message?.includes("Invalid subject")) {
          return reply.status(400).send({ error: err.message });
        }
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
      const video = await videoService.getVideo(req.appId, videoId, req.userId);
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
      primaryCategoryId?: string;
      secondaryLabels?: string[];
      categoryIds?: string[];
      topicIds?: string[];
      subjectIds?: string[];
      taggingSource?: "manual" | "rule" | "ai_suggested" | "ai_confirmed";
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
          primaryCategoryId?: string;
          secondaryLabels?: string[];
          categoryIds?: string[];
          topicIds?: string[];
          subjectIds?: string[];
          taggingSource?: "manual" | "rule" | "ai_suggested" | "ai_confirmed";
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
          primaryCategoryId: body.primaryCategoryId,
          secondaryLabels: body.secondaryLabels,
          categoryIds: body.categoryIds,
          topicIds: body.topicIds,
          subjectIds: body.subjectIds,
          taggingSource: body.taggingSource,
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
        if (err.message?.includes("Invalid category") || err.message?.includes("Invalid topic") || err.message?.includes("Invalid subject")) {
          return reply.status(400).send({ error: err.message });
        }
        if (err.message?.includes("Missing Cloudflare R2")) {
          return reply.status(503).send({ error: "Upload service unavailable" });
        }
        throw e;
      }
    }
  );

  fastify.post<{
    Body: {
      videoIds: string[];
      categoryIds?: string[];
      topicIds?: string[];
      subjectIds?: string[];
      taggingSource?: "manual" | "rule" | "ai_suggested" | "ai_confirmed";
    };
  }>(
    "/bulk-tag",
    { schema: bulkTagSchema, preHandler: authGuard },
    async (
      request: FastifyRequest<{
        Body: {
          videoIds: string[];
          categoryIds?: string[];
          topicIds?: string[];
          subjectIds?: string[];
          taggingSource?: "manual" | "rule" | "ai_suggested" | "ai_confirmed";
        };
      }>,
      reply: FastifyReply
    ) => {
      const req = request as AuthenticatedRequest;
      const body = request.body;
      const result = await videoService.bulkTagVideos({
        appId: req.appId,
        userId: req.userId,
        videoIds: body.videoIds,
        categoryIds: body.categoryIds,
        topicIds: body.topicIds,
        subjectIds: body.subjectIds,
        taggingSource: body.taggingSource,
      });
      if (result.errors.length > 0 && result.updated === 0) {
        return reply.status(400).send({ error: result.errors.join("; "), updated: 0 });
      }
      return reply.send({ updated: result.updated, errors: result.errors });
    }
  );
}
