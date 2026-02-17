import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.app.upsert({
    where: { slug: "app-a" },
    create: { name: "App A", slug: "app-a" },
    update: {},
  });
  await prisma.app.upsert({
    where: { slug: "app-b" },
    create: { name: "App B", slug: "app-b" },
    update: {},
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
