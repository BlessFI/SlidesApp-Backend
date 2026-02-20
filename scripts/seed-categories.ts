/**
 * One-off: seed categories for an app. Run with APP_ID env or pass as arg.
 * npx tsx scripts/seed-categories.ts
 * APP_ID=cmlqd4ag90000s1hi78ws4s8h npx tsx scripts/seed-categories.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORY_NAMES = [
  "News",
  "Sports",
  "Entertainment",
  "Lifestyle",
  "Technology",
  "Business",
  "Finance",
  "AI",
  "Travel",
  "Fitness",
  "Culture",
  "Food",
  "Celebrity",
  "Music",
  "Gaming",
  "Ambient",
  "Motoring",
  "Politics",
  "Educational",
  "Informative",
];

function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

async function main() {
  const appId = process.env.APP_ID ?? process.argv[2];
  if (!appId) {
    console.error("Usage: APP_ID=your-app-id npx tsx scripts/seed-categories.ts");
    process.exit(1);
  }

  const app = await prisma.app.findUnique({ where: { id: appId } });
  if (!app) {
    console.error("App not found:", appId);
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;
  for (const name of CATEGORY_NAMES) {
    const slug = nameToSlug(name);
    const existing = await prisma.taxonomyNode.findUnique({
      where: {
        appId_kind_slug: { appId, kind: "category", slug },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.taxonomyNode.create({
      data: {
        appId,
        kind: "category",
        name,
        slug,
      },
    });
    created++;
  }

  console.log(`App: ${app.name} (${appId})`);
  console.log(`Categories created: ${created}, already existed: ${skipped}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
