import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function main() {
  const fastify = await buildApp();
  await fastify.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
