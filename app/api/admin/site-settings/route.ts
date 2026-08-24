import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { siteSettings } from "@/db/schema";
import { getAdminSession, isSameOrigin } from "@/app/admin-session";
import { WEEKDAYS, parseWeeklySchedule, serializeWeeklySchedule, getSiteSettings } from "@/app/site-settings";
import { removeStoreImage, saveStoreImage } from "@/app/product-images";
import { writeAuditLog } from "@/app/audit-log";

export const dynamic = "force-dynamic";

function value(form: FormData, key: string, maxLength: number) {
  return String(form.get(key) ?? "").trim().slice(0, maxLength);
}

function scheduleValue(form: FormData, key: string, storeLabel: string) {
  const raw = value(form, key, 4000);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
  } catch {
    throw new Error(`Os horários da ${storeLabel} são inválidos.`);
  }
  const schedule = parseWeeklySchedule(raw);
  for (const day of WEEKDAYS) {
    const hours = schedule[day.key];
    if (!hours.closed && Boolean(hours.opens) !== Boolean(hours.closes)) {
      throw new Error(`Preencha abertura e fechamento de ${day.label} na ${storeLabel}.`);
    }
  }
  return serializeWeeklySchedule(schedule);
}

export async function GET() {
  const user = await getAdminSession();
  if (!user?.canManageContent) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  return Response.json({ settings: await getSiteSettings() });
}

export async function PUT(request: Request) {
  const user = await getAdminSession();
  if (!user?.canManageContent) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });

  const uploadedImages: string[] = [];
  try {
    const form = await request.formData();
    const current = await getSiteSettings();
    const bannerEyebrow = value(form, "bannerEyebrow", 60);
    const bannerTitle = value(form, "bannerTitle", 120);
    const bannerText = value(form, "bannerText", 240);
    const bannerCtaLabel = value(form, "bannerCtaLabel", 40);
    const bannerCtaHref = value(form, "bannerCtaHref", 160);
    const store1Hours = scheduleValue(form, "store1Hours", "Loja 1");
    const store2Hours = scheduleValue(form, "store2Hours", "Loja 2");

    if (!bannerEyebrow || !bannerTitle || !bannerText || !bannerCtaLabel) {
      return Response.json({ error: "Preencha todos os textos do banner." }, { status: 400 });
    }
    if (!(bannerCtaHref.startsWith("#") || bannerCtaHref.startsWith("/"))) {
      return Response.json({ error: "O destino do botão deve começar com # ou /." }, { status: 400 });
    }

    let store1ImageUrl = current.store1ImageUrl;
    let store2ImageUrl = current.store2ImageUrl;
    const store1Image = form.get("store1Image");
    const store2Image = form.get("store2Image");
    if (store1Image instanceof File && store1Image.size > 0) {
      store1ImageUrl = await saveStoreImage(store1Image);
      uploadedImages.push(store1ImageUrl);
    }
    if (store2Image instanceof File && store2Image.size > 0) {
      store2ImageUrl = await saveStoreImage(store2Image);
      uploadedImages.push(store2ImageUrl);
    }

    const values = {
      bannerActive: value(form, "bannerActive", 8) === "true",
      bannerEyebrow,
      bannerTitle,
      bannerText,
      bannerCtaLabel,
      bannerCtaHref,
      store1Hours,
      store1ImageUrl,
      store2Hours,
      store2ImageUrl,
      updatedAt: new Date().toISOString(),
    };

    const db = getDb();
    await db.insert(siteSettings).values({ id: 1, ...values }).onConflictDoUpdate({ target: siteSettings.id, set: values });
    if (store1ImageUrl !== current.store1ImageUrl && current.store1ImageUrl) await removeStoreImage(current.store1ImageUrl).catch(() => undefined);
    if (store2ImageUrl !== current.store2ImageUrl && current.store2ImageUrl) await removeStoreImage(current.store2ImageUrl).catch(() => undefined);

    const [settings] = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
    await writeAuditLog(user, "site.updated", "site_settings", 1, "Banner, fotos ou horários das lojas foram atualizados.");
    return Response.json({ settings });
  } catch (error) {
    await Promise.all(uploadedImages.map((imageUrl) => removeStoreImage(imageUrl).catch(() => undefined)));
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar as configurações." }, { status: 400 });
  }
}
