"use client";

import { useState, type FormEvent } from "react";

export type AccessUser = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  canManageProducts: boolean;
  canManageContent: boolean;
  canViewAnalytics: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

type AccessForm = { id: number | null; username: string; displayName: string; password: string; confirmation: string; active: boolean; canManageProducts: boolean; canManageContent: boolean; canViewAnalytics: boolean };
const emptyForm: AccessForm = { id: null, username: "", displayName: "", password: "", confirmation: "", active: true, canManageProducts: true, canManageContent: false, canViewAnalytics: false };

export default function AccessClient({ initialUsers, ownerId, initialTwoFactorEnabled }: { initialUsers: AccessUser[]; ownerId: number; initialTwoFactorEnabled: boolean }) {
  const [users, setUsers] = useState(initialUsers);
  const [form, setForm] = useState<AccessForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(initialTwoFactorEnabled);
  const [twoFactorSecret, setTwoFactorSecret] = useState("");
  const [provisioningUri, setProvisioningUri] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState("");
  const [twoFactorError, setTwoFactorError] = useState("");

  function update<K extends keyof AccessForm>(key: K, value: AccessForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function refresh() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const data = (await response.json()) as { users?: AccessUser[]; error?: string };
    if (!response.ok || !data.users) throw new Error(data.error || "Não foi possível atualizar os acessos.");
    setUsers(data.users);
  }

  function startEdit(user: AccessUser) {
    setForm({ id: user.id, username: user.username, displayName: user.displayName, password: "", confirmation: "", active: user.active, canManageProducts: user.canManageProducts, canManageContent: user.canManageContent, canViewAnalytics: user.canViewAnalytics });
    setError("");
    setMessage("");
    window.scrollTo({ top: 250, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (form.password !== form.confirmation) return setError("As senhas não são iguais.");
    if (form.id === null && !form.password) return setError("Defina uma senha para o novo acesso.");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: form.id === null ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o acesso.");
      await refresh();
      setForm(emptyForm);
      setMessage(form.id === null ? "Novo acesso criado com sucesso." : "Acesso atualizado com sucesso.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(user: AccessUser) {
    if (!window.confirm(`Remover definitivamente o acesso de ${user.displayName}?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível remover o acesso.");
      await refresh();
      if (form.id === user.id) setForm(emptyForm);
      setMessage("Acesso removido.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível remover o acesso.");
    } finally {
      setBusy(false);
    }
  }

  async function changeOwnerPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    setPasswordError("");
    setPasswordMessage("");
    if (data.get("newPassword") !== data.get("confirmation")) return setPasswordError("As novas senhas não são iguais.");
    setPasswordBusy(true);
    try {
      const response = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar sua senha.");
      formElement.reset();
      setPasswordMessage("Sua senha foi alterada e as sessões antigas foram encerradas.");
    } catch (requestError) {
      setPasswordError(requestError instanceof Error ? requestError.message : "Não foi possível alterar sua senha.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function twoFactorRequest(action: "begin" | "enable" | "disable", extra: Record<string, string> = {}) {
    setTwoFactorBusy(true);
    setTwoFactorError("");
    setTwoFactorMessage("");
    try {
      const response = await fetch("/api/admin/two-factor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const payload = (await response.json()) as { error?: string; secret?: string; provisioningUri?: string; enabled?: boolean; signedOut?: boolean };
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar a proteção da conta.");
      if (action === "begin") {
        setTwoFactorSecret(payload.secret || "");
        setProvisioningUri(payload.provisioningUri || "");
        setTwoFactorMessage("Chave criada. Adicione-a ao aplicativo e confirme um código.");
      } else if (action === "enable") {
        setTwoFactorEnabled(true);
        setTwoFactorSecret("");
        setProvisioningUri("");
        setTwoFactorCode("");
        setTwoFactorMessage("Verificação em duas etapas ativada.");
      } else {
        setTwoFactorEnabled(false);
        if (payload.signedOut) window.location.assign("/admin/login");
      }
    } catch (requestError) {
      setTwoFactorError(requestError instanceof Error ? requestError.message : "Não foi possível alterar a proteção da conta.");
    } finally {
      setTwoFactorBusy(false);
    }
  }

  return (
    <>
      <section className="owner-password-panel">
        <div><span className="admin-kicker">Sua conta</span><h2>Alterar minha senha</h2><p>Ao trocar sua senha, qualquer outra sessão da sua conta será encerrada.</p></div>
        <form onSubmit={changeOwnerPassword}>
          <label><span>Senha atual</span><input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label><span>Nova senha</span><input name="newPassword" type="password" autoComplete="new-password" required /></label>
          <label><span>Confirmar nova senha</span><input name="confirmation" type="password" autoComplete="new-password" required /></label>
          {passwordError && <p className="admin-message error" role="alert">{passwordError}</p>}
          {passwordMessage && <p className="admin-message success" role="status">{passwordMessage}</p>}
          <button className="admin-submit" type="submit" disabled={passwordBusy}>{passwordBusy ? "Alterando..." : "Alterar senha"}</button>
        </form>
      </section>

      <section className="two-factor-panel">
        <div>
          <span className="admin-kicker">Proteção adicional</span>
          <h2>Verificação em duas etapas</h2>
          <p>Além da senha, sua conta proprietária pode exigir um código temporário do Google Authenticator, Microsoft Authenticator ou aplicativo compatível.</p>
        </div>
        <div className="two-factor-actions">
          {twoFactorEnabled ? (
            <>
              <div className="security-status enabled"><strong>Proteção ativada</strong><span>Um código será solicitado ao entrar.</span></div>
              <label><span>Senha atual para desativar</span><input type="password" value={twoFactorPassword} onChange={(event) => setTwoFactorPassword(event.target.value)} autoComplete="current-password" /></label>
              <button className="admin-submit secondary-danger" type="button" disabled={twoFactorBusy || !twoFactorPassword} onClick={() => void twoFactorRequest("disable", { password: twoFactorPassword })}>Desativar verificação</button>
            </>
          ) : twoFactorSecret ? (
            <>
              <div className="two-factor-key"><span>Chave para cadastrar no aplicativo</span><strong>{twoFactorSecret}</strong><button type="button" onClick={() => navigator.clipboard.writeText(twoFactorSecret)}>Copiar chave</button>{provisioningUri && <a href={provisioningUri}>Abrir no autenticador</a>}</div>
              <label><span>Código de 6 dígitos</span><input inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
              <button className="admin-submit" type="button" disabled={twoFactorBusy || twoFactorCode.length !== 6} onClick={() => void twoFactorRequest("enable", { code: twoFactorCode })}>Confirmar e ativar</button>
            </>
          ) : (
            <button className="admin-submit" type="button" disabled={twoFactorBusy} onClick={() => void twoFactorRequest("begin")}>Configurar aplicativo autenticador</button>
          )}
          {twoFactorError && <p className="admin-message error" role="alert">{twoFactorError}</p>}
          {twoFactorMessage && <p className="admin-message success" role="status">{twoFactorMessage}</p>}
        </div>
      </section>

      <section className="access-grid">
      <form className="admin-form access-form" onSubmit={submit}>
        <div className="admin-form-heading"><div><span>{form.id === null ? "Nova pessoa" : "Editando acesso"}</span><h2>{form.id === null ? "Criar login" : form.displayName}</h2></div>{form.id !== null && <button type="button" onClick={() => setForm(emptyForm)}>Cancelar</button>}</div>
        <label><span>Nome da pessoa</span><input value={form.displayName} onChange={(event) => update("displayName", event.target.value)} required /></label>
        <label><span>Nome de usuário</span><input value={form.username} onChange={(event) => update("username", event.target.value)} autoCapitalize="none" placeholder="Ex.: atendente.maria" required /><small>Letras, números, ponto, hífen ou sublinhado.</small></label>
        <div className="admin-form-row"><label><span>{form.id === null ? "Senha" : "Nova senha (opcional)"}</span><input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} autoComplete="new-password" /></label><label><span>Confirmar senha</span><input type="password" value={form.confirmation} onChange={(event) => update("confirmation", event.target.value)} autoComplete="new-password" /></label></div>
        <fieldset className="permission-picker">
          <legend>O que esta pessoa poderá acessar</legend>
          <label><input type="checkbox" checked={form.canManageProducts} onChange={(event) => update("canManageProducts", event.target.checked)} /><span><strong>Produtos</strong><small>Cadastrar, editar, importar e remover produtos.</small></span></label>
          <label><input type="checkbox" checked={form.canManageContent} onChange={(event) => update("canManageContent", event.target.checked)} /><span><strong>Banner e lojas</strong><small>Alterar campanha, fotos e horários.</small></span></label>
          <label><input type="checkbox" checked={form.canViewAnalytics} onChange={(event) => update("canViewAnalytics", event.target.checked)} /><span><strong>Estatísticas</strong><small>Visualizar interesse e desempenho do catálogo.</small></span></label>
        </fieldset>
        {form.id !== null && <label className="admin-check"><input type="checkbox" checked={form.active} onChange={(event) => update("active", event.target.checked)} /><span>Permitir que esta pessoa acesse o painel</span></label>}
        {error && <p className="admin-message error" role="alert">{error}</p>}
        {message && <p className="admin-message success" role="status">{message}</p>}
        <button className="admin-submit" type="submit" disabled={busy}>{busy ? "Salvando..." : form.id === null ? "Criar acesso" : "Salvar alterações"}</button>
      </form>

      <div className="admin-products access-list-panel">
        <div className="admin-list-heading"><div><span>Contas cadastradas</span><h2>{users.length} acessos</h2></div></div>
        <div className="access-user-list">
          {users.map((user) => (
            <article className={`access-user-card ${user.active ? "" : "inactive"}`} key={user.id}>
              <div className="access-avatar" aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</div>
              <div className="access-user-copy"><span>{user.role === "owner" ? `Proprietário${user.totpEnabled ? " • 2 etapas ativa" : ""}` : user.active ? "Equipe • ativo" : "Equipe • bloqueado"}</span><strong>{user.displayName}</strong><small>@{user.username}</small>{user.role !== "owner" && <small>Permissões: {[user.canManageProducts && "produtos", user.canManageContent && "conteúdo", user.canViewAnalytics && "estatísticas"].filter(Boolean).join(", ") || "nenhuma"}</small>}<small>{user.lastLoginAt ? `Último acesso: ${new Date(user.lastLoginAt).toLocaleDateString("pt-BR")}` : "Ainda não acessou"}</small></div>
              {user.id !== ownerId && <div className="admin-product-actions"><button type="button" onClick={() => startEdit(user)} disabled={busy}>Editar</button><button className="danger" type="button" onClick={() => remove(user)} disabled={busy}>Remover</button></div>}
            </article>
          ))}
        </div>
      </div>
      </section>
    </>
  );
}
