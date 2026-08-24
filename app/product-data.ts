import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { productVariants, products } from "@/db/schema";

export type ProductVariant = {
  id: number;
  productId: number;
  size: string;
  packageQuantity: number;
  stockQuantity: number;
  sortOrder: number;
};

export type Product = {
  id: number;
  category: string;
  subcategory: string;
  name: string;
  brand: string;
  activeIngredient: string;
  dosage: string;
  barcode: string;
  registration: string;
  detail: string;
  oldPriceCents: number;
  priceCents: number;
  stockQuantity: number;
  badge: string;
  tone: string;
  imageUrl: string;
  active: boolean;
  featured: boolean;
  availableStore1: boolean;
  availableStore2: boolean;
  offerStartsAt: string | null;
  offerEndsAt: string | null;
  sortOrder: number;
  variants: ProductVariant[];
};

export const fallbackProducts: Product[] = [
  { id: 1, category: "Suplementos", subcategory: "Polivitamínicos", name: "Vitergan Master-N", brand: "Cimed", activeIngredient: "", dosage: "", barcode: "", registration: "", detail: "30 comprimidos", oldPriceCents: 11029, priceCents: 7499, stockQuantity: 1, badge: "Oferta", tone: "mint", imageUrl: "/products/vitergan-master-n.jpg", active: true, featured: true, availableStore1: true, availableStore2: true, offerStartsAt: null, offerEndsAt: null, sortOrder: 1, variants: [] },
  { id: 2, category: "Perfumaria e Cuidados Pessoais", subcategory: "Cuidados com a pele", name: "Nivea Aqua Rose", brand: "Nivea", activeIngredient: "", dosage: "", barcode: "", registration: "", detail: "Tônico facial • 200 ml", oldPriceCents: 2599, priceCents: 1999, stockQuantity: 10, badge: "Oferta", tone: "rose", imageUrl: "/products/nivea-aqua-rose.jpg", active: true, featured: true, availableStore1: true, availableStore2: true, offerStartsAt: null, offerEndsAt: null, sortOrder: 2, variants: [] },
  { id: 3, category: "Suplementos", subcategory: "Ômega e ácidos graxos", name: "Ômega 3 Catarinense", brand: "Catarinense", activeIngredient: "Ômega 3", dosage: "1000 mg", barcode: "", registration: "", detail: "1000 mg • 120 cápsulas", oldPriceCents: 8029, priceCents: 6999, stockQuantity: 10, badge: "Mais vendido", tone: "amber", imageUrl: "/products/omega-3-catarinense.png", active: true, featured: true, availableStore1: true, availableStore2: true, offerStartsAt: null, offerEndsAt: null, sortOrder: 3, variants: [] },
  { id: 4, category: "Saúde e Bem-estar", subcategory: "Aparelhos de saúde", name: "Omron HEM-7122", brand: "Omron", activeIngredient: "", dosage: "", barcode: "", registration: "", detail: "Medidor de pressão digital", oldPriceCents: 26196, priceCents: 25199, stockQuantity: 10, badge: "Oferta", tone: "blue", imageUrl: "/products/omron-hem-7122.webp", active: true, featured: true, availableStore1: true, availableStore2: true, offerStartsAt: null, offerEndsAt: null, sortOrder: 4, variants: [] },
];

export function isProductVisible(product: Pick<Product, "active" | "offerStartsAt" | "offerEndsAt">, now = new Date()) {
  if (!product.active) return false;
  const starts = product.offerStartsAt ? new Date(product.offerStartsAt).getTime() : null;
  const ends = product.offerEndsAt ? new Date(product.offerEndsAt).getTime() : null;
  const current = now.getTime();
  return !(starts !== null && Number.isFinite(starts) && current < starts)
    && !(ends !== null && Number.isFinite(ends) && current > ends);
}

export function stockLabel(product: Pick<Product, "stockQuantity" | "variants">) {
  if (product.variants.length) {
    const availableSizes = product.variants.filter((variant) => variant.stockQuantity > 0).length;
    if (availableSizes === 0) return "Todos os tamanhos esgotados";
    if (availableSizes === 1) return "1 tamanho disponível";
    return `${availableSizes} tamanhos disponíveis`;
  }
  if (product.stockQuantity <= 0) return "Esgotado";
  if (product.stockQuantity === 1) return "Última unidade";
  if (product.stockQuantity <= 3) return `Últimas ${product.stockQuantity} unidades`;
  return "Produto disponível";
}

async function attachVariants<T extends Omit<Product, "variants">>(rows: T[]): Promise<Product[]> {
  if (!rows.length) return [];
  const variants = await getDb().select().from(productVariants).orderBy(asc(productVariants.sortOrder), asc(productVariants.id));
  const byProduct = new Map<number, ProductVariant[]>();
  variants.forEach((variant) => byProduct.set(variant.productId, [...(byProduct.get(variant.productId) ?? []), variant]));
  return rows.map((product) => ({ ...product, variants: byProduct.get(product.id) ?? [] }));
}

export async function listPublicProducts(): Promise<Product[]> {
  try {
    const rows = await getDb()
      .select()
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.sortOrder), asc(products.id));
    return rows.length ? (await attachVariants(rows)).filter((product) => isProductVisible(product)) : fallbackProducts;
  } catch {
    return fallbackProducts;
  }
}

export async function listAllProducts(): Promise<Product[]> {
  const rows = await getDb()
    .select()
    .from(products)
    .orderBy(asc(products.sortOrder), asc(products.id));
  return attachVariants(rows);
}

export async function getPublicProduct(productId: number): Promise<Product | null> {
  try {
    const [row] = await getDb()
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!row) return null;
    const product = (await attachVariants([row]))[0] ?? null;
    return product && isProductVisible(product) ? product : null;
  } catch {
    return fallbackProducts.find((product) => product.id === productId && product.active) ?? null;
  }
}
