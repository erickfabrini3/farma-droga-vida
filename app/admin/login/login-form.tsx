"use client";

import { useState, type FormEvent } from "react";

export default function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [requiresCode, setRequiresCode] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.get("username"), password: data.get("password"), totpCode: data.get("totpCode") }),
      });
      const payload = (await response.json()) as { error?: string; requiresCode?: boolean };
      if (payload.requiresCode) setRequiresCode(true);
      if (!response.ok) throw new Error(payload.error || "Não foi possível entrar.");
      window.location.assign("/admin");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-auth-form" onSubmit={submit}>
      <label><span>Usuário</span><input name="username" autoComplete="username" autoCapitalize="none" required /></label>
      <label><span>Senha</span><div className="password-field"><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Ocultar" : "Mostrar"}</button></div></label>
      {requiresCode && <label><span>Código do autenticador</span><input name="totpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required /><small>Abra seu aplicativo autenticador e informe o código de 6 dígitos.</small></label>}
      {error && <p className="admin-message error" role="alert">{error}</p>}
      <button className="admin-submit" type="submit" disabled={busy}>{busy ? "Entrando..." : "Entrar com segurança"}</button>
      <small>Após 5 tentativas incorretas, o acesso é bloqueado temporariamente.</small>
    </form>
  );
}
