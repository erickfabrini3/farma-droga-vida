import { asc, and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogCategories, catalogSubcategories } from "@/db/schema";

export type CatalogSubcategory = {
  id: number;
  categoryId: number;
  name: string;
  active: boolean;
  sortOrder: number;
};

export type CatalogCategory = {
  id: number;
  name: string;
  icon: string;
  active: boolean;
  sortOrder: number;
  subcategories: CatalogSubcategory[];
};

function fallbackCategory(id: number, name: string, icon: string, sortOrder: number, names: string[]): CatalogCategory {
  return {
    id,
    name,
    icon,
    active: true,
    sortOrder,
    subcategories: names.map((subcategoryName, index) => ({ id: id * 100 - index, categoryId: id, name: subcategoryName, active: true, sortOrder: (index + 1) * 10 })),
  };
}

export const DEFAULT_PRODUCT_CATEGORIES: CatalogCategory[] = [
  fallbackCategory(-1, "Área Infantil", "🍼", 10, ["Fraldas", "Lenços umedecidos", "Higiene infantil", "Mamadeiras e acessórios", "Chupetas", "Fórmulas infantis"]),
  fallbackCategory(-2, "Suplementos", "🍊", 20, ["Polivitamínicos", "Cabelo, pele e unhas", "Ômega e ácidos graxos", "Vitaminas e minerais", "Nutrição esportiva"]),
  fallbackCategory(-3, "Medicamentos", "💊", 30, ["Resfriado e gripe", "Dor e febre", "Alergias", "Digestão", "Primeiros socorros", "Outros medicamentos"]),
  fallbackCategory(-4, "Perfumaria e Cuidados Pessoais", "🧴", 40, ["Hidratantes", "Higiene pessoal", "Cuidados com a pele", "Shampoo e condicionador", "Tinturas e tonalizantes", "Desodorantes"]),
  fallbackCategory(-5, "Saúde e Bem-estar", "❤️", 50, ["Aparelhos de saúde", "Cuidados diários", "Diabetes"]),
];

const categoryEmojiByName: Record<string, string> = Object.fromEntries(DEFAULT_PRODUCT_CATEGORIES.map((category) => [category.name, category.icon]));

export async function listCatalogCategories(includeInactive = false): Promise<CatalogCategory[]> {
  try {
    const db = getDb();
    const categoryRows = await db.select().from(catalogCategories).orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.id));
    if (!categoryRows.length) return DEFAULT_PRODUCT_CATEGORIES;
    const subcategoryRows = await db.select().from(catalogSubcategories).orderBy(asc(catalogSubcategories.sortOrder), asc(catalogSubcategories.id));
    return categoryRows
      .filter((category) => includeInactive || category.active)
      .map((category) => ({
        ...category,
        icon: categoryEmojiByName[category.name] ?? category.icon,
        subcategories: subcategoryRows
          .filter((subcategory) => subcategory.categoryId === category.id && (includeInactive || subcategory.active))
          .map((subcategory) => ({ ...subcategory })),
      }));
  } catch {
    return DEFAULT_PRODUCT_CATEGORIES;
  }
}

export function subcategoriesFor(categories: CatalogCategory[], categoryName: string, includeInactive = false) {
  return categories.find((category) => category.name === categoryName)?.subcategories.filter((subcategory) => includeInactive || subcategory.active) ?? [];
}

export async function isValidCategoryPair(categoryName: string, subcategoryName: string) {
  try {
    const db = getDb();
    const [category] = await db.select({ id: catalogCategories.id }).from(catalogCategories).where(eq(catalogCategories.name, categoryName)).limit(1);
    if (!category) return false;
    const [subcategory] = await db.select({ id: catalogSubcategories.id }).from(catalogSubcategories).where(and(eq(catalogSubcategories.categoryId, category.id), eq(catalogSubcategories.name, subcategoryName))).limit(1);
    return Boolean(subcategory);
  } catch {
    return DEFAULT_PRODUCT_CATEGORIES.some((item) => item.name === categoryName && item.subcategories.some((subcategory) => subcategory.name === subcategoryName));
  }
}
