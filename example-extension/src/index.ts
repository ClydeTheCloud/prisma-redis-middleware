const { PrismaClient } = require("@prisma/client");
const { createPrismaRedisCacheExtension } = require("prisma-redis-middleware");
const Redis = require("ioredis");
const logger = require("pino")({ level: "debug" });

const redis = new Redis(); // Uses default options for Redis connection

console.log(createPrismaRedisCacheExtension);

const cacheMiddleware = createPrismaRedisCacheExtension({
  models: [
    { model: "User", cacheTime: 300 },
    { model: "Post", cacheKey: "Article" },
  ],
  storage: { type: "redis", options: { client: redis, invalidation: { invalidationTTL: 300 } } },
  cacheTime: 60,
  onHit: (key: string) => {
    console.log("Hit: ✅", key);
  },
  onMiss: (key: string) => {
    console.log("Miss: ❌", key);
  },
});

const prisma = new PrismaClient().$extends(cacheMiddleware);

async function main() {
  // Create 2 users in database
  await prisma.user.create({ data: { name: "John", email: "john@email.com" } });
  await prisma.user.create({ data: { name: "Mary", email: "mary@email.com" } });

  // Find users to test cache
  await prisma.user.findMany({
    where: {
      email: {
        endsWith: "email.com",
      },
    },
  });

  // Invalidate Users cache by running mutation method
  // await prisma.user.update({ where: { email: "john@email.com" }, data: { name: "Alice", email: "alice@email.com" } });

  await prisma.user.count();
  await prisma.user.count();
  await prisma.user.count();

  await prisma.user.findMany({
    where: {
      email: {
        endsWith: "email.com",
      },
    },
  });
  await prisma.user.findMany({
    where: {
      email: {
        endsWith: "email.com",
      },
    },
  });

  await prisma.user.create({ data: { name: "aspigjasidg", email: "tonystark@email.com" } });

  await prisma.user.count();
  await prisma.user.count();
  await prisma.user.count();

  await prisma.user.findMany({
    where: {
      email: {
        endsWith: "email.com",
      },
    },
  });
  await prisma.user.findMany({
    where: {
      email: {
        endsWith: "email.com",
      },
    },
  });

  await prisma.user.create({ data: { name: "aspigjasidg", email: "tonystark@email.com" } });

  await prisma.user.count();
  await prisma.user.count();
  await prisma.user.count();

  await prisma.user.findMany({
    where: {
      email: {
        endsWith: "email.com",
      },
    },
  });
  await prisma.user.findMany({
    where: {
      email: {
        endsWith: "email.com",
      },
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((err) => {
    console.error(err);
  });
