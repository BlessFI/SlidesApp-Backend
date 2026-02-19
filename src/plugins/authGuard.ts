import type { FastifyRequest, FastifyReply } from "fastify";
import { getAppById } from "../services/app.service.js";

export interface TenantContext {
  userId: string;
  userEmail: string;
  appId: string;
}

export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return reply.status(401).send({
        error: "Missing or invalid authorization",
        hint: "Use header: Authorization: Bearer <token> with the token from login/register",
      });
    }
    const payload = await request.server.verifyToken(token);
    if (!payload?.appId) {
      return reply.status(401).send({ error: "Invalid token: missing app context" });
    }
    const app = await getAppById(payload.appId);
    if (!app) {
      return reply.status(401).send({ error: "App not found" });
    }
    const req = request as FastifyRequest & TenantContext;
    req.userId = payload.sub;
    req.userEmail = payload.email ?? "";
    req.appId = payload.appId;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid or expired token";
    if (process.env.NODE_ENV !== "production") {
      request.log?.warn?.({ err }, "Auth guard: token verification failed");
    }
    return reply.status(401).send({
      error: "Invalid or expired token",
      ...(process.env.NODE_ENV !== "production" && { detail: message }),
    });
  }
}
