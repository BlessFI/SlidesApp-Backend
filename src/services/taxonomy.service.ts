/**
 * Controlled vocabulary: validate category/topic/subject IDs belong to the app's taxonomy.
 * No free-text in canonical tags — only predefined TaxonomyNode IDs.
 */

import { prisma } from "../lib/prisma.js";

const KINDS = ["category", "topic", "subject"] as const;
export type TaxonomyKind = (typeof KINDS)[number];

export interface ValidateTaxonomyIdsResult {
  valid: boolean;
  invalidCategoryIds?: string[];
  invalidTopicIds?: string[];
  invalidSubjectIds?: string[];
}

/**
 * Validate that all given IDs exist in TaxonomyNode for this app with the correct kind.
 * Returns { valid: true } or { valid: false, invalid*Ids: [...] }.
 */
export async function validateTaxonomyIds(
  appId: string,
  opts: {
    categoryIds?: string[];
    topicIds?: string[];
    subjectIds?: string[];
  }
): Promise<ValidateTaxonomyIdsResult> {
  const invalidCategoryIds: string[] = [];
  const invalidTopicIds: string[] = [];
  const invalidSubjectIds: string[] = [];

  if (opts.categoryIds?.length) {
    const found = await prisma.taxonomyNode.findMany({
      where: { appId, kind: "category", id: { in: opts.categoryIds } },
      select: { id: true },
    });
    const foundSet = new Set(found.map((r) => r.id));
    for (const id of opts.categoryIds) {
      if (!foundSet.has(id)) invalidCategoryIds.push(id);
    }
  }
  if (opts.topicIds?.length) {
    const found = await prisma.taxonomyNode.findMany({
      where: { appId, kind: "topic", id: { in: opts.topicIds } },
      select: { id: true },
    });
    const foundSet = new Set(found.map((r) => r.id));
    for (const id of opts.topicIds) {
      if (!foundSet.has(id)) invalidTopicIds.push(id);
    }
  }
  if (opts.subjectIds?.length) {
    const found = await prisma.taxonomyNode.findMany({
      where: { appId, kind: "subject", id: { in: opts.subjectIds } },
      select: { id: true },
    });
    const foundSet = new Set(found.map((r) => r.id));
    for (const id of opts.subjectIds) {
      if (!foundSet.has(id)) invalidSubjectIds.push(id);
    }
  }

  const valid =
    invalidCategoryIds.length === 0 &&
    invalidTopicIds.length === 0 &&
    invalidSubjectIds.length === 0;

  return {
    valid,
    ...(invalidCategoryIds.length ? { invalidCategoryIds } : {}),
    ...(invalidTopicIds.length ? { invalidTopicIds } : {}),
    ...(invalidSubjectIds.length ? { invalidSubjectIds } : {}),
  };
}

export async function getTaxonomyNodes(
  appId: string,
  kind: TaxonomyKind
): Promise<{ id: string; name: string; slug: string | null }[]> {
  return prisma.taxonomyNode.findMany({
    where: { appId, kind },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, slug: true },
  });
}

export interface AllTaxonomy {
  categories: { id: string; name: string; slug: string | null }[];
  topics: { id: string; name: string; slug: string | null }[];
  subjects: { id: string; name: string; slug: string | null }[];
}

/** Fetch all taxonomy (categories, topics, subjects) for an app in one call. */
export async function getAllTaxonomy(appId: string): Promise<AllTaxonomy> {
  const [categories, topics, subjects] = await Promise.all([
    getTaxonomyNodes(appId, "category"),
    getTaxonomyNodes(appId, "topic"),
    getTaxonomyNodes(appId, "subject"),
  ]);
  return { categories, topics, subjects };
}
