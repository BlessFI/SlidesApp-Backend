/**
 * Feed API: fetch video feed for an app (by app_id).
 * GET /api/feed — list ready videos, optionally by category. App via query, X-App-Id, or JWT.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as feedService from "../services/feed.service.js";
import { getAppById } from "../services/app.service.js";

async function getAppIdFromRequest(request: FastifyRequest): Promise<string | null> {
  const q = request.query as Record<string, string | string[] | undefined>;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  let appId: string | null = str(q.app_id) ?? (request.headers["x-app-id"] as string) ?? null;

  const authHeader = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (authHeader) {
    try {
      const payload = await (request.server as { verifyToken: (t: string) => Promise<{ appId?: string }> }).verifyToken(authHeader);
      if (payload?.appId) {
        const app = await getAppById(payload.appId);
        if (app) appId = payload.appId;
      }
    } catch {
      // use existing appId from query/header
    }
  }
  return appId;
}

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
