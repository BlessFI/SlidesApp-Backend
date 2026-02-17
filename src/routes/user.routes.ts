import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as userService from "../services/user.service.js";
import { authGuard, type TenantContext } from "../plugins/authGuard.js";


export default async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authGuard);

  fastify.get(
    "/me",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantContext = request as FastifyRequest & TenantContext;
      const profile = await userService.getMe(tenantContext.userId, tenantContext.appId);
      if (!profile) {
        return reply.status(404).send({ error: "User not found in this app" });
      }
      return reply.send(profile);
    }
  );

  fastify.get(
    "/",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantContext = request as FastifyRequest & TenantContext;
      const profiles = await userService.getUsers(tenantContext.appId);
      return reply.send(profiles);
    }
  );

  fastify.get(
    "/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantContext = request as FastifyRequest & TenantContext & { params: { id: string } };
      const profile = await userService.getUserProfileInApp(
        tenantContext.params.id,
        tenantContext.appId
      );
      if (!profile) {
        return reply.status(404).send({ error: "User not found in this app" });
      }
      return reply.send(profile);
    }
  );
}
