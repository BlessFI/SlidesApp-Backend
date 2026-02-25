/**
 * Feed API: fetch video feed for an app (by app_id).
 * GET /api/feed — list ready videos, optionally by category_id, topic_id, subject_id. App via query, X-App-Id, or JWT.
 * Response includes request_id (feed session id) and each item has rank_position (0-based).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as feedService from "../services/feed.service.js";
import { getAppById } from "../services/app.service.js";
import { getAppIdFromRequest, getOptionalUserIdFromRequest } from "../lib/appFromRequest.js";

const feedResponseSchema = {
  response: {
    200: {
      type: "object",
      required: ["request_id", "items", "nextCursor", "hasMore"],
      properties: {
        request_id: { type: "string", description: "Feed session id for event correlation" },
        items: { type: "array", items: { type: "object" } },
        nextCursor: { type: ["string", "null"] },
        hasMore: { type: "boolean" },
      },
    },
  },
};

export default async function feedRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/",
    { schema: feedResponseSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const appId = await getAppIdFromRequest(request);
      if (!appId) {
        return reply.status(400).send({ error: "app_id (query or X-App-Id header) or valid JWT is required" });
      }

      const app = await getAppById(appId);
      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }

      const q = request.query as Record<string, string | string[] | undefined>;
      const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
      const toIds = (v: string | string[] | undefined): string[] | undefined => {
        if (v == null) return undefined;
        const raw = Array.isArray(v) ? v : [v];
        const ids = raw.flatMap((s) => String(s).split(",").map((x) => x.trim()).filter(Boolean));
        return ids.length ? ids : undefined;
      };
      const limit = str(q.limit) ? Math.min(100, parseInt(str(q.limit)!, 10) || 50) : 50;
      const userId = await getOptionalUserIdFromRequest(request);
      const requestId = str(q.request_id) ?? undefined;

      const result = await feedService.getFeedForApp({
        appId,
        userId: userId ?? undefined,
        categoryIds: toIds(q.category_id),
        topicIds: toIds(q.topic_id),
        subjectIds: toIds(q.subject_id),
        limit,
        cursor: str(q.cursor) ?? undefined,
        requestId: requestId ?? undefined,
      });

      return reply.send(result);
    }
  );
}
