"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { type Product, type ProductVariant } from "./product-data";
import { subcategoriesFor, type CatalogCategory } from "./product-categories";
import { formatDayHours, formatSpecialHoursDate, getStoreOpenStatus, parseWeeklySchedule, saoPauloDateKey, weekdaysStartingAt, type SiteSettings, type StoreSpecialHours } from "./site-settings";

type CartItem = { product: Product; variant: ProductVariant | null; quantity: number };
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function cartItemKey(productId: number, variantId?: number | null) {
  return `${productId}:${variantId ?? "base"}`;
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const stores = [
  {
    name: "Loja 1 • Solo Sagrado",
    address: "Av. Alfredo Teodoro de Oliveira, 2565 – Solo Sagrado",
    phone: "(17) 3217-4365",
    tel: "+551732174365",
    map: "https://www.google.com/maps/search/?api=1&query=Av.+Alfredo+Teodoro+de+Oliveira,+2565,+Solo+Sagrado",
  },
  {
    name: "Loja 2 • Residencial Nature 1",
    address: "Estrada Municipal Valdomiro Lopes da Silva, 750 – Pq. Residencial Nature 1",
    phone: "(17) 99663-0482",
    tel: "+5517996630482",
    map: "https://www.google.com/maps/place/Droga+Vida+Popular+(Farmácia)/@-20.7799682,-49.416106,15z/data=!4m6!3m5!1s0x94bdadb0040eebbd:0x4da1a18e0215b2c9!8m2!3d-20.7664235!4d-49.4206409!16s%2Fg%2F11mqwl37s5?entry=ttu&g_ep=EgoyMDI2MDgxNi4wIKXMDSoASAFQAw%3D%3D",
  },
];

const whatsappUrl = "https://wa.me/5517996630482?text=Olá%2C%20vim%20pelo%20site%20da%20Droga%20Vida%20Popular%20e%20gostaria%20de%20atendimento.";

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();
}

async function trackMetric(productId: number, eventType: "view" | "cart_add") {
  await fetch("/api/product-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, eventType }),
    keepalive: true,
  }).catch(() => undefined);
}

export default function HomeClient({ initialProducts, settings, categories, specialHours }: { initialProducts: Product[]; settings: SiteSettings; categories: CatalogCategory[]; specialHours: StoreSpecialHours[] }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartReady, setCartReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [selectedSubcategory, setSelectedSubcategory] = useState("Todas");
  const [searchFocused, setSearchFocused] = useState(false);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"delivery" | "pickup">("delivery");
  const [pickupStore, setPickupStore] = useState("Loja 2 — Residencial Nature 1");
  const [orderNotes, setOrderNotes] = useState("");
  const [selectedVariantIds, setSelectedVariantIds] = useState<Record<number, number>>({});
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [lastOrder, setLastOrder] = useState<Record<string, number>>({});
  const [sharedProductId, setSharedProductId] = useState<number | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const recordedNoResultSearches = useRef(new Set<string>());

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setCurrentTime(new Date()), 0);
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let restoredCart: CartItem[] = [];
    try {
      const saved = window.localStorage.getItem("droga-vida-cart");
      if (saved) {
        const quantities = JSON.parse(saved) as Record<string, number>;
        restoredCart = initialProducts.flatMap<CartItem>((product) => {
          if (product.variants.length) {
            return product.variants.flatMap((variant) => {
              const quantity = Math.max(0, Math.floor(quantities[cartItemKey(product.id, variant.id)] ?? 0));
              return quantity ? [{ product, variant, quantity }] : [];
            });
          }
          const quantity = Math.max(0, Math.floor(quantities[cartItemKey(product.id)] ?? quantities[String(product.id)] ?? 0));
          return quantity ? [{ product, variant: null, quantity }] : [];
        });
      }
    } catch {
      window.localStorage.removeItem("droga-vida-cart");
    }
    const timer = window.setTimeout(() => {
      setCart(restoredCart);
      setCartReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialProducts]);

  useEffect(() => {
    let storedFavorites: number[] = [];
    let storedOrder: Record<string, number> = {};
    try {
      storedFavorites = JSON.parse(window.localStorage.getItem("droga-vida-favorites") || "[]") as number[];
      storedOrder = JSON.parse(window.localStorage.getItem("droga-vida-last-order") || "{}") as Record<string, number>;
    } catch {
      window.localStorage.removeItem("droga-vida-favorites");
      window.localStorage.removeItem("droga-vida-last-order");
    }
    const restoreTimer = window.setTimeout(() => {
      setFavorites(storedFavorites.filter((id) => Number.isInteger(id)));
      setLastOrder(storedOrder);
    }, 0);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
    const installHandler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", installHandler);
    return () => { window.clearTimeout(restoreTimer); window.removeEventListener("beforeinstallprompt", installHandler); };
  }, []);

  useEffect(() => {
    if (!cartReady) return;
    const quantities = Object.fromEntries(cart.map((item) => [cartItemKey(item.product.id, item.variant?.id), item.quantity]));
    window.localStorage.setItem("droga-vida-cart", JSON.stringify(quantities));
  }, [cart, cartReady]);

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotalCents = useMemo(() => cart.reduce((total, item) => total + item.product.priceCents * item.quantity, 0), [cart]);
  const availableSubcategories = selectedCategory === "Todos" ? [] : subcategoriesFor(categories, selectedCategory);
  const catalogSearchActive = normalizeSearch(searchQuery).length > 0;
  const filteredProducts = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    return initialProducts.filter((product) => {
      const matchesCategory = selectedCategory === "Todos" || product.category === selectedCategory;
      const matchesSubcategory = selectedSubcategory === "Todas" || product.subcategory === selectedSubcategory;
      const variantText = product.variants.map((variant) => `${variant.size} ${variant.packageQuantity} fraldas`).join(" ");
      const searchableText = normalizeSearch([product.name, product.brand, product.activeIngredient, product.dosage, product.barcode, product.registration, product.detail, product.category, product.subcategory, variantText].join(" "));
      const matchesFavorite = !showFavorites || favorites.includes(product.id);
      const matchesMainShowcase = Boolean(query) || product.featured;
      return matchesCategory && matchesSubcategory && matchesFavorite && matchesMainShowcase && (!query || searchableText.includes(query));
    });
  }, [initialProducts, searchQuery, selectedCategory, selectedSubcategory, showFavorites, favorites]);
  const suggestions = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    if (!query) return [];
    return initialProducts.filter((product) => normalizeSearch([product.name, product.brand, product.activeIngredient, product.dosage, product.barcode, product.registration, product.detail, product.category, product.subcategory, product.variants.map((variant) => `${variant.size} ${variant.packageQuantity}`).join(" ")].join(" ")).includes(query)).slice(0, 5);
  }, [initialProducts, searchQuery]);

  useEffect(() => {
    const normalizedQuery = normalizeSearch(searchQuery);
    if (normalizedQuery.length < 2 || suggestions.length > 0 || recordedNoResultSearches.current.has(normalizedQuery)) return;
    const timer = window.setTimeout(() => {
      recordedNoResultSearches.current.add(normalizedQuery);
      void fetch("/api/search-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
        keepalive: true,
      }).then((response) => {
        if (!response.ok) recordedNoResultSearches.current.delete(normalizedQuery);
      }).catch(() => recordedNoResultSearches.current.delete(normalizedQuery));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [searchQuery, suggestions.length]);

  const storeCards = [
    { ...stores[0], schedule: parseWeeklySchedule(settings.store1Hours), imageUrl: settings.store1ImageUrl, specialHours: specialHours.filter((entry) => entry.storeNumber === 1) },
    { ...stores[1], schedule: parseWeeklySchedule(settings.store2Hours), imageUrl: settings.store2ImageUrl, specialHours: specialHours.filter((entry) => entry.storeNumber === 2) },
  ];

  function chooseCategory(category: string) {
    setSelectedCategory(category);
    setSelectedSubcategory("Todas");
  }

  function clearProductFilters() {
    setSearchQuery("");
    setSelectedCategory("Todos");
    setSelectedSubcategory("Todas");
    setShowFavorites(false);
  }

  function selectedVariantFor(product: Product) {
    if (!product.variants.length) return null;
    return product.variants.find((variant) => variant.id === selectedVariantIds[product.id])
      ?? product.variants[0];
  }

  function addToCart(product: Product, variant: ProductVariant | null = selectedVariantFor(product)) {
    const key = cartItemKey(product.id, variant?.id);
    setCart((current) => {
      const existing = current.find((item) => cartItemKey(item.product.id, item.variant?.id) === key);
      return existing
        ? current.map((item) => cartItemKey(item.product.id, item.variant?.id) === key ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { product, variant, quantity: 1 }];
    });
    void trackMetric(product.id, "cart_add");
    setCartOpen(true);
  }

  function toggleFavorite(productId: number) {
    setFavorites((current) => {
      const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
      window.localStorage.setItem("droga-vida-favorites", JSON.stringify(next));
      return next;
    });
  }

  function buyAgain() {
    const restored = initialProducts.flatMap<CartItem>((product) => {
      if (product.variants.length) return product.variants.flatMap((variant) => {
        const quantity = Math.max(0, Number(lastOrder[cartItemKey(product.id, variant.id)] || 0));
        return quantity ? [{ product, variant, quantity }] : [];
      });
      const quantity = Math.max(0, Number(lastOrder[cartItemKey(product.id)] || 0));
      return quantity ? [{ product, variant: null, quantity }] : [];
    });
    if (restored.length) { setCart(restored); setCartOpen(true); }
  }

  async function shareProduct(product: Product) {
    const url = `${window.location.origin}/produto/${product.id}`;
    try {
      if (navigator.share) await navigator.share({ title: product.name, text: `${product.name} na Droga Vida Popular`, url });
      else await navigator.clipboard.writeText(url);
      setSharedProductId(product.id);
      window.setTimeout(() => setSharedProductId(null), 1800);
    } catch { /* O cliente cancelou o compartilhamento. */ }
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function changeQuantity(key: string, change: number) {
    setCart((current) => current
      .map((item) => cartItemKey(item.product.id, item.variant?.id) === key ? { ...item, quantity: item.quantity + change } : item)
      .filter((item) => item.quantity > 0));
  }

  function finishCart() {
    if (!cart.length) return;
    const items = cart.map((item) => `• ${item.quantity}x ${item.product.name}${item.variant ? ` — tamanho ${item.variant.size}, pacote com ${item.variant.packageQuantity} fraldas` : ""} — ${money.format((item.product.priceCents * item.quantity) / 100)}`);
    const text = [
      "Olá, vim pelo site da Droga Vida Popular e gostaria de confirmar este pedido:",
      "",
      ...items,
      "",
      `Subtotal dos produtos: ${money.format(subtotalCents / 100)}`,
      fulfillmentMethod === "delivery" ? "Forma de recebimento: entrega." : `Forma de recebimento: retirada na ${pickupStore}.`,
      fulfillmentMethod === "delivery" ? "Taxa de entrega: consultar com os atendentes." : "",
      orderNotes.trim() ? `Observações: ${orderNotes.trim()}` : "",
      "",
      "Podem confirmar a disponibilidade, por favor?",
    ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
    const quantities = Object.fromEntries(cart.map((item) => [cartItemKey(item.product.id, item.variant?.id), item.quantity]));
    window.localStorage.setItem("droga-vida-last-order", JSON.stringify(quantities));
    setLastOrder(quantities);
    window.open(`https://wa.me/5517996630482?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const store = String(data.get("store") || "").trim();
    const message = String(data.get("message") || "").trim();
    const text = [
      "Olá, vim pelo site da Droga Vida Popular.",
      `Nome: ${name}`,
      phone ? `Telefone: ${phone}` : "",
      `Unidade: ${store}`,
      `Mensagem: ${message}`,
    ].filter(Boolean).join("\n");

    window.open(`https://wa.me/5517996630482?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Droga Vida Popular — início">
          <img className="brand-logo" src="/brand/droga-vida-popular-logo.png" alt="Droga Vida Popular" width="1280" height="905" />
        </a>

        <nav className="desktop-nav" aria-label="Navegação principal">
          <a href="#ofertas">Ofertas</a>
          <a href="#servicos">Serviços</a>
          <a href="#lojas">Lojas</a>
          <a href="#contato">Contato</a>
        </nav>

        <div className="header-actions">
          <button className="header-cart" type="button" onClick={() => setCartOpen(true)}>
            Carrinho <span>{cartCount}</span>
          </button>
          <a className="header-action" href={whatsappUrl} target="_blank" rel="noreferrer">Falar no WhatsApp</a>
        </div>
      </header>

      <section className="hero" id="inicio">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Sua farmácia perto de você</p>
          <h1>Cuidado simples.<br />Presença de verdade.</h1>
          <p className="hero-text">Produtos para saúde e bem-estar, ofertas selecionadas e atendimento próximo em duas unidades.</p>
          <div className="hero-actions">
            <a className="button button-primary" href={whatsappUrl} target="_blank" rel="noreferrer">Pedir pelo WhatsApp <span aria-hidden="true">↗</span></a>
            <a className="button button-secondary" href="#ofertas">Ver ofertas</a>
          </div>
          <div className="hero-proof" aria-label="Destaques da farmácia">
            <div><strong>2</strong><span>unidades</span></div>
            <div><strong>+</strong><span>cuidado</span></div>
            <div><strong>1:1</strong><span>atendimento</span></div>
          </div>
        </div>

        <div className="hero-visual" aria-label="Destaque Droga Vida Popular">
          <div className="hero-orbit hero-orbit-one" />
          <div className="hero-orbit hero-orbit-two" />
          <div className="hero-card">
            <span className="hero-card-kicker">Droga Vida Popular</span>
            <div className="hero-symbol" aria-hidden="true">+</div>
            <p>Bem-estar começa<br />com proximidade.</p>
            <div className="hero-card-footer"><span>Saúde</span><span>Beleza</span><span>Conveniência</span></div>
          </div>
          <div className="floating-note note-one"><span>✓</span> Atendimento rápido</div>
          <div className="floating-note note-two"><span>↗</span> Peça pelo WhatsApp</div>
        </div>
      </section>

      <section className="service-strip" aria-label="Benefícios">
        <div><span>01</span><p><strong>Atendimento próximo</strong><small>Uma equipe pronta para ajudar</small></p></div>
        <div><span>02</span><p><strong>Compra fácil</strong><small>Faça seu pedido pelo WhatsApp</small></p></div>
        <div><span>03</span><p><strong>Ofertas selecionadas</strong><small>Economia para sua rotina</small></p></div>
      </section>

      {settings.bannerActive && (
        <section className="weekly-banner" aria-label="Oferta da semana">
          <div>
            <span>{settings.bannerEyebrow}</span>
            <h2>{settings.bannerTitle}</h2>
            <p>{settings.bannerText}</p>
          </div>
          <a href={settings.bannerCtaHref}>{settings.bannerCtaLabel} <span aria-hidden="true">→</span></a>
        </section>
      )}

      <section className="category-showcase" aria-labelledby="category-title">
        <div className="category-showcase-heading">
          <span>Encontre por categoria</span>
          <h2 id="category-title">Tudo o que você precisa,<br />mais fácil de encontrar.</h2>
        </div>
        <div className="category-tile-grid">
          {categories.map((category) => (
            <a href="#ofertas" key={category.name} onClick={() => chooseCategory(category.name)}>
              <span aria-hidden="true">{category.icon}</span>
              <strong>{category.name}</strong>
              <small>{category.subcategories.length} {category.subcategories.length === 1 ? "subcategoria" : "subcategorias"}</small>
            </a>
          ))}
        </div>
      </section>

      <section className="section offers-section" id="ofertas">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span /> Destaques</p>
            <h2>Ofertas para cuidar<br />de você todos os dias.</h2>
          </div>
          <p>Seleção especial de produtos. Consulte disponibilidade e condições com nossa equipe.</p>
        </div>

        <div className="product-search-panel">
          <label className="product-search" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSearchFocused(false);
          }}>
            <span>Pesquisar no catálogo</span>
            <span className="search-input-wrap">
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder="Pesquise por medicamento ou produto"
                aria-label="Pesquisar medicamentos e produtos"
              />
              {searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label="Limpar pesquisa">×</button>}
              {searchFocused && searchQuery && suggestions.length > 0 && (
                <span className="search-suggestions" role="listbox" aria-label="Sugestões de produtos">
                  {suggestions.map((product) => (
                    <button type="button" role="option" aria-selected={false} key={product.id} onClick={() => {
                      setSearchQuery(product.name);
                      setSearchFocused(false);
                    }}>
                      <img src={product.imageUrl} alt="" />
                      <span><strong>{product.name}</strong><small>{product.category} • {product.subcategory}</small></span>
                      <b>→</b>
                    </button>
                  ))}
                </span>
              )}
            </span>
          </label>

          <div className="category-filters" aria-label="Filtrar produtos por categoria">
            <button className={selectedCategory === "Todos" ? "active" : ""} type="button" onClick={() => chooseCategory("Todos")}>Todos</button>
            {categories.map((category) => (
              <button className={selectedCategory === category.name ? "active" : ""} type="button" key={category.name} onClick={() => chooseCategory(category.name)}>{category.name}</button>
            ))}
          </div>

          <div className="product-filter-meta">
            <p><strong>{filteredProducts.length}</strong> {catalogSearchActive || showFavorites ? (filteredProducts.length === 1 ? "produto encontrado" : "produtos encontrados") : (filteredProducts.length === 1 ? "produto em destaque" : "produtos em destaque")}</p>
            <div className="catalog-shortcuts">
              <button className={showFavorites ? "active" : ""} type="button" onClick={() => setShowFavorites((value) => !value)}>♡ Favoritos ({favorites.length})</button>
              {Object.keys(lastOrder).length > 0 && <button type="button" onClick={buyAgain}>↻ Comprar novamente</button>}
            </div>
            {selectedCategory !== "Todos" && (
              <label>
                <span>Subcategoria</span>
                <select value={selectedSubcategory} onChange={(event) => setSelectedSubcategory(event.target.value)}>
                  <option value="Todas">Todas as subcategorias</option>
                  {availableSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.name}>{subcategory.name}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>

        <div className="offer-grid">
          {filteredProducts.map((offer) => {
            const selectedVariant = selectedVariantFor(offer);
            return <article className="offer-card" key={offer.id}>
              <div className={`product-visual ${offer.tone}`}>
                {offer.badge && <span className="discount-pill">{offer.badge}</span>}
                <button className={`favorite-button ${favorites.includes(offer.id) ? "active" : ""}`} type="button" onClick={() => toggleFavorite(offer.id)} aria-label={favorites.includes(offer.id) ? `Remover ${offer.name} dos favoritos` : `Adicionar ${offer.name} aos favoritos`}>{favorites.includes(offer.id) ? "♥" : "♡"}</button>
                <a href={`/produto/${offer.id}`} aria-label={`Ver detalhes de ${offer.name}`}><img className="product-photo" src={offer.imageUrl} alt={`${offer.name} — ${offer.detail}`} /></a>
              </div>
              <div className="offer-card-body">
                <span className="category">{offer.category} • {offer.subcategory}</span>
                <h3><a href={`/produto/${offer.id}`}>{offer.name}</a></h3>
                <p>{offer.detail}</p>
                {(offer.brand || offer.activeIngredient || offer.dosage) && <div className="product-facts">{offer.brand && <span>{offer.brand}</span>}{offer.activeIngredient && <span>{offer.activeIngredient}</span>}{offer.dosage && <span>{offer.dosage}</span>}</div>}
                <div className="store-availability" aria-label="Disponibilidade por loja">{offer.availableStore1 && <span>Loja 1</span>}{offer.availableStore2 && <span>Loja 2</span>}</div>
                {offer.offerEndsAt && <p className="offer-validity">Oferta válida até {new Date(offer.offerEndsAt).toLocaleDateString("pt-BR")}</p>}
                {offer.variants.length > 0 && (
                  <div className="variant-preview">{offer.variants.map((variant) => <span key={variant.id}>{variant.size} • {variant.packageQuantity} un.</span>)}</div>
                )}
                <div className="price-row">
                  <div><del>{money.format(offer.oldPriceCents / 100)}</del><strong>{money.format(offer.priceCents / 100)}</strong></div>
                </div>
                {offer.variants.length > 0 && (
                  <label className="card-variant-picker">
                    <span>Escolha o tamanho</span>
                    <select value={selectedVariant?.id ?? ""} onChange={(event) => setSelectedVariantIds((current) => ({ ...current, [offer.id]: Number(event.target.value) }))}>
                      {offer.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.size} — {variant.packageQuantity} fraldas</option>)}
                    </select>
                  </label>
                )}
                <div className="product-link-row"><a className="product-details-link" href={`/produto/${offer.id}`}>Ver detalhes</a><button type="button" onClick={() => void shareProduct(offer)}>{sharedProductId === offer.id ? "Link copiado ✓" : "Compartilhar ↗"}</button></div>
                <button className="add-cart-button" type="button" onClick={() => addToCart(offer, selectedVariant)}>
                  Adicionar ao carrinho <span aria-hidden="true">+</span>
                </button>
              </div>
            </article>;
          })}
        </div>

        {filteredProducts.length === 0 && (
          <div className="empty-products">
            <span aria-hidden="true">⌕</span>
            <h3>Nenhum produto encontrado.</h3>
            <p>{catalogSearchActive || showFavorites ? "Tente outro nome ou limpe os filtros para voltar aos destaques." : "Não há produtos em destaque nesta seleção. Pesquise pelo nome para consultar o catálogo completo."}</p>
            <div>
              <button type="button" onClick={clearProductFilters}>Limpar pesquisa</button>
              <a href={whatsappUrl} target="_blank" rel="noreferrer">Consultar pelo WhatsApp ↗</a>
            </div>
          </div>
        )}

        <div className="offer-note">
          <p>* Imagens ilustrativas. Preços e estoque sujeitos à confirmação nas lojas.</p>
          <a href={whatsappUrl} target="_blank" rel="noreferrer">Consultar todos os produtos <span>→</span></a>
        </div>
      </section>

      <section className="section care-section" id="servicos">
        <div className="care-panel">
          <div className="care-copy">
            <p className="eyebrow light"><span /> Do seu jeito</p>
            <h2>Mais facilidade<br />para cuidar da saúde.</h2>
            <p>Do primeiro contato à retirada, nossa equipe oferece uma experiência simples, humana e segura.</p>
            <a href="#contato">Quero atendimento <span>→</span></a>
          </div>
          <div className="care-list">
            <div><span>01</span><p><strong>Teleatendimento</strong><small>Tire dúvidas e consulte produtos pelo WhatsApp.</small></p></div>
            <div><span>02</span><p><strong>Teleentrega</strong><small>Consulte disponibilidade e área de atendimento.</small></p></div>
            <div><span>03</span><p><strong>Orientação farmacêutica</strong><small>Atendimento responsável para ajudar na sua rotina.</small></p></div>
          </div>
        </div>
      </section>

      <section className="section locations-section" id="lojas">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow"><span /> Onde estamos</p>
            <h2>Duas unidades.<br />O mesmo cuidado.</h2>
          </div>
          <p>Escolha a unidade mais próxima e fale diretamente com a nossa equipe.</p>
        </div>

        <div className="location-grid">
          {storeCards.map((store, index) => {
            const status = getStoreOpenStatus(store.schedule, currentTime, store.specialHours);
            const orderedDays = weekdaysStartingAt(status?.dayKey);
            const upcomingSpecialHours = currentTime ? store.specialHours.filter((entry) => entry.date > saoPauloDateKey(currentTime)).slice(0, 3) : [];
            return (
              <article className={`location-card ${store.imageUrl ? "has-photo" : ""}`} key={store.name} style={store.imageUrl ? { backgroundImage: `linear-gradient(90deg, rgba(55,7,10,.9), rgba(94,10,16,.72)), url("${store.imageUrl}")` } : undefined}>
                <div className="location-number">0{index + 1}</div>
                <div className="location-content">
                  <h3>{store.name}</h3>
                  <div className={`store-hours-widget ${status?.isOpen === true ? "open" : status?.isOpen === false ? "closed" : "unknown"}`}>
                    <div className="store-live-status"><strong>{status?.statusLabel ?? "Confira os horários"}</strong><span>{status?.todayHours ?? "Horários da semana"}</span></div>
                    {status?.isSpecial && <div className="today-special-hours"><strong>Horário especial de hoje</strong>{status.specialNote && <span>{status.specialNote}</span>}</div>}
                    <details>
                      <summary>Ver horários da semana <span aria-hidden="true">⌄</span></summary>
                      <div className="weekly-hours-list">
                        {orderedDays.map((day) => <div className={day.key === status?.dayKey ? "today" : ""} key={day.key}><span>{day.label}</span><strong>{formatDayHours(store.schedule[day.key])}</strong></div>)}
                      </div>
                    </details>
                    {upcomingSpecialHours.length > 0 && <div className="public-special-hours"><strong>Próximas datas especiais</strong>{upcomingSpecialHours.map((entry) => <div key={entry.id}><span>{formatSpecialHoursDate(entry.date)}{entry.note ? ` • ${entry.note}` : ""}</span><b>{formatDayHours(entry)}</b></div>)}</div>}
                  </div>
                  <p>{store.address}</p>
                  <a className="phone-link" href={`tel:${store.tel}`}>{store.phone}</a>
                  <div className="location-actions">
                    <a href={store.map} target="_blank" rel="noreferrer">Ver no mapa ↗</a>
                    {index === 1 && <a href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp ↗</a>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section contact-section" id="contato">
        <div className="contact-copy">
          <p className="eyebrow"><span /> Fale conosco</p>
          <h2>Como podemos<br />ajudar hoje?</h2>
          <p>Preencha os dados e sua mensagem será preparada para envio pelo WhatsApp.</p>
          <div className="contact-detail"><span>Atendimento</span><strong>(17) 99663-0482</strong></div>
        </div>

        <form className="contact-form" onSubmit={handleSubmit}>
          <label><span>Seu nome</span><input name="name" placeholder="Como podemos chamar você?" required /></label>
          <label><span>Telefone</span><input name="phone" type="tel" inputMode="tel" placeholder="(17) 99999-9999" /></label>
          <label>
            <span>Unidade</span>
            <select name="store" defaultValue="Loja 2 — Residencial Nature 1"><option>Loja 1 — Solo Sagrado</option><option>Loja 2 — Residencial Nature 1</option></select>
          </label>
          <label><span>Mensagem</span><textarea name="message" rows={4} placeholder="Conte o que você precisa" required /></label>
          <button className="button button-primary" type="submit">Enviar pelo WhatsApp <span>↗</span></button>
          <small>Ao enviar, você será direcionado ao WhatsApp para concluir o contato.</small>
        </form>
      </section>

      <footer>
        <div className="brand footer-brand"><img className="brand-logo" src="/brand/droga-vida-popular-logo.png" alt="Droga Vida Popular" width="1280" height="905" /></div>
        <p>Saúde, cuidado e economia mais perto de você.</p>
        <div className="footer-links"><a href="#ofertas">Ofertas</a><a href="#lojas">Lojas</a><a href="#contato">Contato</a><a href="/admin">Área administrativa</a></div>
        <small className="footer-meta">
          <span>© 2026 Droga Vida Popular. Todos os direitos reservados.</span>
          <span>Site desenvolvido por <strong>Erick</strong></span>
        </small>
      </footer>

      <nav className="mobile-bottom-nav" aria-label="Atalhos no celular">
        <a href="#inicio"><span aria-hidden="true">⌂</span>Início</a>
        <a href="#ofertas"><span aria-hidden="true">⌕</span>Buscar</a>
        <button type="button" onClick={() => setShowFavorites(true)}><span aria-hidden="true">♡</span>Favoritos</button>
        <button type="button" onClick={() => setCartOpen(true)}><span aria-hidden="true">▣</span>Carrinho{cartCount ? ` (${cartCount})` : ""}</button>
        {installPrompt ? <button type="button" onClick={() => void installApp()}><span aria-hidden="true">↓</span>Instalar</button> : <a href={whatsappUrl} target="_blank" rel="noreferrer"><span aria-hidden="true">↗</span>WhatsApp</a>}
      </nav>

      {cartOpen && (
        <div className="cart-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCartOpen(false);
        }}>
          <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <div className="cart-header">
              <div>
                <span>Seu pedido</span>
                <h2 id="cart-title">Carrinho</h2>
              </div>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Fechar carrinho">×</button>
            </div>

            <div className="cart-content">
              {cart.length === 0 ? (
                <div className="cart-empty">
                  <strong>Seu carrinho está vazio.</strong>
                  <p>Adicione uma oferta para preparar o pedido.</p>
                  <button type="button" onClick={() => setCartOpen(false)}>Ver produtos</button>
                </div>
              ) : (
                <div className="cart-items">
                  {cart.map((item) => (
                    <article className="cart-item" key={cartItemKey(item.product.id, item.variant?.id)}>
                      <img src={item.product.imageUrl} alt="" />
                      <div className="cart-item-copy">
                        <strong>{item.product.name}</strong>
                        {item.variant && <small>Tamanho {item.variant.size} • pacote com {item.variant.packageQuantity} fraldas</small>}
                        <span>{money.format(item.product.priceCents / 100)} cada</span>
                        <div className="quantity-control" aria-label={`Quantidade de ${item.product.name}${item.variant ? ` tamanho ${item.variant.size}` : ""}`}>
                          <button type="button" onClick={() => changeQuantity(cartItemKey(item.product.id, item.variant?.id), -1)} aria-label="Diminuir quantidade">−</button>
                          <span>{item.quantity}</span>
                          <button type="button" onClick={() => changeQuantity(cartItemKey(item.product.id, item.variant?.id), 1)} aria-label="Aumentar quantidade">+</button>
                        </div>
                      </div>
                      <strong className="cart-line-price">{money.format((item.product.priceCents * item.quantity) / 100)}</strong>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="cart-footer">
              <div className="fulfillment-picker">
                <span>Como deseja receber?</span>
                <div>
                  <button className={fulfillmentMethod === "delivery" ? "active" : ""} type="button" onClick={() => setFulfillmentMethod("delivery")}>Entrega</button>
                  <button className={fulfillmentMethod === "pickup" ? "active" : ""} type="button" onClick={() => setFulfillmentMethod("pickup")}>Retirada</button>
                </div>
                {fulfillmentMethod === "pickup" && (
                  <label><span>Escolha a loja</span><select value={pickupStore} onChange={(event) => setPickupStore(event.target.value)}><option>Loja 1 — Solo Sagrado</option><option>Loja 2 — Residencial Nature 1</option></select></label>
                )}
                <label><span>Observações do pedido</span><textarea value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} rows={2} maxLength={300} placeholder="Ex.: separar para retirar no fim da tarde" /></label>
              </div>
              {fulfillmentMethod === "delivery" && <div className="delivery-note"><span aria-hidden="true">⌂</span><p><strong>Taxa de entrega</strong>Consulte a taxa de entrega com nossos atendentes.</p></div>}
              <div className="cart-total"><span>Subtotal dos produtos</span><strong>{money.format(subtotalCents / 100)}</strong></div>
              <button className="cart-checkout" type="button" onClick={finishCart} disabled={!cart.length}>
                Finalizar pelo WhatsApp <span aria-hidden="true">↗</span>
              </button>
              <small>Disponibilidade, valores e entrega serão confirmados por nossa equipe.</small>
            </div>
          </aside>
        </div>
      )}

      <a className="whatsapp-float" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="Falar com a Droga Vida Popular pelo WhatsApp"><span aria-hidden="true">↗</span><strong>WhatsApp</strong></a>
    </main>
  );
}
