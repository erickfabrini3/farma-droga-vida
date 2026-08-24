import { eq } from "drizzle-orm";
import { getAdminSession, hashPassword, isSameOrigin, LoginError, validateUsername } from "@/app/admin-session";
import { getDb } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";
import { writeAuditLog } from "@/app/audit-log";

export const dynamic = "force-dynamic";

async function authorizeOwner() {
  const user = await getAdminSession();
  return user?.role === "owner" ? user : null;
}

function responseError(error: unknown, fallback = "Não foi possível alterar o acesso.") {
  const unique = error instanceof Error && error.message.includes("UNIQUE");
  const status = error instanceof LoginError ? error.status : unique ? 409 : 400;
  const message = unique ? "Esse nome de usuário já está em uso." : error instanceof Error ? error.message : fallback;
  return Response.json({ error: message }, { status });
}

function validateDisplayName(value: unknown) {
  const displayName = String(value ?? "").trim();
  if (displayName.length < 2 || displayName.length > 60) throw new LoginError("Informe um nome de 2 a 60 caracteres.", 400);
  return displayName;
}

export async function GET() {
  if (!(await authorizeOwner())) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const users = await getDb().select({
    id: adminUsers.id,
    username: adminUsers.username,
    displayName: adminUsers.displayName,
    role: adminUsers.role,
    active: adminUsers.active,
    canManageProducts: adminUsers.canManageProducts,
    canManageContent: adminUsers.canManageContent,
    canViewAnalytics: adminUsers.canViewAnalytics,
    totpEnabled: adminUsers.totpEnabled,
    lastLoginAt: adminUsers.lastLoginAt,
    createdAt: adminUsers.createdAt,
  }).from(adminUsers).orderBy(adminUsers.id);
  return Response.json({ users });
}

export async function POST(request: Request) {
  if (!(await authorizeOwner())) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  try {
    const payload = (await request.json()) as { username?: string; displayName?: string; password?: string; canManageProducts?: boolean; canManageContent?: boolean; canViewAnalytics?: boolean };
    const [user] = await getDb().insert(adminUsers).values({
      username: validateUsername(String(payload.username ?? "")),
      displayName: validateDisplayName(payload.displayName),
      passwordHash: await hashPassword(String(payload.password ?? "")),
      role: "editor",
      active: true,
      canManageProducts: payload.canManageProducts !== false,
      canManageContent: Boolean(payload.canManageContent),
      canViewAnalytics: Boolean(payload.canViewAnalytics),
    }).returning();
    const owner = await authorizeOwner();
    if (owner) await writeAuditLog(owner, "user.created", "admin_user", user.id, `Acesso criado para ${user.displayName}.`);
    return Response.json({ id: user.id }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}

export async function PUT(request: Request) {
  const owner = await authorizeOwner();
  if (!owner) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  try {
    const payload = (await request.json()) as { id?: number; username?: string; displayName?: string; password?: string; active?: boolean; canManageProducts?: boolean; canManageContent?: boolean; canViewAnalytics?: boolean };
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id === owner.id) throw new LoginError("A conta proprietária não pode ser alterada por esta tela.", 400);

    const [existing] = await getDb().select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
    if (!existing || existing.role === "owner") throw new LoginError("Conta não encontrada.", 404);

    const password = String(payload.password ?? "");
    await getDb().update(adminUsers).set({
      username: validateUsername(String(payload.username ?? "")),
      displayName: validateDisplayName(payload.displayName),
      active: Boolean(payload.active),
      canManageProducts: Boolean(payload.canManageProducts),
      canManageContent: Boolean(payload.canManageContent),
      canViewAnalytics: Boolean(payload.canViewAnalytics),
      passwordHash: password ? await hashPassword(password) : existing.passwordHash,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    }).where(eq(adminUsers.id, id));
    if (password || !payload.active) await getDb().delete(adminSessions).where(eq(adminSessions.userId, id));
    await writeAuditLog(owner, "user.updated", "admin_user", id, `Acesso de ${existing.displayName} atualizado.`);
    return Response.json({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(request: Request) {
  const owner = await authorizeOwner();
  if (!owner) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  try {
    const payload = (await request.json()) as { id?: number };
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id === owner.id) throw new LoginError("A conta proprietária não pode ser removida.", 400);
    const [existing] = await getDb().select({ role: adminUsers.role }).from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
    if (!existing || existing.role === "owner") throw new LoginError("Conta não encontrada.", 404);
    await getDb().delete(adminSessions).where(eq(adminSessions.userId, id));
    await getDb().delete(adminUsers).where(eq(adminUsers.id, id));
    await writeAuditLog(owner, "user.deleted", "admin_user", id, "Um acesso da equipe foi removido.");
    return Response.json({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}
