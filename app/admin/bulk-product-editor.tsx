"use client";

import { useMemo, useState, type FormEvent } from "react";
import { subcategoriesFor, type CatalogCategory } from "../product-categories";

type Props = {
  selectedIds: number[];
  allProductIds: number[];
  totalProducts: number;
  visibleProducts: number;
  categories: CatalogCategory[];
  onSelectAll: () => void;
  onClear: () => void;
  onUpdated: () => Promise<void>;
};

export default function BulkProductEditor({ selectedIds, allProductIds, totalProducts, visibleProducts, categories, onSelectAll, onClear, onUpdated }: Props) {
  const firstCategory = categories.find((category) => category.active && category.subcategories.some((subcategory) => subcategory.active));
  const [activeMode, setActiveMode] = useState("");
  const [featuredMode, setFeaturedMode] = useState("");
  const [changeCategory, setChangeCategory] = useState(false);
  const [category, setCategory] = useState(firstCategory?.name ?? "");
  const [subcategory, setSubcategory] = useState(firstCategory?.subcategories.find((item) => item.active)?.name ?? "");
  const [availability, setAvailability] = useState("");
  const [offerMode, setOfferMode] = useState("");
  const [offerStartsAt, setOfferStartsAt] = useState("");
  const [offerEndsAt, setOfferEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const subcategories = useMemo(() => subcategoriesFor(categories, category).filter((item) => item.active), [categories, category]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const changes: Record<string, unknown> = {};
      if (activeMode) changes.active = activeMode === "active";
      if (featuredMode) changes.featured = featuredMode === "featured";
      if (changeCategory) changes.category = { category, subcategory };
      if (availability) changes.availability = availability;
      if (offerMode === "clear") changes.offer = { mode: "clear" };
      if (offerMode === "set") changes.offer = {
        mode: "set",
        offerStartsAt: offerStartsAt ? new Date(offerStartsAt).toISOString() : null,
        offerEndsAt: offerEndsAt ? new Date(offerEndsAt).toISOString() : null,
      };
      if (!Object.keys(changes).length) throw new Error("Escolha pelo menos uma alteração.");
      const response = await fetch("/api/admin/products/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, changes }),
      });
      const data = (await response.json()) as { updated?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível editar os produtos.");
      await onUpdated();
      setMessage(`${data.updated ?? selectedIds.length} produtos atualizados com sucesso.`);
      setActiveMode("");
      setFeaturedMode("");
      setChangeCategory(false);
      setAvailability("");
      setOfferMode("");
      setOfferStartsAt("");
      setOfferEndsAt("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível editar os produtos.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAllFromShowcase() {
    if (!allProductIds.length || !window.confirm("Retirar todos os produtos da vitrine principal? Eles continuarão disponíveis normalmente nas pesquisas.")) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      let updated = 0;
      for (let index = 0; index < allProductIds.length; index += 200) {
        const response = await fetch("/api/admin/products/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: allProductIds.slice(index, index + 200), changes: { featured: false } }),
        });
        const data = (await response.json()) as { updated?: number; error?: string };
        if (!response.ok) throw new Error(data.error || "Não foi possível retirar os produtos da vitrine.");
        updated += data.updated ?? 0;
      }
      await onUpdated();
      setMessage(`${updated} produtos retirados da vitrine. Agora escolha apenas os que deseja destacar.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível retirar os produtos da vitrine.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="bulk-editor" onSubmit={submit}>
      <div className="bulk-editor-heading">
        <div><span>Edição em massa</span><strong>{selectedIds.length} de {totalProducts} selecionados</strong>{visibleProducts < totalProducts && <small>{visibleProducts} resultados visíveis na pesquisa</small>}</div>
        <div><button type="button" onClick={onSelectAll} disabled={!visibleProducts}>{visibleProducts < totalProducts ? "Selecionar resultados" : "Selecionar todos"}</button><button type="button" onClick={onClear} disabled={!selectedIds.length}>Limpar seleção</button></div>
      </div>
      <div className="bulk-showcase-reset"><div><strong>Recomeçar a seleção da vitrine</strong><small>Retira todos da página principal, mas mantém os produtos disponíveis nas pesquisas.</small></div><button type="button" onClick={() => void removeAllFromShowcase()} disabled={!allProductIds.length || busy}>Retirar todos da vitrine</button></div>
      <div className="bulk-fields">
        <label><span>Visibilidade</span><select value={activeMode} onChange={(event) => setActiveMode(event.target.value)}><option value="">Não alterar</option><option value="active">Exibir no site</option><option value="inactive">Ocultar do site</option></select></label>
        <label><span>Vitrine principal</span><select value={featuredMode} onChange={(event) => setFeaturedMode(event.target.value)}><option value="">Não alterar</option><option value="featured">Exibir na vitrine</option><option value="search-only">Somente na pesquisa</option></select></label>
        <label><span>Disponibilidade</span><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="">Não alterar</option><option value="both">Lojas 1 e 2</option><option value="store1">Somente Loja 1</option><option value="store2">Somente Loja 2</option></select></label>
        <label><span>Prazo da oferta</span><select value={offerMode} onChange={(event) => setOfferMode(event.target.value)}><option value="">Não alterar</option><option value="set">Definir prazo</option><option value="clear">Remover prazo</option></select></label>
      </div>
      <label className="bulk-category-toggle"><input type="checkbox" checked={changeCategory} onChange={(event) => setChangeCategory(event.target.checked)} /><span>Alterar categoria e subcategoria</span></label>
      {changeCategory && <div className="bulk-fields two">
        <label><span>Categoria</span><select value={category} onChange={(event) => { const next = event.target.value; setCategory(next); setSubcategory(subcategoriesFor(categories, next).find((item) => item.active)?.name ?? ""); }}>{categories.filter((item) => item.active).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
        <label><span>Subcategoria</span><select value={subcategory} onChange={(event) => setSubcategory(event.target.value)}>{subcategories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
      </div>}
      {offerMode === "set" && <div className="bulk-fields two"><label><span>Início</span><input type="datetime-local" value={offerStartsAt} onChange={(event) => setOfferStartsAt(event.target.value)} /></label><label><span>Fim</span><input type="datetime-local" value={offerEndsAt} onChange={(event) => setOfferEndsAt(event.target.value)} /></label></div>}
      {error && <p className="admin-message error" role="alert">{error}</p>}
      {message && <p className="admin-message success" role="status">{message}</p>}
      <button className="bulk-apply" type="submit" disabled={!selectedIds.length || busy}>{busy ? "Aplicando..." : "Aplicar aos selecionados"}</button>
    </form>
  );
}
