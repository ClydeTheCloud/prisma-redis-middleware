import { Prisma } from "@prisma/client/extension";
import { createCache } from "async-cache-dedupe";
import { defaultCacheMethods, defaultMutationMethods } from "./cacheMethods";
import type {
  CreatePrismaRedisCache,
  FetchFromPrisma,
  MiddlewareParams,
  PrismaMutationAction,
  PrismaQueryAction,
} from "./types";

const DEFAULT_CACHE_TIME = 0;

export function createPrismaRedisCacheExtension({
  models,
  onDedupe,
  onError,
  onHit,
  onMiss,
  storage,
  cacheTime = DEFAULT_CACHE_TIME,
  excludeModels = [],
  excludeMethods = [],
  transformer,
}: CreatePrismaRedisCache) {
  // Default options for "async-cache-dedupe"
  const cacheOptions = {
    onDedupe,
    onError,
    onHit,
    onMiss,
    storage,
    ttl: cacheTime,
    transformer,
  };

  const cache: any = createCache(cacheOptions);

  // Do not cache any Prisma method specified in the defaultExcludeCacheMethods option
  const excludedCacheMethods: string[] = defaultCacheMethods.filter((cacheMethod) => {
    return excludeMethods.includes(cacheMethod);
  });

  return Prisma.defineExtension({
    name: "prisma-cache-middleware",
    query: {
      async $allOperations(params) {
        let result;
        const fetchFromPrisma = async () => {
          return await params.query(params.args);
        };
        const notNullModel = params.model as string;
        if (!excludedCacheMethods?.includes(params.operation)) {
          models?.forEach(({ model, cacheTime, cacheKey, excludeMethods }) => {
            // Only define the cache function for a model if it doesn't exist yet and hasn't been excluded
            if (
              !cache[model] &&
              model === notNullModel &&
              !excludeModels?.includes(notNullModel) &&
              !excludeMethods?.includes(params.operation as PrismaQueryAction)
            ) {
              cache.define(
                model,
                {
                  references: ({}: { params: MiddlewareParams }, key: string) => {
                    return [`${cacheKey || notNullModel}~${key}`];
                  },
                  ttl: cacheTime || cacheOptions.ttl,
                },
                async function modelsFetch({ cb, params }: { cb: FetchFromPrisma; params: MiddlewareParams }) {
                  result = await cb(params);

                  return result;
                },
              );
            }
          });

          const excludedCacheMethodsInModels = models?.find(({ model, excludeMethods }) => {
            return model === notNullModel && excludeMethods?.length;
          });

          // Do not define a cache function for any Prisma model if it already exists
          // Do not define the cache function for a model if it was excluded in `defaultExcludeCacheModels`
          // Do not define a cache function if the Prisma method was exluded in `models`

          if (
            !cache[notNullModel] &&
            !excludeModels?.includes(notNullModel) &&
            !excludedCacheMethodsInModels?.excludeMethods?.includes(params.operation as PrismaQueryAction)
          ) {
            cache.define(
              notNullModel,
              {
                references: ({}: { params: MiddlewareParams }, key: string) => {
                  return [`${notNullModel}~${key}`];
                },
              },
              async function modelFetch({ cb, params }: { cb: FetchFromPrisma; params: MiddlewareParams }) {
                result = await cb(params);

                return result;
              },
            );
          }
        }

        // Get the cache function relating to the Prisma model
        const cacheFunction = cache[notNullModel];

        // Only cache the data if the Prisma model hasn't been excluded and if the Prisma method wasn't excluded either
        if (
          !excludeModels?.includes(notNullModel) &&
          !excludedCacheMethods?.includes(params.operation) &&
          !defaultMutationMethods?.includes(params.operation as PrismaMutationAction) &&
          typeof cacheFunction === "function"
        ) {
          try {
            result = await cacheFunction({ cb: fetchFromPrisma, params });
          } catch (err) {
            // If we fail to fetch it from the cache (network error, etc.) we will query it from the database
            result = await fetchFromPrisma();

            console.error(err);
          }
        } else {
          // Query the database for any Prisma method (mutation method) or Prisma model we excluded from the cache
          result = fetchFromPrisma();

          // If we successfully executed the Mutation we clear and invalidate the cache for the Prisma model
          if (defaultMutationMethods.includes(params.operation as PrismaMutationAction)) {
            await cache.invalidateAll(`*${params.model}~*`);
            console.log("Invalidated cache for", params.model);
            await Promise.all(
              (models || [])
                .filter(({ model }) => model === params.model)
                .map(async ({ invalidateRelated }) => {
                  if (invalidateRelated) {
                    await Promise.all(
                      invalidateRelated.map(async (relatedModel) => cache.invalidateAll(`*${relatedModel}~*`)),
                    );
                  }
                }),
            );
          }
        }

        return result;
      },
    },
  });
}
