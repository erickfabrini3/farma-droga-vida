"use client";

import { useState, type FormEvent } from "react";
import { formatDayHours, formatSpecialHoursDate, saoPauloDateKey, type StoreSpecialHours } from "../site-settings";

type EditorForm = { date: string; closed: boolean; opens: string; closes: string; note: string };
const emptyForm = (): EditorForm => ({ date: "", closed: false, opens: "", closes: "", note: "" });

export default function SpecialHoursEditor({ initialHours }: { initialHours: StoreSpecialHours[] }) {
  const [hours, setHours] = useState(initialHours);
  const [forms, setForms] = useState<Record<1 | 2, EditorForm>>({ 1: emptyForm(), 2: emptyForm() });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update(storeNumber: 1 | 2, field: keyof EditorForm, value: string | boolean) {
    setForms((current) => ({ ...current, [storeNumber]: { ...current[storeNumber], [field]: value } }));
  }

  async function save(event: FormEvent<HTMLFormElement>, storeNumber: 1 | 2) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/special-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeNumber, ...forms[storeNumber] }),
      });
      const data = (await response.json()) as { specialHours?: StoreSpecialHours[]; error?: string };
      if (!response.ok || !data.specialHours) throw new Error(data.error || "Não foi possível salvar o horário especial.");
      setHours(data.specialHours);
      setForms((current) => ({ ...current, [storeNumber]: emptyForm() }));
      setMessage(`Horário especial da Loja ${storeNumber} salvo.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar o horário especial.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: StoreSpecialHours) {
    if (!window.confirm(`Remover o horário especial de ${formatSpecialHoursDate(entry.date)}?`)) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/special-hours", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id }) });
      const data = (await response.json()) as { specialHours?: StoreSpecialHours[]; error?: string };
      if (!response.ok || !data.specialHours) throw new Error(data.error || "Não foi possível remover o horário especial.");
      setHours(data.specialHours);
      setMessage("Horário especial removido.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível remover o horário especial.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="special-hours-editor">
      <div className="special-hours-heading"><div><span>Datas comemorativas</span><strong>Horários especiais e feriados</strong></div><p>Cadastre exceções; elas substituem automaticamente o horário semanal na data escolhida.</p></div>
      <div className="special-hours-grid">{([1, 2] as const).map((storeNumber) => {
        const storeHours = hours.filter((entry) => entry.storeNumber === storeNumber && entry.date >= saoPauloDateKey());
        const form = forms[storeNumber];
        return <section key={storeNumber}><div className="special-store-title"><span>0{storeNumber}</span><div><strong>Loja {storeNumber}</strong><small>{storeNumber === 1 ? "Solo Sagrado" : "Residencial Nature 1"}</small></div></div>
          <form onSubmit={(event) => void save(event, storeNumber)}>
            <label><span>Data</span><input type="date" min={saoPauloDateKey()} value={form.date} onChange={(event) => update(storeNumber, "date", event.target.value)} required /></label>
            <label className="special-closed"><input type="checkbox" checked={form.closed} onChange={(event) => update(storeNumber, "closed", event.target.checked)} /><span>Loja fechada o dia todo</span></label>
            {!form.closed && <div className="special-time-row"><label><span>Abre</span><input type="time" value={form.opens} onChange={(event) => update(storeNumber, "opens", event.target.value)} required /></label><label><span>Fecha</span><input type="time" value={form.closes} onChange={(event) => update(storeNumber, "closes", event.target.value)} required /></label></div>}
            <label><span>Observação opcional</span><input maxLength={80} value={form.note} onChange={(event) => update(storeNumber, "note", event.target.value)} placeholder="Ex.: Feriado municipal" /></label>
            <button type="submit" disabled={busy}>{busy ? "Salvando..." : "Adicionar ou atualizar data"}</button>
          </form>
          <div className="special-hours-list">{storeHours.length ? storeHours.map((entry) => <article key={entry.id}><div><strong>{formatSpecialHoursDate(entry.date)}</strong><small>{entry.note || (entry.closed ? "Fechada" : "Horário especial")}</small></div><span>{formatDayHours(entry)}</span><button type="button" disabled={busy} onClick={() => void remove(entry)} aria-label={`Remover horário de ${entry.date}`}>×</button></article>) : <p>Nenhuma data especial cadastrada.</p>}</div>
        </section>;
      })}</div>
      {error && <p className="admin-message error" role="alert">{error}</p>}
      {message && <p className="admin-message success" role="status">{message}</p>}
    </div>
  );
}
