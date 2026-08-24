"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Product } from "../product-data";
import type { ProductMetric } from "../product-analytics";
import { WEEKDAYS, parseWeeklySchedule, serializeWeeklySchedule, type DayHours, type SiteSettings, type StoreSpecialHours, type WeekdayKey, type WeeklySchedule } from "../site-settings";
import { compressImageForUpload } from "../image-compression";
import type { SearchAnalyticsEntry } from "../search-analytics";
import SpecialHoursEditor from "./special-hours-editor";

type Props = {
  initialSettings: SiteSettings;
  products: Product[];
  metrics: ProductMetric[];
  canManageContent: boolean;
  canViewAnalytics: boolean;
  initialSpecialHours: StoreSpecialHours[];
  noResultSearches: SearchAnalyticsEntry[];
};

type SettingsForm = {
  bannerActive: boolean;
  bannerEyebrow: string;
  bannerTitle: string;
  bannerText: string;
  bannerCtaLabel: string;
  bannerCtaHref: string;
  store1Schedule: WeeklySchedule;
  store2Schedule: WeeklySchedule;
};

function formFromSettings(settings: SiteSettings): SettingsForm {
  return {
    bannerActive: settings.bannerActive,
    bannerEyebrow: settings.bannerEyebrow,
    bannerTitle: settings.bannerTitle,
    bannerText: settings.bannerText,
    bannerCtaLabel: settings.bannerCtaLabel,
    bannerCtaHref: settings.bannerCtaHref,
    store1Schedule: parseWeeklySchedule(settings.store1Hours),
    store2Schedule: parseWeeklySchedule(settings.store2Hours),
  };
}

type ScheduleEditorProps = {
  label: string;
  schedule: WeeklySchedule;
  onChange: (day: WeekdayKey, field: keyof DayHours, value: string | boolean) => void;
  onCopyWeekdays: () => void;
  onCopyWeekend: () => void;
};

function ScheduleEditor({ label, schedule, onChange, onCopyWeekdays, onCopyWeekend }: ScheduleEditorProps) {
  return (
    <div className="schedule-editor">
      <div className="schedule-editor-heading">
        <div><span>Horário semanal</span><strong>{label}</strong></div>
        <div><button type="button" onClick={onCopyWeekdays}>Repetir segunda nos dias úteis</button><button type="button" onClick={onCopyWeekend}>Repetir sábado no domingo</button></div>
      </div>
      <div className="schedule-table" role="group" aria-label={`Horários da ${label}`}>
        {WEEKDAYS.map((day) => {
          const hours = schedule[day.key];
          return (
            <div className={`schedule-row ${hours.closed ? "closed" : ""}`} key={day.key}>
              <strong>{day.shortLabel}</strong>
              <label><span>Abre</span><input type="time" value={hours.opens} disabled={hours.closed} onChange={(event) => onChange(day.key, "opens", event.target.value)} /></label>
              <span className="schedule-separator">até</span>
              <label><span>Fecha</span><input type="time" value={hours.closes} disabled={hours.closed} onChange={(event) => onChange(day.key, "closes", event.target.value)} /></label>
              <label className="schedule-closed"><input type="checkbox" checked={hours.closed} onChange={(event) => onChange(day.key, "closed", event.target.checked)} /><span>Fechada</span></label>
            </div>
          );
        })}
      </div>
      <small className="schedule-help">Deixe os dois horários vazios quando ainda precisar confirmar. Para dias sem atendimento, marque “Fechada”.</small>
    </div>
  );
}

export default function SiteManagement({ initialSettings, products, metrics, canManageContent, canViewAnalytics, initialSpecialHours, noResultSearches }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [form, setForm] = useState(() => formFromSettings(initialSettings));
  const [store1Image, setStore1Image] = useState<File | null>(null);
  const [store2Image, setStore2Image] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const analytics = useMemo(() => {
    const byProduct = new Map(metrics.map((metric) => [metric.productId, metric]));
    const rows = products.map((product) => ({
      product,
      views: byProduct.get(product.id)?.views ?? 0,
      cartAdds: byProduct.get(product.id)?.cartAdds ?? 0,
    })).sort((first, second) => (second.views + second.cartAdds) - (first.views + first.cartAdds));
    return {
      rows,
      totalViews: rows.reduce((total, row) => total + row.views, 0),
      totalCartAdds: rows.reduce((total, row) => total + row.cartAdds, 0),
      topViewed: [...rows].sort((first, second) => second.views - first.views)[0],
      topCart: [...rows].sort((first, second) => second.cartAdds - first.cartAdds)[0],
    };
  }, [metrics, products]);

  function update<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateSchedule(store: "store1Schedule" | "store2Schedule", day: WeekdayKey, field: keyof DayHours, value: string | boolean) {
    setForm((current) => ({
      ...current,
      [store]: { ...current[store], [day]: { ...current[store][day], [field]: value } },
    }));
  }

  function copyScheduleDay(store: "store1Schedule" | "store2Schedule", source: WeekdayKey, targets: WeekdayKey[]) {
    setForm((current) => {
      const sourceHours = current[store][source];
      const nextSchedule = { ...current[store] };
      targets.forEach((day) => { nextSchedule[day] = { ...sourceHours }; });
      return { ...current, [store]: nextSchedule };
    });
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
    const payload = new FormData();
    payload.set("bannerActive", String(form.bannerActive));
    payload.set("bannerEyebrow", form.bannerEyebrow);
    payload.set("bannerTitle", form.bannerTitle);
    payload.set("bannerText", form.bannerText);
    payload.set("bannerCtaLabel", form.bannerCtaLabel);
    payload.set("bannerCtaHref", form.bannerCtaHref);
    payload.set("store1Hours", serializeWeeklySchedule(form.store1Schedule));
    payload.set("store2Hours", serializeWeeklySchedule(form.store2Schedule));
    if (store1Image) payload.set("store1Image", await compressImageForUpload(store1Image));
    if (store2Image) payload.set("store2Image", await compressImageForUpload(store2Image));

      const response = await fetch("/api/admin/site-settings", { method: "PUT", body: payload });
      const data = (await response.json()) as { settings?: SiteSettings; error?: string };
      if (!response.ok || !data.settings) throw new Error(data.error || "Não foi possível salvar as configurações.");
      setSettings(data.settings);
      setForm(formFromSettings(data.settings));
      setStore1Image(null);
      setStore2Image(null);
      setMessage("Banner e informações das lojas atualizados com sucesso.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar as configurações.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {canViewAnalytics && <>
      <section className="admin-section-heading" id="estatisticas">
        <div><span>Desempenho</span><h2>Estatísticas do catálogo</h2></div>
        <p>Os números registram visualizações das páginas dos produtos e adições ao carrinho. Nenhum dado pessoal do cliente é armazenado.</p>
      </section>

      <section className="analytics-overview">
        <article><span>Visualizações</span><strong>{analytics.totalViews}</strong><small>Total nas páginas de produtos</small></article>
        <article><span>Adições ao carrinho</span><strong>{analytics.totalCartAdds}</strong><small>Interesse de compra registrado</small></article>
        <article><span>Mais visualizado</span><strong>{analytics.topViewed?.views ? analytics.topViewed.product.name : "Sem dados ainda"}</strong><small>{analytics.topViewed?.views ?? 0} visualizações</small></article>
        <article><span>Mais adicionado</span><strong>{analytics.topCart?.cartAdds ? analytics.topCart.product.name : "Sem dados ainda"}</strong><small>{analytics.topCart?.cartAdds ?? 0} adições</small></article>
      </section>

      <section className="admin-analytics-table">
        <div className="admin-list-heading"><div><span>Produtos</span><h2>Desempenho individual</h2></div></div>
        <div className="analytics-table-head"><span>Produto</span><span>Visualizações</span><span>Carrinho</span></div>
        {analytics.rows.map((row) => (
          <div className="analytics-table-row" key={row.product.id}>
            <span><img src={row.product.imageUrl} alt="" /><strong>{row.product.name}</strong></span>
            <b>{row.views}</b>
            <b>{row.cartAdds}</b>
          </div>
        ))}
      </section>

      <section className="search-analytics-panel">
        <div className="admin-list-heading"><div><span>Oportunidades do catálogo</span><h2>Pesquisas sem resultado</h2></div><small>Sem identificação do cliente</small></div>
        <p>Mostra o que as pessoas procuraram e não encontraram. O site registra somente o termo pesquisado, a quantidade e a última data.</p>
        {noResultSearches.length ? <div className="search-analytics-list">{noResultSearches.map((entry) => <article key={entry.id}><div><strong>{entry.query}</strong><small>Última busca em {new Date(entry.lastSearchedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</small></div><span>{entry.searchCount} {entry.searchCount === 1 ? "busca" : "buscas"}</span></article>)}</div> : <div className="search-analytics-empty">Nenhuma pesquisa sem resultado registrada até agora.</div>}
      </section>
      </>}

      {canManageContent && <>
      <section className="admin-section-heading" id="conteudo-site">
        <div><span>Conteúdo do site</span><h2>Banner e lojas</h2></div>
        <p>Altere a campanha principal, informe os horários e envie as fotos reais de cada unidade.</p>
      </section>

      <form className="site-settings-form" onSubmit={saveSettings}>
        <div className="settings-panel">
          <div className="admin-form-heading"><div><span>Campanha</span><h2>Banner de ofertas</h2></div></div>
          <label className="admin-check"><input type="checkbox" checked={form.bannerActive} onChange={(event) => update("bannerActive", event.target.checked)} /><span>Exibir o banner no site</span></label>
          <label><span>Chamada curta</span><input value={form.bannerEyebrow} onChange={(event) => update("bannerEyebrow", event.target.value)} required /></label>
          <label><span>Título principal</span><input value={form.bannerTitle} onChange={(event) => update("bannerTitle", event.target.value)} required /></label>
          <label><span>Texto do banner</span><textarea rows={3} value={form.bannerText} onChange={(event) => update("bannerText", event.target.value)} required /></label>
          <div className="admin-form-row">
            <label><span>Texto do botão</span><input value={form.bannerCtaLabel} onChange={(event) => update("bannerCtaLabel", event.target.value)} required /></label>
            <label><span>Destino do botão</span><input value={form.bannerCtaHref} onChange={(event) => update("bannerCtaHref", event.target.value)} placeholder="#ofertas" required /></label>
          </div>
        </div>

        <div className="settings-panel stores-settings-panel">
          <div className="admin-form-heading"><div><span>Unidades</span><h2>Fotos e horários</h2></div></div>
          <div className="store-setting advanced-store-setting">
            <div className="store-photo-setting">{settings.store1ImageUrl ? <img src={settings.store1ImageUrl} alt="Foto atual da Loja 1" /> : <span>Foto da Loja 1</span>}</div>
            <div className="store-setting-content">
              <ScheduleEditor label="Loja 1 • Solo Sagrado" schedule={form.store1Schedule} onChange={(day, field, value) => updateSchedule("store1Schedule", day, field, value)} onCopyWeekdays={() => copyScheduleDay("store1Schedule", "monday", ["tuesday", "wednesday", "thursday", "friday"])} onCopyWeekend={() => copyScheduleDay("store1Schedule", "saturday", ["sunday"])} />
              <label className="admin-file-field"><span>{settings.store1ImageUrl ? "Trocar foto da Loja 1" : "Enviar foto da Loja 1"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setStore1Image(event.target.files?.[0] ?? null)} /><small>{store1Image?.name || "JPG, PNG ou WEBP, com até 5 MB."}</small></label>
            </div>
          </div>
          <div className="store-setting advanced-store-setting">
            <div className="store-photo-setting">{settings.store2ImageUrl ? <img src={settings.store2ImageUrl} alt="Foto atual da Loja 2" /> : <span>Foto da Loja 2</span>}</div>
            <div className="store-setting-content">
              <ScheduleEditor label="Loja 2 • Residencial Nature 1" schedule={form.store2Schedule} onChange={(day, field, value) => updateSchedule("store2Schedule", day, field, value)} onCopyWeekdays={() => copyScheduleDay("store2Schedule", "monday", ["tuesday", "wednesday", "thursday", "friday"])} onCopyWeekend={() => copyScheduleDay("store2Schedule", "saturday", ["sunday"])} />
              <label className="admin-file-field"><span>{settings.store2ImageUrl ? "Trocar foto da Loja 2" : "Enviar foto da Loja 2"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setStore2Image(event.target.files?.[0] ?? null)} /><small>{store2Image?.name || "JPG, PNG ou WEBP, com até 5 MB."}</small></label>
            </div>
          </div>
        </div>

        {error && <p className="admin-message error" role="alert">{error}</p>}
        {message && <p className="admin-message success" role="status">{message}</p>}
        <button className="admin-submit settings-submit" type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar banner e lojas"}</button>
      </form>
      <SpecialHoursEditor initialHours={initialSpecialHours} />
      </>}
    </>
  );
}
