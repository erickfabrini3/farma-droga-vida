"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import type { Product } from "../product-data";
import { DEFAULT_PRODUCT_CATEGORIES, subcategoriesFor, type CatalogCategory } from "../product-categories";
import type { SiteSettings } from "../site-settings";
import type { StoreSpecialHours } from "../site-settings";
import type { ProductMetric } from "../product-analytics";
import SiteManagement from "./site-management";
import { compressImageForUpload } from "../image-compression";
import type { AuditEntry } from "../audit-log";
import CategoryManager from "./category-manager";
import BackupManager from "./backup-manager";
import BulkProductEditor from "./bulk-product-editor";
import OfferAlerts from "./offer-alerts";
import type { SearchAnalyticsEntry } from "../search-analytics";

type Props = {
  initialProducts: Product[];
  initialSettings: SiteSettings;
  metrics: ProductMetric[];
  displayName: string;
  username: string;
  role: "owner" | "editor";
  canManageProducts: boolean;
  canManageContent: boolean;
  canViewAnalytics: boolean;
  auditLogs: AuditEntry[];
  initialCategories: CatalogCategory[];
  initialSpecialHours: StoreSpecialHours[];
  noResultSearches: SearchAnalyticsEntry[];
  referenceTime: string;
};

type FormState = {
  id: number | null;
  duplicateFromId: number | null;
  name: string;
  brand: string;
  activeIngredient: string;
  dosage: string;
  barcode: string;
  registration: string;
  category: string;
  subcategory: string;
  detail: string;
  oldPrice: string;
  price: string;
  badge: string;
  tone: string;
  sortOrder: string;
  active: boolean;
  featured: boolean;
  availableStore1: boolean;
  availableStore2: boolean;
  offerStartsAt: string;
  offerEndsAt: string;
  variants: VariantForm[];
};

type VariantForm = {
  key: string;
  size: string;
  packageQuantity: string;
};

function createEmptyForm(categories: CatalogCategory[]): FormState {
  const category = categories.find((item) => item.active) ?? categories[0] ?? DEFAULT_PRODUCT_CATEGORIES[0];
  const subcategory = category.subcategories.find((item) => item.active) ?? category.subcategories[0];
  return {
  id: null,
  duplicateFromId: null,
  name: "",
  brand: "",
  activeIngredient: "",
  dosage: "",
  barcode: "",
  registration: "",
  category: category.name,
  subcategory: subcategory?.name ?? "",
  detail: "",
  oldPrice: "",
  price: "",
  badge: "Oferta",
  tone: "amber",
  sortOrder: "0",
  active: true,
  featured: true,
  availableStore1: true,
  availableStore2: true,
  offerStartsAt: "",
  offerEndsAt: "",
  variants: [],
  };
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimal = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const localDateTime = (value: string | null) => value ? new Date(value).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 16) : "";
const automaticVariantDetail = "Quantidade por pacote conforme o tamanho selecionado";
const automaticToneHelp = "A cor será escolhida automaticamente quando você enviar a foto.";
const toneLabels: Record<string, string> = {
  mint: "Vermelho suave",
  rose: "Rosa suave",
  amber: "Amarelo suave",
  sage: "Verde suave",
  sky: "Azul suave",
  lavender: "Lilás suave",
  blue: "Neutro",
};

function normalizeCatalogSearch(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();
}

function presentationPlaceholder(category: string, subcategory: string, hasVariants: boolean) {
  if (hasVariants) return automaticVariantDetail;
  const normalizedCategory = normalizeCatalogSearch(category);
  const normalizedSubcategory = normalizeCatalogSearch(subcategory);
  if (normalizedSubcategory.includes("fralda")) return "Ex.: pacote com fraldas ou outras apresentações";
  if (normalizedSubcategory.includes("formula")) return "Ex.: 400 g, 800 g ou outras apresentações";
  if (normalizedCategory.includes("medicamento")) return "Ex.: 30 comp., 60 cáps., 120 mL ou outras apresentações";
  if (normalizedCategory.includes("suplemento")) return "Ex.: 60 cáps., 30 comp., 200 g ou outras apresentações";
  if (normalizedCategory.includes("perfumaria")) return "Ex.: 200 mL, 50 g, 1 un. ou outras apresentações";
  if (normalizedCategory.includes("saude e bem-estar")) return "Ex.: 50 tiras, 100 lancetas ou outras apresentações";
  return "Ex.: 1 un., 100 g, 200 mL ou outras apresentações";
}

function toneForHue(hue: number) {
  if (hue < 18 || hue >= 345) return "mint";
  if (hue < 70) return "amber";
  if (hue < 165) return "sage";
  if (hue < 255) return "sky";
  if (hue < 315) return "lavender";
  return "rose";
}

async function detectToneFromImage(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "blue";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const scores: Record<string, number> = { mint: 0, rose: 0, amber: 0, sage: 0, sky: 0, lavender: 0 };

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      if (alpha < 0.45) continue;
      const red = pixels[index] / 255;
      const green = pixels[index + 1] / 255;
      const blue = pixels[index + 2] / 255;
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const delta = maximum - minimum;
      const lightness = (maximum + minimum) / 2;
      const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
      if (saturation < 0.2 || lightness < 0.1 || lightness > 0.93) continue;

      let hue = 0;
      if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
      else hue = 60 * ((red - green) / delta + 4);
      if (hue < 0) hue += 360;
      const tone = toneForHue(hue);
      const balancedLightness = Math.max(0.2, 1 - Math.abs(lightness - 0.55) * 1.4);
      scores[tone] += saturation * balancedLightness * alpha;
    }

    const [detectedTone, score] = Object.entries(scores).sort((first, second) => second[1] - first[1])[0];
    return score > 1 ? detectedTone : "blue";
  } finally {
    bitmap.close();
  }
}

export default function AdminClient({ initialProducts, initialSettings, metrics, displayName, username, role, canManageProducts, canManageContent, canViewAnalytics, auditLogs, initialCategories, initialSpecialHours, noResultSearches, referenceTime }: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const [form, setForm] = useState<FormState>(() => createEmptyForm(initialCategories));
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [toneDetectionMessage, setToneDetectionMessage] = useState(automaticToneHelp);
  const formRef = useRef<HTMLFormElement>(null);
  const editingProduct = useMemo(() => products.find((product) => product.id === (form.id ?? form.duplicateFromId)), [products, form.id, form.duplicateFromId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function chooseProductImage(file: File | null) {
    setImage(file);
    if (!file) {
      setToneDetectionMessage(automaticToneHelp);
      return;
    }
    setToneDetectionMessage("Analisando as cores da foto...");
    try {
      const detectedTone = await detectToneFromImage(file);
      update("tone", detectedTone);
      setToneDetectionMessage(`Cor escolhida automaticamente: ${toneLabels[detectedTone]}. Você ainda pode alterá-la.`);
    } catch {
      update("tone", "blue");
      setToneDetectionMessage("Não foi possível identificar uma cor predominante. O destaque neutro foi selecionado.");
    }
  }

  function resetForm() {
    setForm(createEmptyForm(categories));
    setImage(null);
    setToneDetectionMessage(automaticToneHelp);
    setMessage("");
    setError("");
    if (formRef.current) formRef.current.reset();
  }

  function editProduct(product: Product) {
    setForm({
      id: product.id,
      duplicateFromId: null,
      name: product.name,
      brand: product.brand,
      activeIngredient: product.activeIngredient,
      dosage: product.dosage,
      barcode: product.barcode,
      registration: product.registration,
      category: product.category,
      subcategory: product.subcategory,
      detail: product.detail,
      oldPrice: decimal(product.oldPriceCents),
      price: decimal(product.priceCents),
      badge: product.badge,
      tone: product.tone,
      sortOrder: String(product.sortOrder),
      active: product.active,
      featured: product.featured,
      availableStore1: product.availableStore1,
      availableStore2: product.availableStore2,
      offerStartsAt: localDateTime(product.offerStartsAt),
      offerEndsAt: localDateTime(product.offerEndsAt),
      variants: product.variants.map((variant) => ({
        key: String(variant.id),
        size: variant.size,
        packageQuantity: String(variant.packageQuantity),
      })),
    });
    setImage(null);
    setToneDetectionMessage("A cor atual será mantida. Envie outra foto para recalcular automaticamente.");
    setMessage("");
    setError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function duplicateProduct(product: Product) {
    setForm({
      id: null,
      duplicateFromId: product.id,
      name: `${product.name} (cópia)`.slice(0, 120),
      brand: product.brand,
      activeIngredient: product.activeIngredient,
      dosage: product.dosage,
      barcode: "",
      registration: product.registration,
      category: product.category,
      subcategory: product.subcategory,
      detail: product.detail,
      oldPrice: decimal(product.oldPriceCents),
      price: decimal(product.priceCents),
      badge: product.badge,
      tone: product.tone,
      sortOrder: String(product.sortOrder),
      active: product.active,
      featured: product.featured,
      availableStore1: product.availableStore1,
      availableStore2: product.availableStore2,
      offerStartsAt: localDateTime(product.offerStartsAt),
      offerEndsAt: localDateTime(product.offerEndsAt),
      variants: product.variants.map((variant) => ({ key: `copy-${product.id}-${variant.id}`, size: variant.size, packageQuantity: String(variant.packageQuantity) })),
    });
    setImage(null);
    setToneDetectionMessage("A cor da foto original será mantida. Envie outra foto para recalcular automaticamente.");
    setMessage("Revise os dados da cópia antes de cadastrar.");
    setError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function refreshProducts() {
    const response = await fetch("/api/admin/products", { cache: "no-store" });
    const data = (await response.json()) as { products?: Product[]; error?: string };
    if (!response.ok || !data.products) throw new Error(data.error || "Não foi possível atualizar a lista.");
    setProducts(data.products);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
    const payload = new FormData();
    if (form.id !== null) payload.set("id", String(form.id));
    if (form.duplicateFromId !== null) payload.set("duplicateFromId", String(form.duplicateFromId));
    payload.set("name", form.name);
    payload.set("brand", form.brand);
    payload.set("activeIngredient", form.activeIngredient);
    payload.set("dosage", form.dosage);
    payload.set("barcode", form.barcode);
    payload.set("registration", form.registration);
    payload.set("category", form.category);
    payload.set("subcategory", form.subcategory);
    payload.set("detail", form.detail.trim() || (form.variants.length ? automaticVariantDetail : ""));
    payload.set("oldPrice", form.oldPrice);
    payload.set("price", form.price);
    payload.set("badge", form.badge);
    payload.set("tone", form.tone);
    payload.set("sortOrder", form.sortOrder);
    payload.set("active", String(form.active));
    payload.set("featured", String(form.featured));
    payload.set("availableStore1", String(form.availableStore1));
    payload.set("availableStore2", String(form.availableStore2));
    payload.set("offerStartsAt", form.offerStartsAt ? new Date(form.offerStartsAt).toISOString() : "");
    payload.set("offerEndsAt", form.offerEndsAt ? new Date(form.offerEndsAt).toISOString() : "");
    payload.set("variants", JSON.stringify(form.variants.map((variant) => ({
      size: variant.size,
      packageQuantity: variant.packageQuantity,
    }))));
    if (image) payload.set("image", await compressImageForUpload(image));

      const response = await fetch("/api/admin/products", {
        method: form.id === null ? "POST" : "PUT",
        body: payload,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o produto.");
      await refreshProducts();
      setMessage(form.id === null ? (form.duplicateFromId === null ? "Produto cadastrado com sucesso." : "Cópia cadastrada com sucesso.") : "Produto atualizado com sucesso.");
      setForm(createEmptyForm(categories));
      setImage(null);
      setToneDetectionMessage(automaticToneHelp);
      formRef.current?.reset();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível salvar o produto.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Remover “${product.name}” do site?`)) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível remover o produto.");
      await refreshProducts();
      setSelectedIds((current) => current.filter((id) => id !== product.id));
      if (form.id === product.id || form.duplicateFromId === product.id) resetForm();
      setMessage("Produto removido do site.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível remover o produto.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleProductShowcase(product: Product) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/products/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [product.id], changes: { featured: !product.featured } }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar a vitrine.");
      await refreshProducts();
      setMessage(product.featured ? `${product.name} foi retirado da vitrine e continua disponível nas pesquisas.` : `${product.name} foi adicionado à vitrine.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível alterar a vitrine.");
    } finally {
      setBusy(false);
    }
  }

  function addVariant() {
    setForm((current) => ({
      ...current,
      detail: current.detail.trim() ? current.detail : automaticVariantDetail,
      variants: [...current.variants, { key: `${Date.now()}-${current.variants.length}`, size: "", packageQuantity: "" }],
    }));
  }

  function updateVariant(key: string, field: keyof Omit<VariantForm, "key">, value: string) {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant) => variant.key === key ? { ...variant, [field]: value } : variant),
    }));
  }

  function removeVariant(key: string) {
    setForm((current) => {
      const variants = current.variants.filter((variant) => variant.key !== key);
      return { ...current, detail: variants.length === 0 && current.detail === automaticVariantDetail ? "" : current.detail, variants };
    });
  }

  async function importSpreadsheet() {
    if (!importFile) return;
    setImportBusy(true);
    setMessage("");
    setError("");
    try {
      const payload = new FormData();
      payload.set("file", importFile);
      const response = await fetch("/api/admin/products/bulk", { method: "POST", body: payload });
      const data = (await response.json()) as { created?: number; updated?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível importar a planilha.");
      await refreshProducts();
      setImportFile(null);
      setMessage(`Planilha importada: ${data.created ?? 0} produtos criados e ${data.updated ?? 0} atualizados.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível importar a planilha.");
    } finally {
      setImportBusy(false);
    }
  }

  function categoriesChanged(next: CatalogCategory[]) {
    setCategories(next);
    setForm((current) => {
      const category = next.find((item) => item.name === current.category);
      const subcategory = category?.subcategories.find((item) => item.name === current.subcategory);
      if (category && subcategory) return current;
      return createEmptyForm(next);
    });
    void refreshProducts();
  }

  const selectableCategories = categories.filter((category) => (category.active && category.subcategories.some((subcategory) => subcategory.active)) || category.name === form.category);
  const selectableSubcategories = subcategoriesFor(categories, form.category, true).filter((subcategory) => subcategory.active || subcategory.name === form.subcategory);
  const filteredCatalogProducts = useMemo(() => {
    const query = normalizeCatalogSearch(catalogSearch);
    if (!query) return products;
    return products.filter((product) => normalizeCatalogSearch([
      product.name,
      product.brand,
      product.activeIngredient,
      product.dosage,
      product.barcode,
      product.registration,
      product.detail,
      product.category,
      product.subcategory,
      product.variants.map((variant) => `${variant.size} ${variant.packageQuantity}`).join(" "),
    ].join(" ")).includes(query));
  }, [catalogSearch, products]);

  function toggleProductSelection(productId: number) {
    setSelectedIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  }

  async function finishBulkUpdate() {
    await refreshProducts();
    setSelectedIds([]);
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <Link href="/" aria-label="Voltar ao site"><img className="admin-logo" src="/brand/droga-vida-popular-logo.png" alt="Droga Vida Popular" /></Link>
        <div className="admin-account">
          <span>Olá, {displayName} <small>@{username}</small></span>
          {role === "owner" && <Link href="/admin/access">Gerenciar acessos</Link>}
          <form action="/api/admin/logout" method="post"><button type="submit">Sair</button></form>
        </div>
      </header>

      <section className="admin-intro">
        <div><span className="admin-kicker">Área administrativa</span><h1>Painel da farmácia</h1></div>
        <p>Gerencie produtos, campanhas, lojas e acompanhe o interesse dos clientes em um só lugar.</p>
      </section>

      <nav className="admin-tabs" aria-label="Seções do painel">{canManageProducts && <><a href="#produtos">Produtos</a><a href="#categorias">Categorias</a></>}{canViewAnalytics && <a href="#estatisticas">Estatísticas</a>}{canManageContent && <a href="#conteudo-site">Banner e lojas</a>}{role === "owner" && <><a href="#backup">Backup</a><a href="#historico">Histórico</a><Link href="/admin/access">Acessos</Link></>}</nav>

      {canManageProducts && <>
      <OfferAlerts products={products} referenceTime={referenceTime} onEdit={editProduct} />
      <section className="admin-grid" id="produtos">
        <form className="admin-form" ref={formRef} onSubmit={handleSubmit}>
          <div className="admin-form-heading">
            <div><span>{form.id !== null ? "Editando produto" : form.duplicateFromId !== null ? "Duplicando produto" : "Novo produto"}</span><h2>{form.id !== null || form.duplicateFromId !== null ? form.name : "Cadastrar oferta"}</h2></div>
            {(form.id !== null || form.duplicateFromId !== null) && <button type="button" onClick={resetForm}>Cancelar</button>}
          </div>

          <label><span>Nome do produto</span><input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ex.: Vitergan Master-N" required /></label>
          <div className="admin-form-row">
            <label><span>Marca ou laboratório</span><input value={form.brand} onChange={(event) => update("brand", event.target.value)} placeholder="Ex.: Cimed" /></label>
            <label><span>Princípio ativo</span><input value={form.activeIngredient} onChange={(event) => update("activeIngredient", event.target.value)} placeholder="Quando aplicável" /></label>
          </div>
          <div className="admin-form-row">
            <label><span>Dosagem</span><input value={form.dosage} onChange={(event) => update("dosage", event.target.value)} placeholder="Ex.: 20 mg" /></label>
            <label><span>Código de barras</span><input inputMode="numeric" value={form.barcode} onChange={(event) => update("barcode", event.target.value.replace(/\D/g, ""))} placeholder="EAN" /></label>
          </div>
          <label><span>Registro MS/Anvisa</span><input value={form.registration} onChange={(event) => update("registration", event.target.value)} placeholder="Quando aplicável" /></label>
          <div className="admin-form-row">
            <label>
              <span>Categoria</span>
              <select value={form.category} onChange={(event) => {
                const category = event.target.value;
                setForm((current) => ({ ...current, category, subcategory: subcategoriesFor(categories, category).find((subcategory) => subcategory.active)?.name ?? "" }));
              }}>
                {selectableCategories.map((category) => <option key={category.id} value={category.name}>{category.name}{category.active ? "" : " (desativada)"}</option>)}
              </select>
            </label>
            <label>
              <span>Subcategoria</span>
              <select value={form.subcategory} onChange={(event) => update("subcategory", event.target.value)}>
                {selectableSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.name}>{subcategory.name}{subcategory.active ? "" : " (desativada)"}</option>)}
              </select>
            </label>
          </div>
          <label className="admin-presentation-field"><span>Apresentação</span><input value={form.detail} onChange={(event) => update("detail", event.target.value)} placeholder={presentationPlaceholder(form.category, form.subcategory, form.variants.length > 0)} required={form.variants.length === 0} />{form.variants.length > 0 && <small>Preenchido automaticamente porque o produto possui tamanhos e quantidades diferentes.</small>}</label>
          <div className="admin-form-row">
            <label><span>Preço anterior</span><input inputMode="decimal" value={form.oldPrice} onChange={(event) => update("oldPrice", event.target.value)} placeholder="110,29" required /></label>
            <label><span>Preço da oferta</span><input inputMode="decimal" value={form.price} onChange={(event) => update("price", event.target.value)} placeholder="74,99" required /></label>
          </div>
          <div className="offer-schedule-editor">
            <div><span>Validade automática da oferta</span><small>Deixe em branco para manter o produto publicado sem prazo.</small></div>
            <div className="admin-form-row">
              <label><span>Início</span><input type="datetime-local" value={form.offerStartsAt} onChange={(event) => update("offerStartsAt", event.target.value)} /></label>
              <label><span>Fim</span><input type="datetime-local" value={form.offerEndsAt} onChange={(event) => update("offerEndsAt", event.target.value)} /></label>
            </div>
          </div>
          <label><span>Selo do produto</span><select value={form.badge} onChange={(event) => update("badge", event.target.value)}><option value="">Sem selo</option><option value="Oferta">Oferta</option><option value="Mais vendido">Mais vendido</option><option value="Novidade">Novidade</option></select></label>
          <div className="variant-editor">
            <div className="variant-editor-heading">
              <div><span>Tamanhos e pacotes</span><strong>Opções do produto</strong><small>Use para fraldas ou outros produtos com tamanhos diferentes.</small></div>
              <button type="button" onClick={addVariant}>+ Adicionar tamanho</button>
            </div>
            {form.variants.length === 0 ? (
              <p>Nenhuma opção cadastrada. Se o produto tiver tamanhos, clique em “Adicionar tamanho”.</p>
            ) : (
              <div className="variant-form-list">
                {form.variants.map((variant, index) => (
                  <div className="variant-form-row" key={variant.key}>
                    <span>#{index + 1}</span>
                    <label><span>Tamanho</span><input value={variant.size} onChange={(event) => updateVariant(variant.key, "size", event.target.value)} placeholder="P, M, G, XG..." required /></label>
                    <label><span>Fraldas no pacote</span><input type="number" min="1" value={variant.packageQuantity} onChange={(event) => updateVariant(variant.key, "packageQuantity", event.target.value)} placeholder="20" required /></label>
                    <button type="button" onClick={() => removeVariant(variant.key)} aria-label={`Remover tamanho ${variant.size || index + 1}`}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="admin-form-row">
            <label className="tone-picker"><span>Cor do destaque</span><select value={form.tone} onChange={(event) => { update("tone", event.target.value); setToneDetectionMessage("Cor ajustada manualmente. Ao trocar a foto, ela será recalculada."); }}><option value="mint">Vermelho suave</option><option value="rose">Rosa suave</option><option value="amber">Amarelo suave</option><option value="sage">Verde suave</option><option value="sky">Azul suave</option><option value="lavender">Lilás suave</option><option value="blue">Neutro</option></select><small>{toneDetectionMessage}</small></label>
            <label><span>Ordem no site</span><input type="number" min="0" value={form.sortOrder} onChange={(event) => update("sortOrder", event.target.value)} /></label>
          </div>
          <label className="admin-file-field"><span>Foto do produto {form.id !== null ? "(opcional na edição)" : form.duplicateFromId !== null ? "(a foto original será copiada)" : ""}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseProductImage(event.target.files?.[0] ?? null)} required={form.id === null && form.duplicateFromId === null} /><small>JPG, PNG ou WEBP, com até 5 MB. A cor do destaque será calculada pela foto.</small></label>
          {editingProduct && <div className="admin-current-image"><img src={editingProduct.imageUrl} alt="Foto atual" /><span>{form.duplicateFromId !== null ? "Foto que será copiada" : "Foto atual do produto"}</span></div>}
          <fieldset className="store-availability-picker">
            <legend>Disponível em quais lojas?</legend>
            <label><input type="checkbox" checked={form.availableStore1} onChange={(event) => update("availableStore1", event.target.checked)} /><span>Loja 1 • Solo Sagrado</span></label>
            <label><input type="checkbox" checked={form.availableStore2} onChange={(event) => update("availableStore2", event.target.checked)} /><span>Loja 2 • Residencial Nature 1</span></label>
            <small>Essa informação não controla estoque; apenas informa onde o produto costuma estar disponível.</small>
          </fieldset>
          <label className="admin-check"><input type="checkbox" checked={form.featured} onChange={(event) => update("featured", event.target.checked)} /><span>Exibir na vitrine principal — desmarcado, aparece somente nas pesquisas</span></label>
          <label className="admin-check"><input type="checkbox" checked={form.active} onChange={(event) => update("active", event.target.checked)} /><span>Exibir este produto no site</span></label>

          {error && <p className="admin-message error" role="alert">{error}</p>}
          {message && <p className="admin-message success" role="status">{message}</p>}
          <button className="admin-submit" type="submit" disabled={busy}>{busy ? "Salvando..." : form.id !== null ? "Salvar alterações" : form.duplicateFromId !== null ? "Cadastrar cópia" : "Cadastrar produto"}</button>
        </form>

        <div className="admin-products">
          <div className="admin-list-heading"><div><span>Catálogo atual</span><h2>{products.length} produtos</h2></div><Link href="/#ofertas" target="_blank">Ver no site ↗</Link></div>
          <div className="catalog-tools">
            <div><strong>Planilha e cópia de segurança</strong><small>Baixe o catálogo em CSV, edite no Excel ou Google Planilhas e importe novamente.</small></div>
            <a href="/api/admin/products/bulk">Baixar catálogo</a>
            <label><input type="file" accept=".csv,text/csv" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} /><span>{importFile?.name || "Escolher CSV"}</span></label>
            <button type="button" onClick={() => void importSpreadsheet()} disabled={!importFile || importBusy}>{importBusy ? "Importando..." : "Importar"}</button>
          </div>
          <div className="admin-catalog-search" role="search">
            <label htmlFor="admin-catalog-search"><span>Pesquisar produto para selecionar</span><span className="admin-catalog-search-input"><b aria-hidden="true">⌕</b><input id="admin-catalog-search" type="search" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Digite nome, marca, código de barras, categoria ou tamanho" autoComplete="off" aria-controls="admin-product-list" />{catalogSearch && <button type="button" onClick={() => setCatalogSearch("")} aria-label="Limpar pesquisa do catálogo">×</button>}</span></label>
            <small><strong>{filteredCatalogProducts.length}</strong> {filteredCatalogProducts.length === 1 ? "produto aparecendo" : "produtos aparecendo"} conforme sua pesquisa.</small>
          </div>
          <BulkProductEditor selectedIds={selectedIds} allProductIds={products.map((product) => product.id)} totalProducts={products.length} visibleProducts={filteredCatalogProducts.length} categories={categories} onSelectAll={() => setSelectedIds((current) => [...new Set([...current, ...filteredCatalogProducts.map((product) => product.id)])])} onClear={() => setSelectedIds([])} onUpdated={finishBulkUpdate} />
          <div className="admin-product-list" id="admin-product-list">
            {filteredCatalogProducts.map((product) => (
              <article className={`admin-product-card ${product.active ? "" : "inactive"} ${selectedIds.includes(product.id) ? "selected" : ""}`} key={product.id}>
                <label className="admin-product-select"><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleProductSelection(product.id)} /><span>Selecionar {product.name}</span></label>
                <img src={product.imageUrl} alt={product.name} />
                <div className="admin-product-copy"><span>{product.category} • {product.subcategory}{!product.active ? " • Oculto" : !product.featured ? " • Somente na pesquisa" : " • Na vitrine"}</span><strong>{product.name}</strong><small>{[product.brand, product.dosage, product.detail].filter(Boolean).join(" • ")}{product.variants.length ? ` • ${product.variants.length} tamanhos` : ""}</small>{product.variants.length > 0 && <em>{product.variants.map((variant) => `${variant.size}: ${variant.packageQuantity} un.`).join(" • ")}</em>}<em>{[product.availableStore1 && "Loja 1", product.availableStore2 && "Loja 2", product.offerEndsAt && `até ${new Date(product.offerEndsAt).toLocaleDateString("pt-BR")}`].filter(Boolean).join(" • ")}</em><b>{money.format(product.priceCents / 100)}</b></div>
                <div className="admin-product-actions"><button className={`showcase ${product.featured ? "active" : ""}`} type="button" onClick={() => void toggleProductShowcase(product)} disabled={busy || !product.active} title={product.active ? undefined : "Ative o produto para colocá-lo na vitrine"}>{product.featured ? "Retirar da vitrine" : "+ Adicionar à vitrine"}</button><button type="button" onClick={() => editProduct(product)} disabled={busy}>Editar</button><button type="button" onClick={() => duplicateProduct(product)} disabled={busy}>Duplicar</button><button className="danger" type="button" onClick={() => deleteProduct(product)} disabled={busy}>Remover</button></div>
              </article>
            ))}
            {filteredCatalogProducts.length === 0 && <div className="admin-catalog-empty"><span aria-hidden="true">⌕</span><strong>Nenhum produto encontrado.</strong><small>Tente outro nome, marca, código ou tamanho.</small><button type="button" onClick={() => setCatalogSearch("")}>Limpar pesquisa</button></div>}
          </div>
        </div>
      </section></>}

      {canManageProducts && <CategoryManager initialCategories={categories} products={products} onChange={categoriesChanged} />}

      <SiteManagement initialSettings={initialSettings} products={products} metrics={metrics} canManageContent={canManageContent} canViewAnalytics={canViewAnalytics} initialSpecialHours={initialSpecialHours} noResultSearches={noResultSearches} />
      {role === "owner" && <BackupManager />}
      {role === "owner" && <section className="audit-panel" id="historico">
        <div className="admin-section-heading"><div><span>Segurança e controle</span><h2>Histórico de alterações</h2></div><p>Registro das ações realizadas no painel para você saber quem alterou produtos, conteúdo ou acessos.</p></div>
        <div className="audit-list">{auditLogs.length ? auditLogs.map((entry) => <article key={entry.id}><span>{entry.actorName.slice(0, 1).toUpperCase()}</span><div><strong>{entry.summary}</strong><small>{entry.actorName} • {new Date(entry.createdAt).toLocaleString("pt-BR")}</small></div><em>{entry.action}</em></article>) : <p>Nenhuma alteração registrada ainda.</p>}</div>
      </section>}
    </main>
  );
}
