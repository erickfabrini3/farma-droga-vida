import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { getAdminSession, isSameOrigin } from "@/app/admin-session";
import { isValidCategoryPair } from "@/app/product-categories";
import { writeAuditLog } from "@/app/audit-log";

export const dynamic = "force-dynamic";

function optionalIsoDate(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string") throw new Error("Informe datas válidas para a oferta.");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Informe datas válidas para a oferta.");
  return date.toISOString();
}

export async function POST(request: Request) {
  const user = await getAdminSession();
  if (!user?.canManageProducts) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  try {
    const payload = (await request.json()) as { ids?: unknown; changes?: unknown };
    if (!Array.isArray(payload.ids)) throw new Error("Selecione pelo menos um produto.");
    const ids = [...new Set(payload.ids.map(Number).filter(Number.isInteger))];
    if (!ids.length || ids.length > 200) throw new Error("Selecione de 1 a 200 produtos.");
    if (!payload.changes || typeof payload.changes !== "object" || Array.isArray(payload.changes)) throw new Error("Escolha pelo menos uma alteração.");
    const changes = payload.changes as Record<string, unknown>;
    const values: Partial<typeof products.$inferInsert> = { updatedAt: new Date().toISOString() };
    const summaries: string[] = [];

    if (typeof changes.active === "boolean") {
      values.active = changes.active;
      summaries.push(changes.active ? "ativação" : "desativação");
    }

    if (typeof changes.featured === "boolean") {
      values.featured = changes.featured;
      summaries.push(changes.featured ? "inclusão na vitrine" : "exibição somente na pesquisa");
    }

    if (changes.category && typeof changes.category === "object" && !Array.isArray(changes.category)) {
      const categoryChange = changes.category as Record<string, unknown>;
      const category = String(categoryChange.category ?? "").trim();
      const subcategory = String(categoryChange.subcategory ?? "").trim();
      if (!(await isValidCategoryPair(category, subcategory))) throw new Error("Escolha uma categoria e subcategoria válidas.");
      values.category = category;
      values.subcategory = subcategory;
      summaries.push("categoria");
    }

    if (changes.availability !== undefined) {
      const availability = String(changes.availability);
      if (!new Set(["both", "store1", "store2"]).has(availability)) throw new Error("Escolha uma disponibilidade válida.");
      values.availableStore1 = availability !== "store2";
      values.availableStore2 = availability !== "store1";
      summaries.push("lojas disponíveis");
    }

    if (changes.offer && typeof changes.offer === "object" && !Array.isArray(changes.offer)) {
      const offer = changes.offer as Record<string, unknown>;
      const mode = String(offer.mode ?? "");
      if (mode === "clear") {
        values.offerStartsAt = null;
        values.offerEndsAt = null;
        summaries.push("remoção do prazo da oferta");
      } else if (mode === "set") {
        const offerStartsAt = optionalIsoDate(offer.offerStartsAt);
        const offerEndsAt = optionalIsoDate(offer.offerEndsAt);
        if (!offerStartsAt && !offerEndsAt) throw new Error("Informe pelo menos uma data da oferta.");
        if (offerStartsAt && offerEndsAt && new Date(offerStartsAt) >= new Date(offerEndsAt)) throw new Error("O fim da oferta deve ser posterior ao início.");
        values.offerStartsAt = offerStartsAt;
        values.offerEndsAt = offerEndsAt;
        summaries.push("prazo da oferta");
      } else {
        throw new Error("Escolha uma ação válida para o prazo da oferta.");
      }
    }

    if (!summaries.length) throw new Error("Escolha pelo menos uma alteração.");
    const existing = await getDb().select({ id: products.id }).from(products).where(inArray(products.id, ids));
    if (!existing.length) throw new Error("Nenhum dos produtos selecionados foi encontrado.");
    const existingIds = existing.map((row) => row.id);
    await getDb().update(products).set(values).where(inArray(products.id, existingIds));
    await writeAuditLog(user, "products.batch_updated", "product", existingIds.join(","), `${existingIds.length} produtos atualizados em massa: ${summaries.join(", ")}.`);
    return Response.json({ updated: existingIds.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível editar os produtos." }, { status: 400 });
  }
}
