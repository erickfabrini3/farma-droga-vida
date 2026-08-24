import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { productVariants, products } from "@/db/schema";
import { getAdminSession, isSameOrigin } from "@/app/admin-session";
import { duplicateProductImage, removeProductImage, saveProductImage } from "@/app/product-images";
import { isValidCategoryPair } from "@/app/product-categories";
import { listAllProducts } from "@/app/product-data";
import { writeAuditLog } from "@/app/audit-log";

export const dynamic = "force-dynamic";

const tones = new Set(["mint", "rose", "amber", "sage", "sky", "lavender", "blue"]);
const badges = new Set(["", "Oferta", "Mais vendido", "Novidade"]);
const automaticVariantDetail = "Quantidade por pacote conforme o tamanho selecionado";

function parsePrice(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").replace(/R\$/gi, "").replace(/\s/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

async function authorize() {
  const user = await getAdminSession();
  return user?.canManageProducts ? user : null;
}

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Não foi possível salvar o produto.";
  return Response.json({ error: message }, { status });
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Informe datas válidas para a oferta.");
  return date.toISOString();
}

async function valuesFromForm(form: FormData) {
  const name = text(form, "name").slice(0, 120);
  const category = text(form, "category");
  const subcategory = text(form, "subcategory");
  const brand = text(form, "brand").slice(0, 80);
  const activeIngredient = text(form, "activeIngredient").slice(0, 120);
  const dosage = text(form, "dosage").slice(0, 80);
  const barcode = text(form, "barcode").replace(/\D/g, "").slice(0, 20);
  const registration = text(form, "registration").replace(/[^0-9.-]/g, "").slice(0, 30);
  const variants = parseVariants(text(form, "variants"));
  const requestedDetail = text(form, "detail").slice(0, 160);
  const detail = requestedDetail || (variants.length ? automaticVariantDetail : "");
  const oldPriceCents = parsePrice(form.get("oldPrice"));
  const priceCents = parsePrice(form.get("price"));
  const requestedBadge = text(form, "badge");
  const badge = badges.has(requestedBadge) ? requestedBadge : "Oferta";
  const requestedTone = text(form, "tone");
  const tone = tones.has(requestedTone) ? requestedTone : "amber";
  const sortOrder = Math.max(0, Number.parseInt(text(form, "sortOrder") || "0", 10) || 0);
  const active = text(form, "active") === "true";
  const featured = text(form, "featured") !== "false";
  const availableStore1 = text(form, "availableStore1") === "true";
  const availableStore2 = text(form, "availableStore2") === "true";
  const offerStartsAt = parseDate(text(form, "offerStartsAt"));
  const offerEndsAt = parseDate(text(form, "offerEndsAt"));
  if (!name || !detail || oldPriceCents === null || priceCents === null) {
    throw new Error("Preencha nome, apresentação e os dois preços.");
  }

  if (!(await isValidCategoryPair(category, subcategory))) {
    throw new Error("Escolha uma categoria e uma subcategoria válidas.");
  }
  if (!availableStore1 && !availableStore2) throw new Error("Marque pelo menos uma loja com disponibilidade.");
  if (offerStartsAt && offerEndsAt && new Date(offerStartsAt) >= new Date(offerEndsAt)) {
    throw new Error("A data final da oferta deve ser posterior à data inicial.");
  }

  return {
    values: { name, category, subcategory, brand, activeIngredient, dosage, barcode, registration, detail, oldPriceCents, priceCents, stockQuantity: 1, badge, tone, sortOrder, active, featured, availableStore1, availableStore2, offerStartsAt, offerEndsAt },
    variants,
  };
}

type VariantInput = { size: string; packageQuantity: number; stockQuantity: number; sortOrder: number };

function parseVariants(raw: string): VariantInput[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("As opções de tamanho são inválidas.");
  }
  if (!Array.isArray(parsed) || parsed.length > 20) throw new Error("Cadastre no máximo 20 tamanhos por produto.");

  const variants = parsed.map((item, index) => {
    const candidate = item as Record<string, unknown>;
    const size = String(candidate.size ?? "").trim().slice(0, 20).toUpperCase();
    const packageQuantity = Number.parseInt(String(candidate.packageQuantity ?? ""), 10);
    if (!size || !Number.isInteger(packageQuantity) || packageQuantity <= 0) {
      throw new Error("Preencha o tamanho e a quantidade por pacote de cada opção.");
    }
    return { size, packageQuantity, stockQuantity: 1, sortOrder: index };
  });

  if (new Set(variants.map((variant) => variant.size)).size !== variants.length) {
    throw new Error("Não repita o mesmo tamanho no produto.");
  }
  return variants;
}

export async function GET() {
  if (!(await authorize())) return errorResponse(new Error("Acesso restrito."), 403);
  try {
    const rows = await listAllProducts();
    return Response.json({ products: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await authorize();
  if (!user) return errorResponse(new Error("Acesso restrito."), 403);
  if (!isSameOrigin(request)) return errorResponse(new Error("Solicitação inválida."), 403);

  let uploadedImage = "";
  let createdProductId: number | null = null;
  try {
    const form = await request.formData();
    const { values, variants } = await valuesFromForm(form);
    const image = form.get("image");
    const duplicateFromId = Number.parseInt(text(form, "duplicateFromId"), 10);
    if (image instanceof File && image.size > 0) {
      uploadedImage = await saveProductImage(image);
    } else if (Number.isInteger(duplicateFromId)) {
      const [source] = await getDb().select().from(products).where(eq(products.id, duplicateFromId)).limit(1);
      if (!source) return errorResponse(new Error("O produto original não foi encontrado."), 404);
      uploadedImage = await duplicateProductImage(source.imageUrl);
    } else {
      return errorResponse(new Error("Escolha uma foto para o produto."), 400);
    }

    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({ ...values, imageUrl: uploadedImage })
      .returning();
    createdProductId = product.id;
    if (variants.length) await db.insert(productVariants).values(variants.map((variant) => ({ ...variant, productId: product.id })));
    await writeAuditLog(user, "product.created", "product", product.id, Number.isInteger(duplicateFromId) ? `Produto ${product.name} cadastrado como cópia do item ${duplicateFromId}.` : `Produto ${product.name} cadastrado.`);
    return Response.json({ product: { ...product, variants: variants.map((variant, index) => ({ ...variant, id: index, productId: product.id })) } }, { status: 201 });
  } catch (error) {
    if (createdProductId !== null) await getDb().delete(products).where(eq(products.id, createdProductId)).catch(() => undefined);
    if (uploadedImage) await removeProductImage(uploadedImage).catch(() => undefined);
    return errorResponse(error, 400);
  }
}

export async function PUT(request: Request) {
  const user = await authorize();
  if (!user) return errorResponse(new Error("Acesso restrito."), 403);
  if (!isSameOrigin(request)) return errorResponse(new Error("Solicitação inválida."), 403);

  let uploadedImage = "";
  try {
    const form = await request.formData();
    const id = Number.parseInt(text(form, "id"), 10);
    if (!Number.isInteger(id)) return errorResponse(new Error("Produto inválido."), 400);

    const db = getDb();
    const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) return errorResponse(new Error("Produto não encontrado."), 404);

    const { values, variants } = await valuesFromForm(form);
    const image = form.get("image");
    if (image instanceof File && image.size > 0) uploadedImage = await saveProductImage(image);

    await db.delete(productVariants).where(eq(productVariants.productId, id));
    if (variants.length) await db.insert(productVariants).values(variants.map((variant) => ({ ...variant, productId: id })));

    const [product] = await db
      .update(products)
      .set({
        ...values,
        imageUrl: uploadedImage || existing.imageUrl,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, id))
      .returning();

    if (uploadedImage) await removeProductImage(existing.imageUrl).catch(() => undefined);
    await writeAuditLog(user, "product.updated", "product", id, `Produto ${product.name} atualizado.`);
    return Response.json({ product: { ...product, variants } });
  } catch (error) {
    if (uploadedImage) await removeProductImage(uploadedImage).catch(() => undefined);
    return errorResponse(error, 400);
  }
}

export async function DELETE(request: Request) {
  const user = await authorize();
  if (!user) return errorResponse(new Error("Acesso restrito."), 403);
  if (!isSameOrigin(request)) return errorResponse(new Error("Solicitação inválida."), 403);
  try {
    const payload = (await request.json()) as { id?: number };
    const id = Number(payload.id);
    if (!Number.isInteger(id)) return errorResponse(new Error("Produto inválido."), 400);

    const db = getDb();
    const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) return errorResponse(new Error("Produto não encontrado."), 404);

    await db.delete(products).where(eq(products.id, id));
    await removeProductImage(existing.imageUrl).catch(() => undefined);
    await writeAuditLog(user, "product.deleted", "product", id, `Produto ${existing.name} removido.`);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
