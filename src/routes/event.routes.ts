/**
 * Event logging API for the client (M2).
 * - POST /events — store event (body: type, event, request_id, rank_position, feed_mode, item_id, direction_key, gesture_action, gesture_source, ts, ...)
 * - GET  /events — query (?type= &event= &request_id= &item_id= &gesture_direction= &limit=)
 * App context: app_id in body or X-App-Id header. Optional Authorization for userId.
 *
 * Gesture direction_key ↔ gesture_action (see src/constants/gestures.ts): up→Next, down→Previous, left→Back, right→Same topic, upLeft→Restart, upRight→Same category, downLeft→Inform, downRight→Same subject.
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
      fastify.log.info(
        { path: "/events", method: "POST", body: body ?? null, headers: { "x-app-id": request.headers["x-app-id"], contentType: request.headers["content-type"] } },
        "POST /events request"
      );

      if (!body?.type || !body?.event) {
        const err = "type and event are required";
        fastify.log.warn({ body: body ?? null, reason: err }, "POST /events 400");
        return reply.status(400).send({ error: err });
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
        } catch (e) {
          fastify.log.debug({ err: e }, "POST /events JWT verify failed, using body/header app_id");
        }
      }

      if (!appId) {
        const err = "app_id (or X-App-Id header) is required";
        fastify.log.warn({ bodyKeys: body ? Object.keys(body) : [], "x-app-id": request.headers["x-app-id"], reason: err }, "POST /events 400");
        return reply.status(400).send({ error: err });
      }

      const app = await getAppById(appId);
      if (!app) {
        const err = "App not found";
        fastify.log.warn({ appId, reason: err }, "POST /events 400");
        return reply.status(400).send({ error: err });
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

      fastify.log.info({ eventId: record.id, appId }, "POST /events 201");
      return reply.status(201).send({ ok: true, id: record.id });
    }
  );

  // GET /events — query (app_id from query, or JWT)
  fastify.get(
    "/",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as Record<string, string | string[] | undefined>;
      const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
      fastify.log.info(
        { path: "/events", method: "GET", query: q, "x-app-id": request.headers["x-app-id"] },
        "GET /events request"
      );

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
        const err = "app_id (query or X-App-Id header) or valid JWT is required";
        fastify.log.warn({ query: q, "x-app-id": request.headers["x-app-id"], reason: err }, "GET /events 400");
        return reply.status(400).send({ error: err });
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
