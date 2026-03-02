/**
 * Content providers (MRSS): one account per provider per app (M3).
 * GET /api/content-providers — list providers for app (JWT).
 * POST /api/content-providers — create provider (JWT). Body: sourceKey, mrssUrl, ingestUserId, name?, defaultPrimaryCategoryId?
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authGuard, type TenantContext } from "../plugins/authGuard.js";

type AuthenticatedRequest = FastifyRequest & TenantContext;

const createSchema = {
  body: {
    type: "object",
    required: ["sourceKey", "mrssUrl", "ingestUserId"],
    properties: {
      sourceKey: { type: "string" },
      name: { type: "string" },
      mrssUrl: { type: "string" },
      defaultPrimaryCategoryId: { type: "string", format: "uuid" },
      ingestUserId: { type: "string" },
    },
  },
};

export default async function contentProvidersRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/",
    { preHandler: authGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest;
      const providers = await prisma.contentProvider.findMany({
        where: { appId: req.appId },
        orderBy: [{ sourceKey: "asc" }],
        select: {
          id: true,
          sourceKey: true,
          name: true,
          mrssUrl: true,
          defaultPrimaryCategoryId: true,
          ingestUserId: true,
          isActive: true,
          createdAt: true,
        },
      });
      return reply.send({ contentProviders: providers });
    }
  );

  fastify.post<{
    Body: {
      sourceKey: string;
      name?: string;
      mrssUrl: string;
      defaultPrimaryCategoryId?: string;
      ingestUserId: string;
    };
  }>(
    "/",
    { schema: createSchema, preHandler: authGuard },
    async (request: FastifyRequest<{ Body: { sourceKey: string; name?: string; mrssUrl: string; defaultPrimaryCategoryId?: string; ingestUserId: string } }>, reply: FastifyReply) => {
      const req = request as AuthenticatedRequest;
      const body = request.body;
      const appId = req.appId;
      const ingestUser = await prisma.user.findUnique({
        where: { id: body.ingestUserId },
      });
      if (!ingestUser) {
        return reply.status(400).send({ error: "ingestUserId: user not found" });
      }
      const profile = await prisma.userAppProfile.findUnique({
        where: { userId_appId: { userId: body.ingestUserId, appId } },
      });
      if (!profile) {
        return reply.status(400).send({ error: "ingestUserId: user must have a profile in this app" });
      }
      if (body.defaultPrimaryCategoryId) {
        const node = await prisma.taxonomyNode.findFirst({
          where: { id: body.defaultPrimaryCategoryId, appId, kind: "category" },
        });
        if (!node) {
          return reply.status(400).send({ error: "defaultPrimaryCategoryId: category not found in this app" });
        }
      }
      const provider = await prisma.contentProvider.create({
        data: {
          appId,
          sourceKey: body.sourceKey.trim(),
          name: body.name?.trim() ?? null,
          mrssUrl: body.mrssUrl.trim(),
          defaultPrimaryCategoryId: body.defaultPrimaryCategoryId ?? null,
          ingestUserId: body.ingestUserId,
        },
      });
      return reply.status(201).send(provider);
    }
  );
}
