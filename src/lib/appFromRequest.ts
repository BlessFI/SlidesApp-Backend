import type { FastifyRequest } from "fastify";
import { getAppById } from "../services/app.service.js";

type JwtPayload = { appId?: string; sub?: string };

export async function getAppIdFromRequest(request: FastifyRequest): Promise<string | null> {
  const q = request.query as Record<string, string | string[] | undefined>;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  let appId: string | null = str(q.app_id) ?? (request.headers["x-app-id"] as string) ?? null;

  const authHeader = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (authHeader) {
    try {
      const payload = await (request.server as { verifyToken: (t: string) => Promise<JwtPayload> }).verifyToken(authHeader);
      if (payload?.appId) {
        const app = await getAppById(payload.appId);
        if (app) appId = payload.appId;
      }
    } catch {
      // use existing appId from query/header
    }
  }
  return appId;
}

/** If request has valid Bearer JWT, returns userId (payload.sub); otherwise null. */
export async function getOptionalUserIdFromRequest(request: FastifyRequest): Promise<string | null> {
  const authHeader = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!authHeader) return null;
  try {
    const payload = await (request.server as { verifyToken: (t: string) => Promise<JwtPayload> }).verifyToken(authHeader);
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}
