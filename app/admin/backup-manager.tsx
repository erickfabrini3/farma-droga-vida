"use client";

import { useState, type FormEvent } from "react";

type ApiError = { error?: string };

async function errorMessage(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as ApiError;
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export default function BackupManager() {
  const [exportCurrentPassword, setExportCurrentPassword] = useState("");
  const [exportPassword, setExportPassword] = useState("");
  const [exportConfirmation, setExportConfirmation] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreCurrentPassword, setRestoreCurrentPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function downloadBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (exportPassword !== exportConfirmation) {
      setError("A confirmação da senha do backup não confere.");
      return;
    }
    setExportBusy(true);
    try {
      const response = await fetch("/api/admin/backup/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: exportCurrentPassword, backupPassword: exportPassword }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Não foi possível criar o backup."));
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `droga-vida-popular-${new Date().toISOString().slice(0, 10)}.dvpbackup`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setExportCurrentPassword("");
      setExportPassword("");
      setExportConfirmation("");
      setMessage("Backup criptografado baixado. Guarde o arquivo e a senha em locais separados.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível criar o backup.");
    } finally {
      setExportBusy(false);
    }
  }

  async function restoreBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!restoreFile) {
      setError("Escolha o arquivo de backup que deseja restaurar.");
      return;
    }
    if (restoreConfirmation !== "RESTAURAR") {
      setError("Digite RESTAURAR no campo de confirmação.");
      return;
    }
    if (!window.confirm("Restaurar este backup substituirá produtos, categorias, configurações, estatísticas, histórico e acessos da equipe. Deseja continuar?")) return;
    setRestoreBusy(true);
    try {
      const payload = new FormData();
      payload.set("file", restoreFile);
      payload.set("currentPassword", restoreCurrentPassword);
      payload.set("backupPassword", restorePassword);
      const response = await fetch("/api/admin/backup/restore", { method: "POST", body: payload });
      if (!response.ok) throw new Error(await errorMessage(response, "Não foi possível restaurar o backup."));
      setMessage("Backup restaurado com sucesso. Você será direcionado para entrar novamente.");
      window.setTimeout(() => window.location.assign("/admin/login"), 1_200);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível restaurar o backup.");
      setRestoreBusy(false);
    }
  }

  return (
    <section className="backup-manager" id="backup">
      <div className="admin-section-heading">
        <div><span>Proteção dos dados</span><h2>Backup completo</h2></div>
        <p>Salve ou restaure produtos, categorias, fotos enviadas, banner, lojas, estatísticas, histórico e acessos da equipe.</p>
      </div>

      <div className="backup-security-note">
        <span aria-hidden="true">◆</span>
        <div><strong>Arquivo protegido por criptografia</strong><p>Escolha uma senha exclusiva com pelo menos 12 caracteres, letras e números. Se essa senha for perdida, o arquivo não poderá ser recuperado.</p></div>
      </div>

      {error && <p className="admin-message error" role="alert">{error}</p>}
      {message && <p className="admin-message success" role="status">{message}</p>}

      <div className="backup-grid">
        <form className="backup-card" onSubmit={downloadBackup}>
          <div className="backup-card-heading"><span>01</span><div><small>Criar cópia</small><h3>Baixar backup</h3></div></div>
          <p>Gera um arquivo <strong>.dvpbackup</strong> com todos os dados atuais. Sessões conectadas não são copiadas.</p>
          <label><span>Senha atual da sua conta</span><input type="password" autoComplete="current-password" maxLength={128} value={exportCurrentPassword} onChange={(event) => setExportCurrentPassword(event.target.value)} required /></label>
          <label><span>Senha para proteger o backup</span><input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={exportPassword} onChange={(event) => setExportPassword(event.target.value)} placeholder="Mínimo de 12 caracteres" required /></label>
          <label><span>Confirmar senha do backup</span><input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={exportConfirmation} onChange={(event) => setExportConfirmation(event.target.value)} required /></label>
          <button type="submit" disabled={exportBusy || restoreBusy}>{exportBusy ? "Preparando arquivo..." : "Baixar backup completo"}</button>
        </form>

        <form className="backup-card restore" onSubmit={restoreBackup}>
          <div className="backup-card-heading"><span>02</span><div><small>Recuperar o site</small><h3>Restaurar backup</h3></div></div>
          <p>Substitui o conteúdo atual pela cópia escolhida. Sua conta proprietária e sua senha atual serão preservadas.</p>
          <label className="backup-file"><span>Arquivo .dvpbackup</span><input type="file" accept=".dvpbackup,application/octet-stream" onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)} required /><small>{restoreFile?.name || "Nenhum arquivo selecionado"}</small></label>
          <label><span>Senha atual da sua conta</span><input type="password" autoComplete="current-password" maxLength={128} value={restoreCurrentPassword} onChange={(event) => setRestoreCurrentPassword(event.target.value)} required /></label>
          <label><span>Senha usada no backup</span><input type="password" autoComplete="off" minLength={12} maxLength={128} value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} required /></label>
          <label><span>Digite RESTAURAR para confirmar</span><input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value.toUpperCase())} placeholder="RESTAURAR" autoComplete="off" required /></label>
          <button className="restore-button" type="submit" disabled={restoreBusy || exportBusy || restoreConfirmation !== "RESTAURAR"}>{restoreBusy ? "Restaurando..." : "Restaurar e substituir dados"}</button>
        </form>
      </div>
    </section>
  );
}
