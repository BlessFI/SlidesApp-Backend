import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

/** Create app (for setup/seeding; in production you’d protect this). */
export default async function appRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: { name: string; slug: string };
  }>(
    "/",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "slug"],
          properties: { name: { type: "string" }, slug: { type: "string" } },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { name: string; slug: string } }>,
      reply: FastifyReply
    ) => {
      const { name, slug } = request.body;
      const app = await prisma.app.create({
        data: { name, slug: slug.toLowerCase().replace(/\s+/g, "-") },
      });
      return reply.status(201).send(app);
    }
  );

  fastify.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
    const apps = await prisma.app.findMany({
      select: { id: true, name: true, slug: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(apps);
  });
}
