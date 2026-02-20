import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startVideoProcessWorker } from "./queues/videoQueue.js";
import { startTaggingWorker } from "./queues/taggingQueue.js";

async function main() {
  const fastify = await buildApp();
  startVideoProcessWorker();
  startTaggingWorker();
  await fastify.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
