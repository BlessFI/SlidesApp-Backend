/**
 * GET /api/categories — list taxonomy categories for an app.
 * App via query app_id, X-App-Id header, or JWT.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getAppIdFromRequest } from "../lib/appFromRequest.js";
import { getAppById } from "../services/app.service.js";

export default async function categoriesRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const appId = await getAppIdFromRequest(request);
      if (!appId) {
        return reply.status(400).send({
          error: "app_id (query or X-App-Id header) or valid JWT is required",
        });
      }

      const app = await getAppById(appId);
      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }

      const categories = await prisma.taxonomyNode.findMany({
        where: { appId, kind: "category" },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true, slug: true },
      });

      return reply.send({ categories });
    }
  );
}
