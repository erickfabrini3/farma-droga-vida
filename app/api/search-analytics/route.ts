import { isSameOrigin } from "@/app/admin-session";
import { recordNoResultSearch } from "@/app/search-analytics";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Formato inválido." }, { status: 415 });
  }
  try {
    const payload = (await request.json()) as { query?: unknown };
    if (typeof payload.query !== "string" || payload.query.length > 120) {
      return Response.json({ error: "Pesquisa inválida." }, { status: 400 });
    }
    await recordNoResultSearch(payload.query);
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Não foi possível registrar a pesquisa." }, { status: 400 });
  }
}
