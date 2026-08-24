"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useState } from "react";
import { type Product } from "@/app/product-data";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

async function track(productId: number, eventType: "view" | "cart_add") {
  await fetch("/api/product-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, eventType }),
    keepalive: true,
  }).catch(() => undefined);
}

export default function ProductDetailClient({ product }: { product: Product }) {
  const [added, setAdded] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(() => product.variants[0]?.id ?? null);
  const [favorite, setFavorite] = useState(false);
  const [shared, setShared] = useState(false);
  const selectedVariant = product.variants.find((variant) => variant.id === selectedVariantId) ?? null;

  useEffect(() => {
    void track(product.id, "view");
    let isFavorite = false;
    try {
      const saved = JSON.parse(window.localStorage.getItem("droga-vida-favorites") || "[]") as number[];
      isFavorite = saved.includes(product.id);
    } catch { window.localStorage.removeItem("droga-vida-favorites"); }
    const timer = window.setTimeout(() => setFavorite(isFavorite), 0);
    return () => window.clearTimeout(timer);
  }, [product.id]);

  function toggleFavorite() {
    let values: number[] = [];
    try { values = JSON.parse(window.localStorage.getItem("droga-vida-favorites") || "[]") as number[]; } catch { /* começa uma lista nova */ }
    const next = values.includes(product.id) ? values.filter((id) => id !== product.id) : [...values, product.id];
    window.localStorage.setItem("droga-vida-favorites", JSON.stringify(next));
    setFavorite(next.includes(product.id));
  }

  async function shareProduct() {
    try {
      if (navigator.share) await navigator.share({ title: product.name, text: `${product.name} na Droga Vida Popular`, url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch { /* compartilhamento cancelado */ }
  }

  function addToCart() {
    try {
      const saved = window.localStorage.getItem("droga-vida-cart");
      const quantities = saved ? JSON.parse(saved) as Record<string, number> : {};
      const key = `${product.id}:${selectedVariant?.id ?? "base"}`;
      quantities[key] = Math.max(0, quantities[key] ?? 0) + 1;
      window.localStorage.setItem("droga-vida-cart", JSON.stringify(quantities));
    } catch {
      window.localStorage.removeItem("droga-vida-cart");
    }
    void track(product.id, "cart_add");
    setAdded(true);
  }

  const variantDescription = selectedVariant ? `, tamanho ${selectedVariant.size}, pacote com ${selectedVariant.packageQuantity} fraldas` : "";
  const whatsappText = encodeURIComponent(`Olá, vim pelo site da Droga Vida Popular e gostaria de consultar o produto ${product.name} (${product.detail}${variantDescription}).`);

  return (
    <section className="product-detail">
      <div className={`product-detail-visual ${product.tone}`}>
        {product.badge && <span>{product.badge}</span>}
        <img src={product.imageUrl} alt={`${product.name} — ${product.detail}`} />
      </div>
      <div className="product-detail-copy">
        <p className="category">{product.category} • {product.subcategory}</p>
        <h1>{product.name}</h1>
        <p className="product-presentation">{product.detail}</p>
        <div className="detail-actions-mini"><button type="button" onClick={toggleFavorite}>{favorite ? "♥ Salvo nos favoritos" : "♡ Salvar nos favoritos"}</button><button type="button" onClick={() => void shareProduct()}>{shared ? "Link copiado ✓" : "Compartilhar ↗"}</button></div>
        {(product.brand || product.activeIngredient || product.dosage || product.barcode || product.registration) && <dl className="product-information">
          {product.brand && <div><dt>Marca/Laboratório</dt><dd>{product.brand}</dd></div>}
          {product.activeIngredient && <div><dt>Princípio ativo</dt><dd>{product.activeIngredient}</dd></div>}
          {product.dosage && <div><dt>Dosagem</dt><dd>{product.dosage}</dd></div>}
          {product.barcode && <div><dt>Código de barras</dt><dd>{product.barcode}</dd></div>}
          {product.registration && <div><dt>Registro</dt><dd>{product.registration}</dd></div>}
        </dl>}
        {product.variants.length > 0 && (
          <fieldset className="detail-variant-picker">
            <legend>Escolha o tamanho e o pacote</legend>
            <div>
              {product.variants.map((variant) => (
                <label className={variant.id === selectedVariantId ? "active" : ""} key={variant.id}>
                  <input type="radio" name="variant" value={variant.id} checked={variant.id === selectedVariantId} onChange={() => { setSelectedVariantId(variant.id); setAdded(false); }} />
                  <strong>{variant.size}</strong>
                  <span>{variant.packageQuantity} fraldas</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="product-detail-price"><del>{money.format(product.oldPriceCents / 100)}</del><strong>{money.format(product.priceCents / 100)}</strong></div>
        {product.offerEndsAt && <p className="detail-offer-validity">Oferta válida até {new Date(product.offerEndsAt).toLocaleDateString("pt-BR")}</p>}
        <div className="detail-store-availability"><strong>Disponibilidade informada</strong><span>{[product.availableStore1 && "Loja 1 • Solo Sagrado", product.availableStore2 && "Loja 2 • Residencial Nature 1"].filter(Boolean).join(" e ")}</span></div>
        {product.category === "Medicamentos" && <a className="anvisa-leaflet-link" href="https://www.gov.br/anvisa/pt-br/sistemas/bulario-eletronico" target="_blank" rel="noreferrer"><span aria-hidden="true">+</span><span><strong>Consultar bula oficial na Anvisa ↗</strong><small>Pesquise pelo nome do produto ou princípio ativo no Bulário Eletrônico.</small></span></a>}
        <p className="product-disclaimer">Disponibilidade e condições serão confirmadas por nossa equipe.</p>
        <div className="product-detail-actions">
          <button type="button" onClick={addToCart}>{added ? "Adicionado ao carrinho ✓" : "Adicionar ao carrinho"}</button>
          <a href={`https://wa.me/5517996630482?text=${whatsappText}`} target="_blank" rel="noreferrer">Pedir pelo WhatsApp ↗</a>
        </div>
        {added && <a className="go-to-cart" href="/#ofertas">Continuar comprando ou abrir o carrinho na página inicial →</a>}
      </div>
    </section>
  );
}
