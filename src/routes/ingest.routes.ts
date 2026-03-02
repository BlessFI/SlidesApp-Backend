/**
 * Admin ingest: trigger MRSS ingest for an app (M3).
 * POST /api/admin/ingest/mrss — body: { appId, sourceKey? }. Requires JWT; appId must match token app.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import * as mrssService from "../services/mrss.service.js";
import { getAppById } from "../services/app.service.js";
import { authGuard, type TenantContext } from "../plugins/authGuard.js";

type AuthenticatedRequest = FastifyRequest & TenantContext;

export default async function ingestRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: { appId?: string; sourceKey?: string };
  }>(
    "/mrss",
    { preHandler: authGuard },
    async (request: FastifyRequest<{ Body: { appId?: string; sourceKey?: string } }>, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest;
      const body = request.body ?? {};
      const appId = body.appId ?? req.appId;
      if (appId !== req.appId) {
        return reply.status(403).send({ error: "appId must match your token app" });
      }
      const app = await getAppById(appId);
      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }
      const sourceKey = body.sourceKey?.trim();

      if (sourceKey) {
        const result = await mrssService.runMrssIngestForProvider(appId, sourceKey);
        if (!result) {
          return reply.status(404).send({ error: "Content provider not found or inactive", sourceKey });
        }
        return reply.send(result);
      }

      const providers = await prisma.contentProvider.findMany({
        where: { appId, isActive: true },
      });
      if (providers.length === 0) {
        return reply.send({
          message: "No active content providers for this app",
          results: [],
        });
      }
      const results = await Promise.all(
        providers.map((p) => mrssService.runMrssIngestForProvider(appId, p.sourceKey))
      );
      return reply.send({
        message: `Ran ingest for ${providers.length} provider(s)`,
        results: results.filter((r): r is NonNullable<typeof r> => r != null),
      });
    }
  );
}
