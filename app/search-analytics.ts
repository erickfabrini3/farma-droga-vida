import { desc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { searchAnalytics } from "@/db/schema";

export type SearchAnalyticsEntry = typeof searchAnalytics.$inferSelect;

export function normalizeSearchQuery(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSearchQuery(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function recordNoResultSearch(value: string) {
  const query = cleanSearchQuery(value);
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery.length < 2 || !/[\p{L}\p{N}]/u.test(normalizedQuery)) return false;

  const db = getDb();
  const now = new Date().toISOString();
  await db.insert(searchAnalytics).values({ normalizedQuery, query, lastSearchedAt: now }).onConflictDoUpdate({
    target: searchAnalytics.normalizedQuery,
    set: {
      query,
      searchCount: sql`${searchAnalytics.searchCount} + 1`,
      lastSearchedAt: now,
    },
  });

  const overflow = await db
    .select({ id: searchAnalytics.id })
    .from(searchAnalytics)
    .orderBy(desc(searchAnalytics.lastSearchedAt), desc(searchAnalytics.id))
    .limit(500)
    .offset(500);
  if (overflow.length) await db.delete(searchAnalytics).where(inArray(searchAnalytics.id, overflow.map((row) => row.id)));
  return true;
}

export async function listNoResultSearches(limit = 30): Promise<SearchAnalyticsEntry[]> {
  try {
    return await getDb()
      .select()
      .from(searchAnalytics)
      .orderBy(desc(searchAnalytics.searchCount), desc(searchAnalytics.lastSearchedAt))
      .limit(Math.min(100, Math.max(1, limit)));
  } catch {
    return [];
  }
}
