import Link from "next/link";
import { getDb } from "@/db";
import { adminUsers } from "@/db/schema";
import { requireOwnerSession } from "../../admin-session";
import AccessClient, { type AccessUser } from "./access-client";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const owner = await requireOwnerSession();
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
  }).from(adminUsers).orderBy(adminUsers.id) as AccessUser[];

  return (
    <main className="admin-shell access-shell">
      <header className="admin-header">
        <Link href="/" aria-label="Voltar ao site"><img className="admin-logo" src="/brand/droga-vida-popular-logo.png" alt="Droga Vida Popular" /></Link>
        <div className="admin-account"><span>Proprietário: {owner.displayName}</span><Link href="/admin">Produtos</Link><form action="/api/admin/logout" method="post"><button type="submit">Sair</button></form></div>
      </header>
      <section className="admin-intro">
        <div><span className="admin-kicker">Segurança</span><h1>Gerenciar acessos</h1></div>
        <p>Crie um usuário individual para cada pessoa. Você pode trocar a senha, bloquear ou remover o acesso quando quiser.</p>
      </section>
      <AccessClient initialUsers={users} ownerId={owner.id} initialTwoFactorEnabled={users.find((user) => user.id === owner.id)?.totpEnabled ?? false} />
    </main>
  );
}
