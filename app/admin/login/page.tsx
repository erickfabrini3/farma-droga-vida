import Link from "next/link";
import { redirect } from "next/navigation";
import { adminUsersExist, getAdminSession } from "../../admin-session";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await adminUsersExist())) redirect("/admin/setup");
  if (await getAdminSession()) redirect("/admin");

  return (
    <main className="admin-auth-shell">
      <Link href="/" aria-label="Voltar ao site"><img className="admin-logo" src="/brand/droga-vida-popular-logo.png" alt="Droga Vida Popular" /></Link>
      <section className="admin-auth-card">
        <span className="admin-kicker">Área protegida</span>
        <h1>Entrar no painel</h1>
        <p>Use seu usuário e senha para gerenciar os produtos da farmácia.</p>
        <LoginForm />
        <Link className="admin-back-link" href="/">← Voltar ao site</Link>
      </section>
    </main>
  );
}
