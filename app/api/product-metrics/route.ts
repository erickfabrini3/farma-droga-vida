import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { isSameOrigin } from "@/app/admin-session";
import { recordProductMetric } from "@/app/product-analytics";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });

  try {
    const payload = (await request.json()) as { productId?: number; eventType?: string };
    const productId = Number(payload.productId);
    if (!Number.isInteger(productId) || (payload.eventType !== "view" && payload.eventType !== "cart_add")) {
      return Response.json({ error: "Evento inválido." }, { status: 400 });
    }

    const [product] = await getDb().select({ id: products.id, active: products.active }).from(products).where(eq(products.id, productId)).limit(1);
    if (!product?.active) return Response.json({ error: "Produto não encontrado." }, { status: 404 });

    await recordProductMetric(productId, payload.eventType);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Não foi possível registrar a estatística." }, { status: 500 });
  }
}
