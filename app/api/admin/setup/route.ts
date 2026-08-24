import { getAdminUser } from "@/app/admin-auth";
import { adminUsersExist, createAdminSession, hashPassword, isSameOrigin, LoginError, validateUsername } from "@/app/admin-session";
import { getDb } from "@/db";
import { adminUsers } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  if (!(await getAdminUser())) return Response.json({ error: "Apenas o proprietário pode criar a conta principal." }, { status: 403 });

  try {
    if (await adminUsersExist()) return Response.json({ error: "A conta principal já foi criada." }, { status: 409 });
    const payload = (await request.json()) as { username?: string; displayName?: string; password?: string };
    const username = validateUsername(String(payload.username ?? ""));
    const displayName = String(payload.displayName ?? "").trim();
    const passwordHash = await hashPassword(String(payload.password ?? ""));
    if (displayName.length < 2 || displayName.length > 60) throw new LoginError("Informe um nome de 2 a 60 caracteres.", 400);

    const [owner] = await getDb().insert(adminUsers).values({ username, displayName, passwordHash, role: "owner", ownerGuard: 1, active: true }).returning();
    await createAdminSession(owner.id);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const status = error instanceof LoginError ? error.status : 400;
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "Esse nome de usuário já está em uso." : error instanceof Error ? error.message : "Não foi possível criar a conta.";
    return Response.json({ error: message }, { status });
  }
}
