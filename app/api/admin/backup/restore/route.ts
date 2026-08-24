import { eq } from "drizzle-orm";
import { destroyAdminSession, getAdminSession, isSameOrigin, verifyPassword } from "@/app/admin-session";
import {
  currentUploadedImageUrls,
  decryptSiteBackup,
  materializeBackupImages,
  preserveCurrentOwner,
  restoreBackupTables,
} from "@/app/site-backup";
import { removeUploadedImage } from "@/app/product-images";
import { getDb } from "@/db";
import { adminUsers, auditLogs, products, siteSettings } from "@/db/schema";

export const dynamic = "force-dynamic";
const maximumFileSize = 75 * 1024 * 1024 + 128;

export async function POST(request: Request) {
  const owner = await getAdminSession();
  if (!owner || owner.role !== "owner") return Response.json({ error: "Acesso restrito ao proprietário." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });

  let createdImageUrls: string[] = [];
  let databaseRestored = false;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > maximumFileSize) throw new Error("Escolha um arquivo .dvpbackup válido, com até 75 MB.");
    const currentPassword = String(form.get("currentPassword") ?? "");
    const backupPassword = String(form.get("backupPassword") ?? "");

    const db = getDb();
    const [currentOwner] = await db.select().from(adminUsers).where(eq(adminUsers.id, owner.id)).limit(1);
    if (!currentOwner || !(await verifyPassword(currentPassword, currentOwner.passwordHash))) {
      return Response.json({ error: "A senha atual da conta está incorreta." }, { status: 401 });
    }

    const [currentProducts, currentSettings] = await Promise.all([
      db.select().from(products),
      db.select().from(siteSettings),
    ]);
    const oldImageUrls = currentUploadedImageUrls({ products: currentProducts, siteSettings: currentSettings });
    const decrypted = await decryptSiteBackup(await file.arrayBuffer(), backupPassword);
    const protectedBackup = preserveCurrentOwner(decrypted, currentOwner);
    const materialized = await materializeBackupImages(protectedBackup);
    createdImageUrls = materialized.createdUrls;
    await restoreBackupTables(materialized.payload);
    databaseRestored = true;

    try {
      const [restoredOwner] = await getDb().select({ id: adminUsers.id, displayName: adminUsers.displayName }).from(adminUsers).where(eq(adminUsers.ownerGuard, 1)).limit(1);
      await getDb().insert(auditLogs).values({
        userId: restoredOwner?.id ?? null,
        actorName: restoredOwner?.displayName ?? owner.displayName,
        action: "backup.restored",
        entityType: "backup",
        entityId: null,
        summary: `Backup de ${new Date(materialized.payload.createdAt).toLocaleString("pt-BR")} restaurado.`,
      });
    } catch {
      // A restauração principal já foi concluída; o histórico não deve desfazê-la.
    }
    await Promise.allSettled(oldImageUrls.map((url) => removeUploadedImage(url)));
    await destroyAdminSession().catch(() => undefined);
    return Response.json({
      ok: true,
      restoredAt: materialized.payload.createdAt,
      products: materialized.payload.tables.products.length,
      categories: materialized.payload.tables.catalogCategories.length,
      users: materialized.payload.tables.adminUsers.length,
      signedOut: true,
    });
  } catch (error) {
    if (!databaseRestored && createdImageUrls.length) await Promise.allSettled(createdImageUrls.map((url) => removeUploadedImage(url)));
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível restaurar o backup." }, { status: 400 });
  }
}
