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
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return reply.status(401).send({ error: "Missing or invalid authorization" });
    }
    const payload = await request.server.verifyToken(token);
    if (!payload.appId) {
      return reply.status(401).send({ error: "Invalid token: missing app context" });
    }
    const app = await getAppById(payload.appId);
    if (!app) {
      return reply.status(401).send({ error: "App not found" });
    }
    const req = request as FastifyRequest & TenantContext;
    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.appId = payload.appId;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}
