/**
 * Event logging API for the client (M2).
 * - POST /events — store event (body: type, event, request_id, rank_position, feed_mode, item_id, direction_key, gesture_action, gesture_source, ts, ...)
 * - GET  /events — query (?type= &event= &request_id= &item_id= &gesture_direction= &limit=)
 * App context: app_id in body or X-App-Id header. Optional Authorization for userId.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as eventService from "../services/event.service.js";
import { getAppById } from "../services/app.service.js";
/** Client payload: type, event, request_id, rank_position, feed_mode, item_id, direction_key, gesture_action, gesture_source, ts, ... */
interface EventBody {
  type: string;
  event: string;
  request_id?: string;
  rank_position?: number;
  feed_mode?: string;
  item_id?: string;
  direction_key?: string;
  gesture_action?: string;
  gesture_source?: string;
  ts?: number;
  app_id?: string;
  [key: string]: unknown;
}

function getAppId(request: FastifyRequest): string | null {
  const body = (request.body as EventBody) ?? {};
  const header = request.headers["x-app-id"];
  if (typeof header === "string" && header) return header;
  if (typeof body.app_id === "string" && body.app_id) return body.app_id;
  return null;
}

export default async function eventRoutes(fastify: FastifyInstance) {
  // POST /events — store event (optional auth; app_id required in body or X-App-Id)
  fastify.post<{ Body: EventBody }>(
    "/",
    async (request: FastifyRequest<{ Body: EventBody }>, reply: FastifyReply) => {
      const body = request.body;
      if (!body?.type || !body?.event) {
        return reply.status(400).send({ error: "type and event are required" });
      }

      let appId = getAppId(request);
      let userId: string | null = null;

      // If Bearer token present, use JWT appId and userId (and require valid app)
      const authHeader = request.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (authHeader) {
        try {
          const payload = await fastify.verifyToken(authHeader);
          if (payload.appId) {
            const app = await getAppById(payload.appId);
            if (app) {
              appId = payload.appId;
              userId = payload.sub ?? null;
            }
          }
        } catch {
          // ignore invalid token; fall back to body/header app_id
        }
      }

      if (!appId) {
        return reply.status(400).send({ error: "app_id (or X-App-Id header) is required" });
      }

      const app = await getAppById(appId);
      if (!app) {
        return reply.status(400).send({ error: "App not found" });
      }

      // Normalize feed_mode: client may send "normal", we store as "default" or keep as-is
      const feedMode = body.feed_mode === "normal" ? "default" : body.feed_mode ?? null;

      const record = await eventService.createEvent({
        appId,
        userId: userId ?? undefined,
        videoId: body.item_id ?? undefined,
        requestId: body.request_id ?? undefined,
        rankPosition: body.rank_position ?? undefined,
        feedMode: feedMode ?? undefined,
        eventType: body.type,
        eventName: body.event,
        schemaVersion: 1,
        gestureDirection: body.direction_key ?? undefined,
        gestureSource: body.gesture_source ?? undefined,
        properties: {
          ts: body.ts,
          gesture_action: body.gesture_action,
          ...Object.fromEntries(
            Object.entries(body).filter(
              ([k]) =>
                ![
                  "type",
                  "event",
                  "request_id",
                  "rank_position",
                  "feed_mode",
                  "item_id",
                  "direction_key",
                  "gesture_action",
                  "gesture_source",
                  "app_id",
                ].includes(k)
            )
          ),
        },
      });

      return reply.status(201).send({ ok: true, id: record.id });
    }
  );

  // GET /events — query (app_id from query, or JWT)
  fastify.get(
    "/",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as Record<string, string | string[] | undefined>;
      const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
      let appId: string | null = str(q.app_id) ?? (request.headers["x-app-id"] as string) ?? null;

      const authHeader = request.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (authHeader) {
        try {
          const payload = await fastify.verifyToken(authHeader);
          if (payload.appId && (await getAppById(payload.appId))) {
            appId = payload.appId;
          }
        } catch {
          // ignore
        }
      }

      if (!appId) {
        return reply.status(400).send({ error: "app_id (query or X-App-Id header) or valid JWT is required" });
      }

      const limit = str(q.limit) ? Math.min(500, parseInt(str(q.limit)!, 10) || 100) : 100;
      const events = await eventService.listEvents({
        appId,
        type: str(q.type),
        event: str(q.event),
        request_id: str(q.request_id),
        item_id: str(q.item_id),
        gesture_direction: str(q.gesture_direction),
        limit,
      });

      return reply.send({ events });
    }
  );
}
