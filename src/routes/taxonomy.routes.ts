/**
 * GET /api/taxonomy — list taxonomy for an app.
 * No kind: returns all (categories, topics, subjects).
 * kind=category|topic|subject: returns only that kind.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getAppIdFromRequest } from "../lib/appFromRequest.js";
import { getAppById } from "../services/app.service.js";
import { getTaxonomyNodes, getAllTaxonomy, type TaxonomyKind } from "../services/taxonomy.service.js";

const VALID_KINDS: TaxonomyKind[] = ["category", "topic", "subject"];

export default async function taxonomyRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/",
    async (
      request: FastifyRequest<{ Querystring: { kind?: string } }>,
      reply: FastifyReply
    ) => {
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

      const kindRaw = (request.query.kind ?? "").toLowerCase();

      // No kind or kind=all → return all taxonomy
      if (!kindRaw || kindRaw === "all") {
        const all = await getAllTaxonomy(appId);
        return reply.send(all);
      }

      if (!VALID_KINDS.includes(kindRaw as TaxonomyKind)) {
        return reply.status(400).send({
          error: `kind must be one of: all, ${VALID_KINDS.join(", ")}`,
        });
      }

      const nodes = await getTaxonomyNodes(appId, kindRaw as TaxonomyKind);
      const key = kindRaw === "category" ? "categories" : kindRaw === "topic" ? "topics" : "subjects";
      return reply.send({ [key]: nodes });
    }
  );
}
