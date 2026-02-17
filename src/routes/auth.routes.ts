import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as authService from "../services/auth.service.js";
import * as userService from "../services/user.service.js";
import { authGuard, type TenantContext } from "../plugins/authGuard.js";
import type { RegisterBody, LoginBody } from "../types/auth.js";

const registerSchema = {
  body: {
    type: "object",
    required: ["email", "password", "appId"],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 6 },
      appId: { type: "string" },
      name: { type: "string" },
    },
  },
};

const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password", "appId"],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string" },
      appId: { type: "string" },
    },
  },
};

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: RegisterBody;
  }>(
    "/register",
    { schema: registerSchema },
    async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
      try {
        const result = await authService.register(request.body);
        const token = fastify.signToken({
          sub: result.user.id,
          email: result.user.email,
          appId: result.user.appId,
        });
        return reply.status(201).send({
          ...result,
          token,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Registration failed";
        return reply.status(400).send({ error: message });
      }
    }
  );

  fastify.post<{
    Body: LoginBody;
  }>(
    "/login",
    { schema: loginSchema },
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const result = await authService.login(request.body);
      if (!result) {
        return reply.status(401).send({ error: "Invalid email or password" });
      }
      const token = fastify.signToken({
        sub: result.user.id,
        email: result.user.email,
        appId: result.user.appId,
      });
      return reply.send({ ...result, token });
    }
  );

  // Protected: current user from JWT (same app context as token)
  fastify.get(
    "/me",
    { preHandler: authGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request as FastifyRequest & TenantContext;
      const profile = await userService.getMe(req.userId, req.appId);
      if (!profile) {
        return reply.status(404).send({ error: "User not found in this app" });
      }
      return reply.send(profile);
    }
  );

  // Refresh: issue a new JWT from an existing (non-expired) one
  fastify.post(
    "/refresh",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (!authHeader) {
        return reply.status(401).send({ error: "Missing Authorization header" });
      }
      try {
        const payload = await fastify.verifyToken(authHeader);
        if (!payload?.sub || !payload?.email || !payload?.appId) {
          return reply.status(401).send({ error: "Invalid token payload" });
        }
        const token = fastify.signToken({
          sub: payload.sub,
          email: payload.email,
          appId: payload.appId,
        });
        return reply.send({ token });
      } catch {
        return reply.status(401).send({ error: "Invalid or expired token" });
      }
    }
  );

  // Logout: client discards token (stateless JWT; no server-side invalidation)
  fastify.post("/logout", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ ok: true, message: "Client should discard the token" });
  });
}
