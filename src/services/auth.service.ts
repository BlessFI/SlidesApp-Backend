import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import type { RegisterBody, LoginBody, AuthResult } from "../types/auth.js";
import type { User, UserAppProfile } from "@prisma/client";
import { getAppById } from "./app.service.js";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hashed: string
): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

export async function register(body: RegisterBody): Promise<AuthResult> {
  const app = await getAppById(body.appId);
  if (!app) {
    throw new Error("App not found");
  }

  let user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
  });

  if (!user) {
    const hashed = await hashPassword(body.password);
    user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase().trim(),
        password: hashed,
        name: body.name?.trim() ?? null,
      },
    });
  } else {
    const ok = await verifyPassword(body.password, user.password);
    if (!ok) {
      throw new Error("User with this email already exists");
    }
  }

  const profile = await prisma.userAppProfile.upsert({
    where: {
      userId_appId: { userId: user.id, appId: body.appId },
    },
    create: {
      userId: user.id,
      appId: body.appId,
      displayName: body.name?.trim() ?? user.name,
    },
    update: {},
    include: { user: true },
  });

  return profileToAuthResult(profile, "");
}

export async function login(body: LoginBody): Promise<AuthResult | null> {
  const app = await getAppById(body.appId);
  if (!app) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
  });
  if (!user) return null;

  const ok = await verifyPassword(body.password, user.password);
  if (!ok) return null;

  const profile = await prisma.userAppProfile.upsert({
    where: {
      userId_appId: { userId: user.id, appId: body.appId },
    },
    create: {
      userId: user.id,
      appId: body.appId,
      displayName: user.name,
    },
    update: {},
    include: { user: true },
  });

  return profileToAuthResult(profile, "");
}

export function profileToAuthResult(
  profile: UserAppProfile & { user: User },
  token: string
): AuthResult {
  return {
    user: {
      id: profile.user.id,
      email: profile.user.email,
      name: profile.user.name,
      appId: profile.appId,
      profileId: profile.id,
      role: profile.role,
      displayName: profile.displayName,
    },
    token,
  };
}
