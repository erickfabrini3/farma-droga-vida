import Link from "next/link";
import { redirect } from "next/navigation";
import { requireChatGPTUser, chatGPTSignOutPath } from "../../chatgpt-auth";
import { isAdminEmail } from "../../admin-auth";
import { adminUsersExist } from "../../admin-session";
import SetupForm from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await adminUsersExist()) redirect("/admin/login");
  const chatGPTUser = await requireChatGPTUser("/admin/setup");

  if (!isAdminEmail(chatGPTUser.email)) {
    return (
      <main className="admin-auth-shell">
        <img className="admin-logo" src="/brand/droga-vida-popular-logo.png" alt="Droga Vida Popular" />
        <section className="admin-auth-card">
          <span className="admin-kicker">Configuração protegida</span>
          <h1>Conta não autorizada</h1>
          <p>Somente o proprietário do site pode criar o primeiro acesso.</p>
          <a className="admin-secondary-action" href={chatGPTSignOutPath("/admin/setup")}>Entrar com outra conta</a>
          <Link className="admin-back-link" href="/">← Voltar ao site</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-auth-shell">
      <img className="admin-logo" src="/brand/droga-vida-popular-logo.png" alt="Droga Vida Popular" />
      <section className="admin-auth-card setup-card">
        <span className="admin-kicker">Primeiro acesso</span>
        <h1>Crie sua conta proprietária</h1>
        <p>Defina seu usuário e sua senha diretamente aqui. A senha será protegida e não ficará visível no painel.</p>
        <SetupForm defaultName={chatGPTUser.displayName} />
      </section>
    </main>
  );
}
