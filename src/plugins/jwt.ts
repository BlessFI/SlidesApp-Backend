import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import { env } from "../config/env.js";
import type { JwtPayload } from "../types/auth.js";

export default fp(async (fastify) => {
  await fastify.register(fjwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: "7d",
    },
  });

  fastify.decorate("signToken", (payload: JwtPayload) => {
    return fastify.jwt.sign(payload);
  });

  fastify.decorate("verifyToken", async (token: string) => {
    return fastify.jwt.verify<JwtPayload>(token);
  });
});

declare module "fastify" {
  interface FastifyInstance {
    signToken: (payload: JwtPayload) => string;
    verifyToken: (token: string) => Promise<JwtPayload>;
  }
}
