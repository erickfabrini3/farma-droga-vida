import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/app/audit-log";
import { createTotpSecret, getAdminSession, isSameOrigin, totpProvisioningUri, verifyPassword, verifyTotp } from "@/app/admin-session";
import { getDb } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const owner = await getAdminSession();
  if (!owner || owner.role !== "owner") return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });

  try {
    const payload = (await request.json()) as { action?: string; code?: string; password?: string };
    const db = getDb();
    const [account] = await db.select().from(adminUsers).where(eq(adminUsers.id, owner.id)).limit(1);
    if (!account) return Response.json({ error: "Conta não encontrada." }, { status: 404 });

    if (payload.action === "begin") {
      const secret = createTotpSecret();
      await db.update(adminUsers).set({ totpSecret: secret, totpEnabled: false, updatedAt: new Date().toISOString() }).where(eq(adminUsers.id, owner.id));
      return Response.json({ secret, provisioningUri: totpProvisioningUri(owner.username, secret) });
    }

    if (payload.action === "enable") {
      if (!account.totpSecret || !(await verifyTotp(account.totpSecret, String(payload.code ?? "")))) {
        return Response.json({ error: "Código inválido. Confira o aplicativo e tente novamente." }, { status: 400 });
      }
      await db.update(adminUsers).set({ totpEnabled: true, updatedAt: new Date().toISOString() }).where(eq(adminUsers.id, owner.id));
      await writeAuditLog(owner, "security.two_factor_enabled", "account", owner.id, "Verificação em duas etapas ativada na conta proprietária.");
      return Response.json({ enabled: true });
    }

    if (payload.action === "disable") {
      if (!(await verifyPassword(String(payload.password ?? ""), account.passwordHash))) {
        return Response.json({ error: "Senha atual incorreta." }, { status: 401 });
      }
      await db.update(adminUsers).set({ totpEnabled: false, totpSecret: null, updatedAt: new Date().toISOString() }).where(eq(adminUsers.id, owner.id));
      await db.delete(adminSessions).where(eq(adminSessions.userId, owner.id));
      await writeAuditLog(owner, "security.two_factor_disabled", "account", owner.id, "Verificação em duas etapas desativada na conta proprietária.");
      return Response.json({ enabled: false, signedOut: true });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível alterar a verificação em duas etapas." }, { status: 400 });
  }
}
