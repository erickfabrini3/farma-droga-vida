import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/app/audit-log";
import { getAdminSession, isSameOrigin } from "@/app/admin-session";
import { isValidCategoryPair } from "@/app/product-categories";
import { listAllProducts } from "@/app/product-data";
import { getDb } from "@/db";
import { products } from "@/db/schema";

export const dynamic = "force-dynamic";

const columns = ["id", "nome", "categoria", "subcategoria", "marca", "principio_ativo", "dosagem", "apresentacao", "preco_anterior", "preco_oferta", "codigo_barras", "registro", "loja1", "loja2", "inicio_oferta", "fim_oferta", "ativo", "vitrine", "ordem"];

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const delimiter = input.split(/\r?\n/, 1)[0]?.includes(";") ? ";" : ",";
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"' && quoted && input[index + 1] === '"') { cell += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === delimiter && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = ""; continue;
    }
    cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function cents(value: string) {
  const cleaned = value.replace(/R\$/gi, "").replace(/\s/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Preço inválido: ${value}`);
  return Math.round(parsed * 100);
}

function bool(value: string, fallback = true) {
  if (!value) return fallback;
  return !["0", "não", "nao", "false", "n"].includes(value.toLocaleLowerCase("pt-BR"));
}

function dateValue(value: string) {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Data inválida: ${value}`);
  return date.toISOString();
}

async function authorize() {
  const user = await getAdminSession();
  return user?.canManageProducts ? user : null;
}

export async function GET() {
  if (!(await authorize())) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const catalog = await listAllProducts();
  const body = [columns, ...catalog.map((product) => [
    product.id, product.name, product.category, product.subcategory, product.brand, product.activeIngredient,
    product.dosage, product.detail, (product.oldPriceCents / 100).toFixed(2).replace(".", ","),
    (product.priceCents / 100).toFixed(2).replace(".", ","), product.barcode, product.registration,
    product.availableStore1 ? "sim" : "não", product.availableStore2 ? "sim" : "não",
    product.offerStartsAt ?? "", product.offerEndsAt ?? "", product.active ? "sim" : "não", product.featured ? "sim" : "não", product.sortOrder,
  ])].map((row) => row.map(csvCell).join(";")).join("\r\n");
  return new Response(`\ufeff${body}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=produtos-droga-vida-popular.csv" } });
}

export async function POST(request: Request) {
  const user = await authorize();
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024) throw new Error("Escolha uma planilha CSV com até 2 MB.");
    const rows = parseCsv((await file.text()).replace(/^\ufeff/, ""));
    if (rows.length < 2 || rows.length > 101) throw new Error("A planilha deve ter de 1 a 100 produtos.");
    const header = rows[0].map((value) => value.toLocaleLowerCase("pt-BR"));
    const missing = ["nome", "categoria", "subcategoria", "apresentacao", "preco_anterior", "preco_oferta"].filter((column) => !header.includes(column));
    if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}.`);
    const index = (column: string) => header.indexOf(column);
    const value = (row: string[], column: string) => index(column) >= 0 ? row[index(column)] ?? "" : "";
    const db = getDb();
    let created = 0;
    let updated = 0;

    for (const [rowIndex, row] of rows.slice(1).entries()) {
      const name = value(row, "nome").slice(0, 120);
      const category = value(row, "categoria");
      const subcategory = value(row, "subcategoria");
      if (!name || !(await isValidCategoryPair(category, subcategory))) throw new Error(`Linha ${rowIndex + 2}: confira nome, categoria e subcategoria.`);
      const availableStore1 = bool(value(row, "loja1"));
      const availableStore2 = bool(value(row, "loja2"));
      if (!availableStore1 && !availableStore2) throw new Error(`Linha ${rowIndex + 2}: marque pelo menos uma loja.`);
      const values = {
        name, category, subcategory,
        brand: value(row, "marca").slice(0, 80), activeIngredient: value(row, "principio_ativo").slice(0, 120),
        dosage: value(row, "dosagem").slice(0, 80), detail: value(row, "apresentacao").slice(0, 160),
        oldPriceCents: cents(value(row, "preco_anterior")), priceCents: cents(value(row, "preco_oferta")),
        barcode: value(row, "codigo_barras").replace(/\D/g, "").slice(0, 20), registration: value(row, "registro").replace(/[^0-9.-]/g, "").slice(0, 30),
        availableStore1, availableStore2, offerStartsAt: dateValue(value(row, "inicio_oferta")), offerEndsAt: dateValue(value(row, "fim_oferta")),
        active: bool(value(row, "ativo")), sortOrder: Math.max(0, Number.parseInt(value(row, "ordem") || "0", 10) || 0),
        stockQuantity: 1, badge: "Oferta", tone: "amber", updatedAt: new Date().toISOString(),
      };
      if (index("vitrine") >= 0) Object.assign(values, { featured: bool(value(row, "vitrine")) });
      const id = Number.parseInt(value(row, "id"), 10);
      if (Number.isInteger(id)) {
        const result = await db.update(products).set(values).where(eq(products.id, id)).returning({ id: products.id });
        if (result.length) { updated += 1; continue; }
      }
      await db.insert(products).values({ ...values, imageUrl: "/brand/droga-vida-popular-logo.png" });
      created += 1;
    }

    await writeAuditLog(user, "product.bulk_import", "product", null, `Planilha importada: ${created} produtos criados e ${updated} atualizados.`);
    return Response.json({ created, updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível importar a planilha." }, { status: 400 });
  }
}
