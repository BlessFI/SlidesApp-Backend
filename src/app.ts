import Fastify from "fastify";
import jwtPlugin from "./plugins/jwt.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import appRoutes from "./routes/app.routes.js";
import eventRoutes from "./routes/event.routes.js";
import feedRoutes from "./routes/feed.routes.js";
import categoriesRoutes from "./routes/categories.routes.js";
import taxonomyRoutes from "./routes/taxonomy.routes.js";
import ingestDefaultRulesRoutes from "./routes/ingestDefaultRules.routes.js";
import videoRoutes from "./routes/video.routes.js";
import voteRoutes from "./routes/vote.routes.js";

const DEFAULT_BODY_LIMIT = 100 * 1024 * 1024; // 100MB for video base64 uploads

export async function buildApp(opts?: { logger?: boolean }) {
  const bodyLimit = Number(process.env.BODY_LIMIT_BYTES) || DEFAULT_BODY_LIMIT;
  const fastify = Fastify({
    logger: opts?.logger ?? true,
    bodyLimit,
  });
  await fastify.register(jwtPlugin);
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(userRoutes, { prefix: "/api/users" });
  await fastify.register(appRoutes, { prefix: "/api/apps" });
  await fastify.register(feedRoutes, { prefix: "/api/feed" });
  await fastify.register(categoriesRoutes, { prefix: "/api/categories" });
  await fastify.register(taxonomyRoutes, { prefix: "/api/taxonomy" });
  await fastify.register(ingestDefaultRulesRoutes, { prefix: "/api/ingest-default-rules" });
  await fastify.register(videoRoutes, { prefix: "/api/videos" });
  await fastify.register(voteRoutes, { prefix: "/api/videos" });
  await fastify.register(eventRoutes, { prefix: "/events" });
  fastify.get("/health", async () => ({ ok: true }));
  return fastify;
}
