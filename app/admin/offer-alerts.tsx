"use client";

import type { Product } from "../product-data";

function offerStatus(value: string, now: number) {
  const difference = new Date(value).getTime() - now;
  if (difference < 0) return { label: "Oferta vencida", urgency: "expired" };
  if (difference <= 86_400_000) return { label: "Termina em menos de 24h", urgency: "urgent" };
  const days = Math.ceil(difference / 86_400_000);
  return { label: `Termina em ${days} dias`, urgency: "soon" };
}

export default function OfferAlerts({ products, referenceTime, onEdit }: { products: Product[]; referenceTime: string; onEdit: (product: Product) => void }) {
  const now = new Date(referenceTime).getTime();
  const alerts = products
    .filter((product) => product.offerEndsAt && Number.isFinite(new Date(product.offerEndsAt).getTime()) && new Date(product.offerEndsAt).getTime() - now <= 7 * 86_400_000)
    .sort((first, second) => Math.abs(new Date(first.offerEndsAt ?? 0).getTime() - now) - Math.abs(new Date(second.offerEndsAt ?? 0).getTime() - now))
    .slice(0, 8);

  return (
    <section className={`offer-alert-panel ${alerts.length ? "has-alerts" : "all-clear"}`} aria-labelledby="offer-alert-title">
      <div className="offer-alert-heading"><div><span>Monitor de ofertas</span><h2 id="offer-alert-title">{alerts.length ? `${alerts.length} prazo${alerts.length === 1 ? " precisa" : "s precisam"} de atenção` : "Ofertas em dia"}</h2></div><p>{alerts.length ? "Revise produtos vencidos ou que terminam nos próximos sete dias." : "Nenhuma oferta vence nos próximos sete dias."}</p></div>
      {alerts.length > 0 && <div className="offer-alert-list">{alerts.map((product) => {
        const status = offerStatus(product.offerEndsAt ?? "", now);
        return <article key={product.id}><img src={product.imageUrl} alt="" /><div><strong>{product.name}</strong><small>{new Date(product.offerEndsAt ?? "").toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</small></div><span className={status.urgency}>{status.label}</span><button type="button" onClick={() => onEdit(product)}>Revisar</button></article>;
      })}</div>}
    </section>
  );
}
