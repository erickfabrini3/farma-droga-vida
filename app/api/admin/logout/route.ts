import { destroyAdminSession, isSameOrigin } from "@/app/admin-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Solicitação inválida.", { status: 403 });
  await destroyAdminSession();
  return Response.redirect(new URL("/admin/login", request.url), 303);
}
