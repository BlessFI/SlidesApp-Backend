import { prisma } from "../lib/prisma.js";

/** All queries are scoped by appId – tenant isolation. */

export async function getMe(userId: string, appId: string) {
  return prisma.userAppProfile.findUnique({
    where: {
      userId_appId: { userId, appId },
    },
    select: {
      id: true,
      role: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });
}

export async function getUsers(appId: string) {
  return prisma.userAppProfile.findMany({
    where: { appId },
    select: {
      id: true,
      role: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: { id: true, email: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Returns profile for userId in this app only. 404 if user has no profile in this app. */
export async function getUserProfileInApp(userId: string, appId: string) {
  return prisma.userAppProfile.findUnique({
    where: {
      userId_appId: { userId, appId },
    },
    select: {
      id: true,
      role: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });
}
