"use client";

import { useState, type FormEvent } from "react";

export default function SetupForm({ defaultName }: { defaultName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirmation")) {
      setError("As senhas não são iguais.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.get("username"), displayName: data.get("displayName"), password: data.get("password") }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível criar a conta.");
      window.location.assign("/admin");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível criar a conta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-auth-form" onSubmit={submit}>
      <label><span>Seu nome</span><input name="displayName" defaultValue={defaultName} autoComplete="name" required /></label>
      <label><span>Nome de usuário</span><input name="username" placeholder="Ex.: erick" autoComplete="username" autoCapitalize="none" required /><small>Letras, números, ponto, hífen ou sublinhado.</small></label>
      <div className="admin-form-row">
        <label><span>Senha</span><input name="password" type="password" autoComplete="new-password" required /></label>
        <label><span>Confirmar senha</span><input name="confirmation" type="password" autoComplete="new-password" required /></label>
      </div>
      <div className="security-tip"><strong>Senha segura</strong><span>Use pelo menos 10 caracteres, com maiúscula, minúscula e número.</span></div>
      {error && <p className="admin-message error" role="alert">{error}</p>}
      <button className="admin-submit" type="submit" disabled={busy}>{busy ? "Criando conta..." : "Criar minha conta"}</button>
    </form>
  );
}
