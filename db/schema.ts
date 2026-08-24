import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const catalogCategories = sqliteTable("catalog_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  icon: text("icon").notNull().default("+"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const catalogSubcategories = sqliteTable("catalog_subcategories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id").notNull().references(() => catalogCategories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("catalog_subcategory_category_name_unique").on(table.categoryId, table.name)]);

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull().default(""),
  name: text("name").notNull(),
  brand: text("brand").notNull().default(""),
  activeIngredient: text("active_ingredient").notNull().default(""),
  dosage: text("dosage").notNull().default(""),
  barcode: text("barcode").notNull().default(""),
  registration: text("registration").notNull().default(""),
  detail: text("detail").notNull().default(""),
  oldPriceCents: integer("old_price_cents").notNull(),
  priceCents: integer("price_cents").notNull(),
  stockQuantity: integer("stock_quantity").notNull().default(10),
  badge: text("badge").notNull().default("Oferta"),
  tone: text("tone").notNull().default("amber"),
  imageUrl: text("image_url").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  featured: integer("featured", { mode: "boolean" }).notNull().default(true),
  availableStore1: integer("available_store_1", { mode: "boolean" }).notNull().default(true),
  availableStore2: integer("available_store_2", { mode: "boolean" }).notNull().default(true),
  offerStartsAt: text("offer_starts_at"),
  offerEndsAt: text("offer_ends_at"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const productVariants = sqliteTable("product_variants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  size: text("size").notNull(),
  packageQuantity: integer("package_quantity").notNull(),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const productMetrics = sqliteTable("product_metrics", {
  productId: integer("product_id").primaryKey().references(() => products.id, { onDelete: "cascade" }),
  views: integer("views").notNull().default(0),
  cartAdds: integer("cart_adds").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const searchAnalytics = sqliteTable("search_analytics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  normalizedQuery: text("normalized_query").notNull(),
  query: text("query").notNull(),
  searchCount: integer("search_count").notNull().default(1),
  lastSearchedAt: text("last_searched_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("search_analytics_normalized_query_unique").on(table.normalizedQuery)]);

export const siteSettings = sqliteTable("site_settings", {
  id: integer("id").primaryKey(),
  bannerActive: integer("banner_active", { mode: "boolean" }).notNull().default(true),
  bannerEyebrow: text("banner_eyebrow").notNull().default("Oferta da semana"),
  bannerTitle: text("banner_title").notNull().default("Economize cuidando de quem você ama."),
  bannerText: text("banner_text").notNull().default("Produtos selecionados com condições especiais por tempo limitado."),
  bannerCtaLabel: text("banner_cta_label").notNull().default("Ver ofertas"),
  bannerCtaHref: text("banner_cta_href").notNull().default("#ofertas"),
  store1Hours: text("store_1_hours").notNull().default("Horário a confirmar"),
  store1ImageUrl: text("store_1_image_url").notNull().default(""),
  store2Hours: text("store_2_hours").notNull().default("Horário a confirmar"),
  store2ImageUrl: text("store_2_image_url").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const storeSpecialHours = sqliteTable("store_special_hours", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storeNumber: integer("store_number").notNull(),
  date: text("date").notNull(),
  closed: integer("closed", { mode: "boolean" }).notNull().default(false),
  opens: text("opens").notNull().default(""),
  closes: text("closes").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("store_special_hours_store_date_unique").on(table.storeNumber, table.date)]);

export const adminUsers = sqliteTable("admin_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("editor"),
  canManageProducts: integer("can_manage_products", { mode: "boolean" }).notNull().default(true),
  canManageContent: integer("can_manage_content", { mode: "boolean" }).notNull().default(false),
  canViewAnalytics: integer("can_view_analytics", { mode: "boolean" }).notNull().default(false),
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  ownerGuard: integer("owner_guard").unique(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adminSessions = sqliteTable("admin_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => adminUsers.id, { onDelete: "set null" }),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
