import { prisma } from "../lib/prisma.js";

export interface CreateEventInput {
  appId: string;
  userId?: string | null;
  videoId?: string | null;
  requestId?: string | null;
  rankPosition?: number | null;
  feedMode?: string | null;
  eventType: string;
  eventName: string;
  schemaVersion?: number;
  gestureDirection?: string | null;
  gestureSource?: string | null;
  properties?: Record<string, unknown> | null;
}

export async function createEvent(data: CreateEventInput) {
  return prisma.event.create({
    data: {
      appId: data.appId,
      userId: data.userId ?? undefined,
      videoId: data.videoId ?? undefined,
      requestId: data.requestId ?? undefined,
      rankPosition: data.rankPosition ?? undefined,
      feedMode: data.feedMode ?? undefined,
      eventType: data.eventType,
      eventName: data.eventName,
      schemaVersion: data.schemaVersion ?? 1,
      gestureDirection: data.gestureDirection ?? undefined,
      gestureSource: data.gestureSource ?? undefined,
      properties: data.properties ?? undefined,
    },
  });
}

export interface ListEventsQuery {
  appId: string;
  type?: string;
  event?: string;
  request_id?: string;
  item_id?: string;
  gesture_direction?: string;
  limit?: number;
}

export async function listEvents(query: ListEventsQuery) {
  const limit = Math.min(Math.max(1, query.limit ?? 100), 500);
  const where: Parameters<typeof prisma.event.findMany>[0]["where"] = {
    appId: query.appId,
  };
  if (query.type) where.eventType = query.type;
  if (query.event) where.eventName = query.event;
  if (query.request_id) where.requestId = query.request_id;
  if (query.item_id) where.videoId = query.item_id;
  if (query.gesture_direction) where.gestureDirection = query.gesture_direction;

  const events = await prisma.event.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return events.map((e) => ({
    id: e.id,
    ts: e.createdAt.toISOString(),
    type: e.eventType,
    event: e.eventName,
    request_id: e.requestId,
    rank_position: e.rankPosition,
    feed_mode: e.feedMode,
    item_id: e.videoId,
    direction_key: e.gestureDirection,
    gesture_source: e.gestureSource,
    ...(e.properties as Record<string, unknown>),
  }));
}
