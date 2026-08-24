import { and, asc, eq, max } from "drizzle-orm";
import { writeAuditLog } from "@/app/audit-log";
import { getAdminSession, isSameOrigin } from "@/app/admin-session";
import { listCatalogCategories } from "@/app/product-categories";
import { getDb } from "@/db";
import { catalogCategories, catalogSubcategories, products } from "@/db/schema";

export const dynamic = "force-dynamic";

async function authorize() {
  const user = await getAdminSession();
  return user?.canManageProducts ? user : null;
}

function cleanName(value: unknown, label: string) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new Error(`${label} deve ter entre 2 e 80 caracteres.`);
  return name;
}

function cleanIcon(value: unknown) {
  const icon = String(value ?? "+").trim();
  return (icon || "+").slice(0, 8);
}

function responseError(error: unknown) {
  const message = error instanceof Error && error.message.includes("UNIQUE")
    ? "Já existe uma categoria ou subcategoria com esse nome."
    : error instanceof Error ? error.message : "Não foi possível alterar as categorias.";
  return Response.json({ error: message }, { status: 400 });
}

export async function GET() {
  if (!(await authorize())) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  return Response.json({ categories: await listCatalogCategories(true) });
}

export async function POST(request: Request) {
  const user = await authorize();
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  try {
    const payload = (await request.json()) as { kind?: string; name?: string; icon?: string; categoryId?: number };
    const db = getDb();
    if (payload.kind === "category") {
      const name = cleanName(payload.name, "O nome da categoria");
      const [{ value: highest }] = await db.select({ value: max(catalogCategories.sortOrder) }).from(catalogCategories);
      const [created] = await db.insert(catalogCategories).values({ name, icon: cleanIcon(payload.icon), sortOrder: Number(highest ?? 0) + 10 }).returning();
      await writeAuditLog(user, "category.created", "category", created.id, `Categoria ${created.name} criada.`);
    } else if (payload.kind === "subcategory") {
      const categoryId = Number(payload.categoryId);
      const [category] = await db.select().from(catalogCategories).where(eq(catalogCategories.id, categoryId)).limit(1);
      if (!category) throw new Error("Categoria não encontrada.");
      const [{ value: highest }] = await db.select({ value: max(catalogSubcategories.sortOrder) }).from(catalogSubcategories).where(eq(catalogSubcategories.categoryId, categoryId));
      const [created] = await db.insert(catalogSubcategories).values({ categoryId, name: cleanName(payload.name, "O nome da subcategoria"), sortOrder: Number(highest ?? 0) + 10 }).returning();
      await writeAuditLog(user, "subcategory.created", "subcategory", created.id, `Subcategoria ${created.name} criada em ${category.name}.`);
    } else {
      throw new Error("Tipo de cadastro inválido.");
    }
    return Response.json({ categories: await listCatalogCategories(true) }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}

async function moveItem(kind: "category" | "subcategory", id: number, direction: "up" | "down") {
  const db = getDb();
  if (kind === "category") {
    const rows = await db.select().from(catalogCategories).orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.id));
    const index = rows.findIndex((row) => row.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    for (const [position, row] of rows.entries()) await db.update(catalogCategories).set({ sortOrder: (position + 1) * 10 }).where(eq(catalogCategories.id, row.id));
    return;
  }
  const [current] = await db.select().from(catalogSubcategories).where(eq(catalogSubcategories.id, id)).limit(1);
  if (!current) throw new Error("Subcategoria não encontrada.");
  const rows = await db.select().from(catalogSubcategories).where(eq(catalogSubcategories.categoryId, current.categoryId)).orderBy(asc(catalogSubcategories.sortOrder), asc(catalogSubcategories.id));
  const index = rows.findIndex((row) => row.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= rows.length) return;
  [rows[index], rows[target]] = [rows[target], rows[index]];
  for (const [position, row] of rows.entries()) await db.update(catalogSubcategories).set({ sortOrder: (position + 1) * 10 }).where(eq(catalogSubcategories.id, row.id));
}

export async function PUT(request: Request) {
  const user = await authorize();
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  try {
    const payload = (await request.json()) as { kind?: "category" | "subcategory"; id?: number; name?: string; icon?: string; active?: boolean; direction?: "up" | "down" };
    const kind = payload.kind;
    const id = Number(payload.id);
    if ((kind !== "category" && kind !== "subcategory") || !Number.isInteger(id)) throw new Error("Item inválido.");

    if (payload.direction === "up" || payload.direction === "down") {
      await moveItem(kind, id, payload.direction);
      await writeAuditLog(user, `${kind}.reordered`, kind, id, `${kind === "category" ? "Categoria" : "Subcategoria"} reordenada.`);
      return Response.json({ categories: await listCatalogCategories(true) });
    }

    const db = getDb();
    if (kind === "category") {
      const [existing] = await db.select().from(catalogCategories).where(eq(catalogCategories.id, id)).limit(1);
      if (!existing) throw new Error("Categoria não encontrada.");
      const name = cleanName(payload.name, "O nome da categoria");
      await db.update(catalogCategories).set({ name, icon: cleanIcon(payload.icon), active: Boolean(payload.active), updatedAt: new Date().toISOString() }).where(eq(catalogCategories.id, id));
      if (name !== existing.name) await db.update(products).set({ category: name, updatedAt: new Date().toISOString() }).where(eq(products.category, existing.name));
      await writeAuditLog(user, "category.updated", "category", id, `Categoria ${existing.name} atualizada para ${name}.`);
    } else {
      const [existing] = await db.select().from(catalogSubcategories).where(eq(catalogSubcategories.id, id)).limit(1);
      if (!existing) throw new Error("Subcategoria não encontrada.");
      const [category] = await db.select().from(catalogCategories).where(eq(catalogCategories.id, existing.categoryId)).limit(1);
      if (!category) throw new Error("Categoria não encontrada.");
      const name = cleanName(payload.name, "O nome da subcategoria");
      await db.update(catalogSubcategories).set({ name, active: Boolean(payload.active), updatedAt: new Date().toISOString() }).where(eq(catalogSubcategories.id, id));
      if (name !== existing.name) await db.update(products).set({ subcategory: name, updatedAt: new Date().toISOString() }).where(and(eq(products.category, category.name), eq(products.subcategory, existing.name)));
      await writeAuditLog(user, "subcategory.updated", "subcategory", id, `Subcategoria ${existing.name} atualizada para ${name}.`);
    }
    return Response.json({ categories: await listCatalogCategories(true) });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(request: Request) {
  const user = await authorize();
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  try {
    const payload = (await request.json()) as { kind?: "category" | "subcategory"; id?: number };
    const id = Number(payload.id);
    const db = getDb();
    if (payload.kind === "category") {
      const [category] = await db.select().from(catalogCategories).where(eq(catalogCategories.id, id)).limit(1);
      if (!category) throw new Error("Categoria não encontrada.");
      const allCategories = await db.select({ id: catalogCategories.id }).from(catalogCategories).limit(2);
      if (allCategories.length <= 1) throw new Error("Mantenha pelo menos uma categoria no catálogo.");
      const [linked] = await db.select({ id: products.id }).from(products).where(eq(products.category, category.name)).limit(1);
      if (linked) throw new Error("Essa categoria possui produtos. Desative-a ou mova os produtos antes de remover.");
      await db.delete(catalogCategories).where(eq(catalogCategories.id, id));
      await writeAuditLog(user, "category.deleted", "category", id, `Categoria ${category.name} removida.`);
    } else if (payload.kind === "subcategory") {
      const [subcategory] = await db.select().from(catalogSubcategories).where(eq(catalogSubcategories.id, id)).limit(1);
      if (!subcategory) throw new Error("Subcategoria não encontrada.");
      const [category] = await db.select().from(catalogCategories).where(eq(catalogCategories.id, subcategory.categoryId)).limit(1);
      const [linked] = category ? await db.select({ id: products.id }).from(products).where(and(eq(products.category, category.name), eq(products.subcategory, subcategory.name))).limit(1) : [];
      if (linked) throw new Error("Essa subcategoria possui produtos. Desative-a ou mova os produtos antes de remover.");
      await db.delete(catalogSubcategories).where(eq(catalogSubcategories.id, id));
      await writeAuditLog(user, "subcategory.deleted", "subcategory", id, `Subcategoria ${subcategory.name} removida.`);
    } else {
      throw new Error("Item inválido.");
    }
    return Response.json({ categories: await listCatalogCategories(true) });
  } catch (error) {
    return responseError(error);
  }
}
