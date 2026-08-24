import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { productMetrics } from "@/db/schema";

export type ProductMetric = typeof productMetrics.$inferSelect;

export async function listProductMetrics(): Promise<ProductMetric[]> {
  try {
    return await getDb().select().from(productMetrics);
  } catch {
    return [];
  }
}

export async function recordProductMetric(productId: number, eventType: "view" | "cart_add") {
  const db = getDb();
  const existing = await db.select().from(productMetrics).where(eq(productMetrics.productId, productId)).limit(1);
  const now = new Date().toISOString();

  if (existing[0]) {
    await db.update(productMetrics).set({
      views: existing[0].views + (eventType === "view" ? 1 : 0),
      cartAdds: existing[0].cartAdds + (eventType === "cart_add" ? 1 : 0),
      updatedAt: now,
    }).where(eq(productMetrics.productId, productId));
    return;
  }

  await db.insert(productMetrics).values({
    productId,
    views: eventType === "view" ? 1 : 0,
    cartAdds: eventType === "cart_add" ? 1 : 0,
    updatedAt: now,
  });
}
