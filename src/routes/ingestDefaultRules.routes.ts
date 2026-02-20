/**
 * Ingest default rules: deterministic defaults per app/source (e.g. ingest_source = "partner_x" → default category/topic/subject).
 * Auth required; app from JWT. For ingestion UI / admin tool.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authGuard, type TenantContext } from "../plugins/authGuard.js";

type AuthenticatedRequest = FastifyRequest & TenantContext;

const createRuleSchema = {
  body: {
    type: "object",
    required: ["sourceKey"],
    properties: {
      sourceKey: { type: "string" },
      defaultCategoryIds: { type: "array", items: { type: "string", format: "uuid" } },
      defaultTopicIds: { type: "array", items: { type: "string", format: "uuid" } },
      defaultSubjectIds: { type: "array", items: { type: "string", format: "uuid" } },
    },
  },
};

export default async function ingestDefaultRulesRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/",
    { preHandler: authGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest;
      const rules = await prisma.ingestDefaultRule.findMany({
        where: { appId: req.appId },
        orderBy: [{ sourceKey: "asc" }],
        select: {
          id: true,
          sourceKey: true,
          defaultCategoryIds: true,
          defaultTopicIds: true,
          defaultSubjectIds: true,
          createdAt: true,
        },
      });
      return reply.send({ rules });
    }
  );

  fastify.post<{
    Body: {
      sourceKey: string;
      defaultCategoryIds?: string[];
      defaultTopicIds?: string[];
      defaultSubjectIds?: string[];
    };
  }>(
    "/",
    { schema: createRuleSchema, preHandler: authGuard },
    async (
      request: FastifyRequest<{
        Body: {
          sourceKey: string;
          defaultCategoryIds?: string[];
          defaultTopicIds?: string[];
          defaultSubjectIds?: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const req = request as AuthenticatedRequest;
      const body = request.body;
      const rule = await prisma.ingestDefaultRule.upsert({
        where: {
          appId_sourceKey: { appId: req.appId, sourceKey: body.sourceKey.trim() },
        },
        create: {
          appId: req.appId,
          sourceKey: body.sourceKey.trim(),
          defaultCategoryIds: body.defaultCategoryIds ?? [],
          defaultTopicIds: body.defaultTopicIds ?? [],
          defaultSubjectIds: body.defaultSubjectIds ?? [],
        },
        update: {
          defaultCategoryIds: body.defaultCategoryIds ?? [],
          defaultTopicIds: body.defaultTopicIds ?? [],
          defaultSubjectIds: body.defaultSubjectIds ?? [],
        },
      });
      return reply.status(201).send(rule);
    }
  );

  fastify.delete<{ Params: { ruleId: string } }>(
    "/:ruleId",
    { preHandler: authGuard },
    async (request: FastifyRequest<{ Params: { ruleId: string } }>, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest;
      const { ruleId } = request.params;
      const deleted = await prisma.ingestDefaultRule.deleteMany({
        where: { id: ruleId, appId: req.appId },
      });
      if (deleted.count === 0) {
        return reply.status(404).send({ error: "Rule not found" });
      }
      return reply.send({ ok: true });
    }
  );
}
