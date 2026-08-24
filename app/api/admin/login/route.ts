import { authenticateAdmin, isSameOrigin, LoginError } from "@/app/admin-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  try {
    const payload = (await request.json()) as { username?: string; password?: string; totpCode?: string };
    await authenticateAdmin(String(payload.username ?? ""), String(payload.password ?? ""), String(payload.totpCode ?? ""));
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof LoginError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Não foi possível entrar.";
    return Response.json({ error: message, requiresCode: status === 428 }, { status });
  }
}
