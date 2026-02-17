import Fastify from "fastify";
import jwtPlugin from "./plugins/jwt.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import appRoutes from "./routes/app.routes.js";
import eventRoutes from "./routes/event.routes.js";

export async function buildApp(opts?: { logger?: boolean }) {
  const fastify = Fastify({ logger: opts?.logger ?? true });
  await fastify.register(jwtPlugin);
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(userRoutes, { prefix: "/api/users" });
  await fastify.register(appRoutes, { prefix: "/api/apps" });
  await fastify.register(eventRoutes, { prefix: "/events" });
  fastify.get("/health", async () => ({ ok: true }));
  return fastify;
}
