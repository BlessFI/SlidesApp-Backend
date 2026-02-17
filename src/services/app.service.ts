import { prisma } from "../lib/prisma.js";

export async function getAppById(appId: string) {
  return prisma.app.findUnique({
    where: { id: appId },
  });
}

export async function getAppBySlug(slug: string) {
  return prisma.app.findUnique({
    where: { slug },
  });
}
