import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storeSpecialHours } from "@/db/schema";
import { getAdminSession, isSameOrigin } from "@/app/admin-session";
import { listStoreSpecialHours, saoPauloDateKey } from "@/app/site-settings";
import { writeAuditLog } from "@/app/audit-log";

export const dynamic = "force-dynamic";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function validDate(value: string) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function maximumDate() {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + 2);
  return date.toISOString().slice(0, 10);
}

async function authorize() {
  const user = await getAdminSession();
  return user?.canManageContent ? user : null;
}

export async function POST(request: Request) {
  const user = await authorize();
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const storeNumber = Number(payload.storeNumber);
    const date = String(payload.date ?? "").trim();
    const closed = payload.closed === true;
    const opens = closed ? "" : String(payload.opens ?? "").trim();
    const closes = closed ? "" : String(payload.closes ?? "").trim();
    const note = String(payload.note ?? "").trim().slice(0, 80);
    if (![1, 2].includes(storeNumber)) throw new Error("Escolha uma loja válida.");
    if (!validDate(date) || date < saoPauloDateKey() || date > maximumDate()) throw new Error("Escolha uma data entre hoje e os próximos dois anos.");
    if (!closed && (!timePattern.test(opens) || !timePattern.test(closes) || opens === closes)) {
      throw new Error("Informe horários válidos e diferentes, ou marque a loja como fechada.");
    }
    const now = new Date().toISOString();
    await getDb().insert(storeSpecialHours).values({ storeNumber, date, closed, opens, closes, note, updatedAt: now }).onConflictDoUpdate({
      target: [storeSpecialHours.storeNumber, storeSpecialHours.date],
      set: { closed, opens, closes, note, updatedAt: now },
    });
    await writeAuditLog(user, "store.special_hours.saved", "store_special_hours", `${storeNumber}:${date}`, `Horário especial da Loja ${storeNumber} em ${date} salvo.`);
    return Response.json({ specialHours: await listStoreSpecialHours() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o horário especial." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = await authorize();
  if (!user) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  try {
    const payload = (await request.json()) as { id?: unknown };
    const id = Number(payload.id);
    if (!Number.isInteger(id)) throw new Error("Horário especial inválido.");
    const db = getDb();
    const [existing] = await db.select().from(storeSpecialHours).where(eq(storeSpecialHours.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Horário especial não encontrado." }, { status: 404 });
    await db.delete(storeSpecialHours).where(and(eq(storeSpecialHours.id, id), eq(storeSpecialHours.storeNumber, existing.storeNumber)));
    await writeAuditLog(user, "store.special_hours.deleted", "store_special_hours", id, `Horário especial da Loja ${existing.storeNumber} em ${existing.date} removido.`);
    return Response.json({ specialHours: await listStoreSpecialHours() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível remover o horário especial." }, { status: 400 });
  }
}
