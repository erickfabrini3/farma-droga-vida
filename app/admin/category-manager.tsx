"use client";

import { useState, type FormEvent } from "react";
import type { CatalogCategory, CatalogSubcategory } from "../product-categories";
import type { Product } from "../product-data";

type Props = {
  initialCategories: CatalogCategory[];
  products: Product[];
  onChange(categories: CatalogCategory[]): void;
};

type EditingItem = { kind: "category"; id: number; name: string; icon: string; active: boolean } | { kind: "subcategory"; id: number; name: string; active: boolean };

export default function CategoryManager({ initialCategories, products, onChange }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("+");
  const [newSubcategoryNames, setNewSubcategoryNames] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<EditingItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function applyCategories(next: CatalogCategory[]) {
    setCategories(next);
    onChange(next);
  }

  async function request(method: "POST" | "PUT" | "DELETE", payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/categories", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { categories?: CatalogCategory[]; error?: string };
      if (!response.ok || !data.categories) throw new Error(data.error || "Não foi possível salvar as categorias.");
      applyCategories(data.categories);
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar as categorias.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await request("POST", { kind: "category", name: newCategoryName, icon: newCategoryIcon })) {
      setNewCategoryName("");
      setNewCategoryIcon("+");
      setMessage("Categoria criada com sucesso.");
    }
  }

  async function createSubcategory(categoryId: number) {
    const name = newSubcategoryNames[categoryId] || "";
    if (await request("POST", { kind: "subcategory", categoryId, name })) {
      setNewSubcategoryNames((current) => ({ ...current, [categoryId]: "" }));
      setMessage("Subcategoria criada com sucesso.");
    }
  }

  async function saveEditing() {
    if (!editing) return;
    const payload = editing.kind === "category"
      ? { kind: editing.kind, id: editing.id, name: editing.name, icon: editing.icon, active: editing.active }
      : { kind: editing.kind, id: editing.id, name: editing.name, active: editing.active };
    if (await request("PUT", payload)) {
      setEditing(null);
      setMessage("Alterações salvas. Os produtos vinculados também foram atualizados.");
    }
  }

  async function toggleCategory(category: CatalogCategory) {
    if (await request("PUT", { kind: "category", id: category.id, name: category.name, icon: category.icon, active: !category.active })) setMessage(category.active ? "Categoria desativada." : "Categoria ativada.");
  }

  async function toggleSubcategory(subcategory: CatalogSubcategory) {
    if (await request("PUT", { kind: "subcategory", id: subcategory.id, name: subcategory.name, active: !subcategory.active })) setMessage(subcategory.active ? "Subcategoria desativada." : "Subcategoria ativada.");
  }

  async function remove(kind: "category" | "subcategory", id: number, name: string) {
    if (!window.confirm(`Remover “${name}”? Essa ação só será permitida se não houver produtos vinculados.`)) return;
    if (await request("DELETE", { kind, id })) setMessage(`${kind === "category" ? "Categoria" : "Subcategoria"} removida.`);
  }

  function productCount(categoryName: string, subcategoryName?: string) {
    return products.filter((product) => product.category === categoryName && (!subcategoryName || product.subcategory === subcategoryName)).length;
  }

  return (
    <section className="category-manager" id="categorias">
      <div className="admin-section-heading">
        <div><span>Organização do catálogo</span><h2>Categorias e subcategorias</h2></div>
        <p>Crie, renomeie, organize ou desative seções. Ao renomear, os produtos vinculados acompanham a alteração automaticamente.</p>
      </div>

      <form className="new-category-form" onSubmit={createCategory}>
        <div><strong>Nova categoria</strong><small>Escolha um símbolo curto e informe o nome exibido no site.</small></div>
        <label><span>Ícone</span><input value={newCategoryIcon} onChange={(event) => setNewCategoryIcon(event.target.value)} maxLength={8} aria-label="Ícone da nova categoria" /></label>
        <label><span>Nome</span><input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Ex.: Dermocosméticos" required /></label>
        <button type="submit" disabled={busy}>+ Criar categoria</button>
      </form>

      {error && <p className="admin-message error" role="alert">{error}</p>}
      {message && <p className="admin-message success" role="status">{message}</p>}

      <div className="category-admin-list">
        {categories.map((category, categoryIndex) => {
          const editingCategory = editing?.kind === "category" && editing.id === category.id;
          return (
            <article className={`category-admin-card ${category.active ? "" : "inactive"}`} key={category.id}>
              <div className="category-admin-header">
                {editingCategory ? (
                  <div className="category-inline-editor">
                    <label><span>Ícone</span><input value={editing.icon} maxLength={8} onChange={(event) => setEditing({ ...editing, icon: event.target.value })} /></label>
                    <label><span>Nome</span><input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
                    <label className="category-active-check"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /><span>Ativa</span></label>
                    <button type="button" onClick={() => void saveEditing()} disabled={busy}>Salvar</button>
                    <button type="button" onClick={() => setEditing(null)}>Cancelar</button>
                  </div>
                ) : (
                  <>
                    <span className="category-admin-icon" aria-hidden="true">{category.icon}</span>
                    <div className="category-admin-title"><span>{category.active ? "Ativa no site" : "Desativada"}</span><strong>{category.name}</strong><small>{productCount(category.name)} produtos • {category.subcategories.length} subcategorias</small></div>
                    <div className="category-admin-actions">
                      <button type="button" onClick={() => void request("PUT", { kind: "category", id: category.id, direction: "up" })} disabled={busy || categoryIndex === 0} aria-label={`Mover ${category.name} para cima`}>↑</button>
                      <button type="button" onClick={() => void request("PUT", { kind: "category", id: category.id, direction: "down" })} disabled={busy || categoryIndex === categories.length - 1} aria-label={`Mover ${category.name} para baixo`}>↓</button>
                      <button type="button" onClick={() => setEditing({ kind: "category", id: category.id, name: category.name, icon: category.icon, active: category.active })}>Editar</button>
                      <button type="button" onClick={() => void toggleCategory(category)}>{category.active ? "Desativar" : "Ativar"}</button>
                      <button className="danger" type="button" onClick={() => void remove("category", category.id, category.name)}>Remover</button>
                    </div>
                  </>
                )}
              </div>

              <div className="subcategory-admin-list">
                {category.subcategories.map((subcategory, subcategoryIndex) => {
                  const editingSubcategory = editing?.kind === "subcategory" && editing.id === subcategory.id;
                  return (
                    <div className={`subcategory-admin-row ${subcategory.active ? "" : "inactive"}`} key={subcategory.id}>
                      {editingSubcategory ? (
                        <div className="subcategory-inline-editor">
                          <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} aria-label="Nome da subcategoria" />
                          <label><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /><span>Ativa</span></label>
                          <button type="button" onClick={() => void saveEditing()} disabled={busy}>Salvar</button><button type="button" onClick={() => setEditing(null)}>Cancelar</button>
                        </div>
                      ) : (
                        <>
                          <div><strong>{subcategory.name}</strong><small>{productCount(category.name, subcategory.name)} produtos {subcategory.active ? "" : "• desativada"}</small></div>
                          <div className="subcategory-actions">
                            <button type="button" disabled={busy || subcategoryIndex === 0} onClick={() => void request("PUT", { kind: "subcategory", id: subcategory.id, direction: "up" })}>↑</button>
                            <button type="button" disabled={busy || subcategoryIndex === category.subcategories.length - 1} onClick={() => void request("PUT", { kind: "subcategory", id: subcategory.id, direction: "down" })}>↓</button>
                            <button type="button" onClick={() => setEditing({ kind: "subcategory", id: subcategory.id, name: subcategory.name, active: subcategory.active })}>Editar</button>
                            <button type="button" onClick={() => void toggleSubcategory(subcategory)}>{subcategory.active ? "Desativar" : "Ativar"}</button>
                            <button className="danger" type="button" onClick={() => void remove("subcategory", subcategory.id, subcategory.name)}>×</button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                <div className="new-subcategory-row">
                  <input value={newSubcategoryNames[category.id] || ""} onChange={(event) => setNewSubcategoryNames((current) => ({ ...current, [category.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createSubcategory(category.id); } }} placeholder={`Nova subcategoria em ${category.name}`} aria-label={`Nova subcategoria em ${category.name}`} />
                  <button type="button" disabled={busy || !(newSubcategoryNames[category.id] || "").trim()} onClick={() => void createSubcategory(category.id)}>Adicionar</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
