/**
 * Test: App A cannot access App B data.
 * - One user in both App A and App B; another user only in App B.
 * - With App A token: list users → only App A users; get User B by id → 404.
 * - With App B token: list users → both users in App B.
 *
 * Requires DATABASE_URL. Skips when not set (e.g. CI without DB).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const hasDb = !!process.env.DATABASE_URL;

const APP_A_SLUG = "test-app-a";
const APP_B_SLUG = "test-app-b";
const USER1_EMAIL = "user1@multi-tenant.test";
const USER2_EMAIL = "user2@multi-tenant.test";
const PASSWORD = "password123";

describe("Multi-tenant isolation", { skip: !hasDb }, () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let appAId: string;
  let appBId: string;
  let user1Id: string;
  let user2Id: string;
  let tokenA: string;
  let tokenB: string;

  before(async () => {
    if (!hasDb) return;
    app = await buildApp({ logger: false });
    const [appA, appB] = await Promise.all([
      prisma.app.upsert({
        where: { slug: APP_A_SLUG },
        create: { name: "Test App A", slug: APP_A_SLUG },
        update: {},
      }),
      prisma.app.upsert({
        where: { slug: APP_B_SLUG },
        create: { name: "Test App B", slug: APP_B_SLUG },
        update: {},
      }),
    ]);
    appAId = appA.id;
    appBId = appB.id;

    const regA = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: USER1_EMAIL,
        password: PASSWORD,
        appId: appAId,
        name: "User One",
      },
    });
    assert.strictEqual(regA.statusCode, 201);
    const bodyA = regA.json() as { user: { id: string }; token: string };
    user1Id = bodyA.user.id;
    tokenA = bodyA.token;

    const loginB = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: USER1_EMAIL,
        password: PASSWORD,
        appId: appBId,
      },
    });
    assert.strictEqual(loginB.statusCode, 200);
    const bodyB = loginB.json() as { token: string };
    tokenB = bodyB.token;

    const regB = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: USER2_EMAIL,
        password: PASSWORD,
        appId: appBId,
        name: "User Two",
      },
    });
    assert.strictEqual(regB.statusCode, 201);
    const bodyU2 = regB.json() as { user: { id: string } };
    user2Id = bodyU2.user.id;
  });

  after(async () => {
    if (!hasDb) return;
    await prisma.userAppProfile.deleteMany({
      where: {
        user: { email: { in: [USER1_EMAIL, USER2_EMAIL] } },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [USER1_EMAIL, USER2_EMAIL] } },
    });
    await prisma.app.deleteMany({
      where: { slug: { in: [APP_A_SLUG, APP_B_SLUG] } },
    });
    await app.close();
  });

  it("App A token: GET /api/users returns only App A users (1 user)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(res.statusCode, 200);
    const users = res.json() as unknown[];
    assert.strictEqual(users.length, 1);
    assert.strictEqual((users[0] as { user: { email: string } }).user.email, USER1_EMAIL);
  });

  it("App A token: GET /api/users/me returns current user in App A", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(res.statusCode, 200);
    const me = res.json() as { user: { email: string } };
    assert.strictEqual(me.user.email, USER1_EMAIL);
  });

  it("App A token: GET /api/users/:id for User B (only in App B) returns 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/users/${user2Id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(res.statusCode, 404);
  });

  it("App B token: GET /api/users returns both users in App B", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(res.statusCode, 200);
    const users = res.json() as unknown[];
    assert.strictEqual(users.length, 2);
    const emails = (users as { user: { email: string } }[]).map((u) => u.user.email);
    assert.ok(emails.includes(USER1_EMAIL));
    assert.ok(emails.includes(USER2_EMAIL));
  });

  it("App B token: GET /api/users/:id for User B returns User B profile", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/users/${user2Id}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(res.statusCode, 200);
    const profile = res.json() as { user: { email: string } };
    assert.strictEqual(profile.user.email, USER2_EMAIL);
  });
});
