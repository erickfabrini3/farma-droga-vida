import { eq } from "drizzle-orm";
import { createAdminSession, getAdminSession, hashPassword, isSameOrigin, verifyPassword } from "@/app/admin-session";
import { getDb } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const owner = await getAdminSession();
  if (!owner || owner.role !== "owner") return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });

  try {
    const payload = (await request.json()) as { currentPassword?: string; newPassword?: string };
    const [record] = await getDb().select({ passwordHash: adminUsers.passwordHash }).from(adminUsers).where(eq(adminUsers.id, owner.id)).limit(1);
    if (!record || !(await verifyPassword(String(payload.currentPassword ?? ""), record.passwordHash))) {
      return Response.json({ error: "A senha atual está incorreta." }, { status: 401 });
    }

    const newPasswordHash = await hashPassword(String(payload.newPassword ?? ""));
    await getDb().update(adminUsers).set({ passwordHash: newPasswordHash, failedAttempts: 0, lockedUntil: null, updatedAt: new Date().toISOString() }).where(eq(adminUsers.id, owner.id));
    await getDb().delete(adminSessions).where(eq(adminSessions.userId, owner.id));
    await createAdminSession(owner.id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível alterar a senha.";
    return Response.json({ error: message }, { status: 400 });
  }
}
