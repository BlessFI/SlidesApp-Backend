/**
 * Feed API: fetch video feed for an app (by app_id).
 * GET /api/feed — list ready videos, optionally by category. App via query, X-App-Id, or JWT.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as feedService from "../services/feed.service.js";
import { getAppById } from "../services/app.service.js";
import { getAppIdFromRequest } from "../lib/appFromRequest.js";

export default async function feedRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/",
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
      const limit = str(q.limit) ? Math.min(100, parseInt(str(q.limit)!, 10) || 50) : 50;

      const result = await feedService.getFeedForApp({
        appId,
        categoryId: str(q.category_id) ?? undefined,
        limit,
        cursor: str(q.cursor) ?? undefined,
      });

      return reply.send(result);
    }
  );
}
