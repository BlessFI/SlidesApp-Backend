/**
 * Seed topics and subjects for an app (relevant to the category set: News, Sports, Entertainment, etc.).
 * Run: APP_ID=your-app-id npx tsx scripts/seed-topics-subjects.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Topics = format/angle of content (relevant across categories)
const TOPIC_NAMES = [
  "Breaking",
  "Opinion",
  "Analysis",
  "How-to",
  "Tutorial",
  "Review",
  "Interview",
  "Documentary",
  "Live",
  "Highlights",
  "Explainer",
  "List",
  "Comparison",
  "Tips",
  "Trends",
  "Debate",
  "Storytelling",
  "Roundup",
  "Deep Dive",
  "Q&A",
  "News",
  "Guide",
  "Walkthrough",
  "Reaction",
  "Recap",
];

// Subjects = what the content is about (thematic, pairs with categories)
const SUBJECT_NAMES = [
  "World",
  "Local",
  "Politics",
  "Economy",
  "Health",
  "Science",
  "Technology",
  "Environment",
  "Education",
  "Arts",
  "Music",
  "Film",
  "TV",
  "Gaming",
  "Sports",
  "Business",
  "Finance",
  "Travel",
  "Food",
  "Fitness",
  "Lifestyle",
  "Celebrity",
  "Culture",
  "Motoring",
  "AI & ML",
  "Markets",
  "Investing",
  "Recipes",
  "Workouts",
  "Destinations",
  "Startups",
  "Policy",
  "Entertainment",
  "Nature",
  "History",
];

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9-]/g, "");
}

async function seedKind(
  appId: string,
  kind: "topic" | "subject",
  names: string[]
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const name of names) {
    const slug = nameToSlug(name);
    const existing = await prisma.taxonomyNode.findUnique({
      where: {
        appId_kind_slug: { appId, kind, slug },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.taxonomyNode.create({
      data: {
        appId,
        kind,
        name,
        slug,
      },
    });
    created++;
  }
  return { created, skipped };
}

async function main() {
  const appId = process.env.APP_ID ?? process.argv[2];
  if (!appId) {
    console.error("Usage: APP_ID=your-app-id npx tsx scripts/seed-topics-subjects.ts");
    process.exit(1);
  }

  const app = await prisma.app.findUnique({ where: { id: appId } });
  if (!app) {
    console.error("App not found:", appId);
    process.exit(1);
  }

  const [topicsResult, subjectsResult] = await Promise.all([
    seedKind(appId, "topic", TOPIC_NAMES),
    seedKind(appId, "subject", SUBJECT_NAMES),
  ]);

  console.log(`App: ${app.name} (${appId})`);
  console.log(`Topics:  created ${topicsResult.created}, already existed ${topicsResult.skipped}`);
  console.log(`Subjects: created ${subjectsResult.created}, already existed ${subjectsResult.skipped}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
