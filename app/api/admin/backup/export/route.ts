import { eq } from "drizzle-orm";
import { getAdminSession, isSameOrigin, verifyPassword } from "@/app/admin-session";
import { writeAuditLog } from "@/app/audit-log";
import { createSiteBackup, encryptSiteBackup } from "@/app/site-backup";
import { getDb } from "@/db";
import { adminUsers } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const owner = await getAdminSession();
  if (!owner || owner.role !== "owner") return Response.json({ error: "Acesso restrito ao proprietário." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });

  try {
    const payload = (await request.json()) as { currentPassword?: string; backupPassword?: string };
    const [account] = await getDb().select({ passwordHash: adminUsers.passwordHash }).from(adminUsers).where(eq(adminUsers.id, owner.id)).limit(1);
    if (!account || !(await verifyPassword(String(payload.currentPassword ?? ""), account.passwordHash))) {
      return Response.json({ error: "A senha atual da conta está incorreta." }, { status: 401 });
    }

    const backup = await createSiteBackup();
    const encrypted = await encryptSiteBackup(backup, String(payload.backupPassword ?? ""));
    await writeAuditLog(owner, "backup.exported", "backup", null, "Um backup completo e criptografado do site foi baixado.");
    const date = backup.createdAt.slice(0, 16).replace(/[:T]/g, "-");
    return new Response(new Blob([encrypted], { type: "application/octet-stream" }), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="droga-vida-popular-${date}.dvpbackup"`,
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar o backup." }, { status: 400 });
  }
}
