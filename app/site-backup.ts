import { getDb } from "@/db";
import {
  adminUsers,
  auditLogs,
  catalogCategories,
  catalogSubcategories,
  productMetrics,
  products,
  productVariants,
  searchAnalytics,
  siteSettings,
  storeSpecialHours,
} from "@/db/schema";
import { getRuntimeEnv } from "@/runtime-env";
import {
  readUploadedImageForBackup,
  removeUploadedImage,
  restoreUploadedImageFromBackup,
  type BackupImage,
} from "./product-images";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const backupMagic = encoder.encode("DVPBACKUP1");
const backupIterations = 100_000;
const maximumBackupBytes = 75 * 1024 * 1024;

type BackupTables = {
  catalogCategories: Array<typeof catalogCategories.$inferSelect>;
  catalogSubcategories: Array<typeof catalogSubcategories.$inferSelect>;
  products: Array<typeof products.$inferSelect>;
  productVariants: Array<typeof productVariants.$inferSelect>;
  productMetrics: Array<typeof productMetrics.$inferSelect>;
  searchAnalytics: Array<typeof searchAnalytics.$inferSelect>;
  siteSettings: Array<typeof siteSettings.$inferSelect>;
  storeSpecialHours: Array<typeof storeSpecialHours.$inferSelect>;
  adminUsers: Array<typeof adminUsers.$inferSelect>;
  auditLogs: Array<typeof auditLogs.$inferSelect>;
};

export type SiteBackupPayload = {
  format: "droga-vida-popular-backup";
  version: 1;
  createdAt: string;
  tables: BackupTables;
  images: BackupImage[];
};

type OwnerRecord = typeof adminUsers.$inferSelect;
type D1Value = string | number | null;
type D1Statement = { bind(...values: D1Value[]): D1Statement };
type D1Database = {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
};

function validateBackupPassword(password: string) {
  if (password.length < 12 || password.length > 128 || !/[A-Za-zÀ-ÿ]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("A senha do backup precisa ter pelo menos 12 caracteres, com letras e números.");
  }
}

async function backupKey(password: string, salt: Uint8Array<ArrayBuffer>, usages: KeyUsage[]) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: backupIterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

function combineBytes(...parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function dynamicImageUrls(tables: Pick<BackupTables, "products" | "siteSettings">) {
  const urls = [
    ...tables.products.map((product) => product.imageUrl),
    ...tables.siteSettings.flatMap((settings) => [settings.store1ImageUrl, settings.store2ImageUrl]),
  ];
  return [...new Set(urls.filter((url) => url.startsWith("/api/product-image?") || url.startsWith("/api/store-image?")))];
}

async function collectImages(urls: string[]) {
  const images: BackupImage[] = [];
  for (let offset = 0; offset < urls.length; offset += 4) {
    const batch = await Promise.all(urls.slice(offset, offset + 4).map((url) => readUploadedImageForBackup(url)));
    images.push(...batch.filter((image): image is BackupImage => Boolean(image)));
  }
  return images;
}

export async function createSiteBackup(): Promise<SiteBackupPayload> {
  const db = getDb();
  const [categoryRows, subcategoryRows, productRows, variantRows, metricRows, searchRows, settingsRows, specialHoursRows, userRows, auditRows] = await Promise.all([
    db.select().from(catalogCategories),
    db.select().from(catalogSubcategories),
    db.select().from(products),
    db.select().from(productVariants),
    db.select().from(productMetrics),
    db.select().from(searchAnalytics),
    db.select().from(siteSettings),
    db.select().from(storeSpecialHours),
    db.select().from(adminUsers),
    db.select().from(auditLogs),
  ]);
  const tables: BackupTables = {
    catalogCategories: categoryRows,
    catalogSubcategories: subcategoryRows,
    products: productRows,
    productVariants: variantRows,
    productMetrics: metricRows,
    searchAnalytics: searchRows,
    siteSettings: settingsRows,
    storeSpecialHours: specialHoursRows,
    adminUsers: userRows,
    auditLogs: auditRows,
  };
  return {
    format: "droga-vida-popular-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    tables,
    images: await collectImages(dynamicImageUrls(tables)),
  };
}

export async function encryptSiteBackup(payload: SiteBackupPayload, password: string) {
  validateBackupPassword(password);
  const plaintext = encoder.encode(JSON.stringify(payload));
  if (plaintext.length > maximumBackupBytes) throw new Error("O backup excedeu o limite seguro de 75 MB.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await backupKey(password, salt, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return combineBytes(backupMagic, salt, iv, ciphertext);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateBackupPayload(value: unknown): asserts value is SiteBackupPayload {
  if (!isObject(value) || value.format !== "droga-vida-popular-backup" || value.version !== 1 || typeof value.createdAt !== "string") {
    throw new Error("Este arquivo não é um backup válido da Droga Vida Popular.");
  }
  if (!isObject(value.tables) || !Array.isArray(value.images)) throw new Error("A estrutura do backup está incompleta.");
  if (!Array.isArray(value.tables.searchAnalytics)) value.tables.searchAnalytics = [];
  if (!Array.isArray(value.tables.storeSpecialHours)) value.tables.storeSpecialHours = [];
  const limits: Record<keyof BackupTables, number> = {
    catalogCategories: 100,
    catalogSubcategories: 1_000,
    products: 1_000,
    productVariants: 5_000,
    productMetrics: 1_000,
    searchAnalytics: 500,
    siteSettings: 1,
    storeSpecialHours: 1_500,
    adminUsers: 50,
    auditLogs: 5_000,
  };
  for (const [table, limit] of Object.entries(limits) as Array<[keyof BackupTables, number]>) {
    const rows = value.tables[table];
    if (!Array.isArray(rows) || rows.length > limit || rows.some((row) => !isObject(row))) throw new Error(`A tabela ${table} do backup é inválida.`);
  }
  const tables = value.tables as unknown as BackupTables;
  if (tables.catalogCategories.length === 0) throw new Error("O backup não possui categorias do catálogo.");
  const owners = tables.adminUsers.filter((user) => user.role === "owner" && user.ownerGuard === 1);
  if (owners.length !== 1) throw new Error("O backup não possui uma conta proprietária válida.");
  const referencedImages = new Set(dynamicImageUrls(tables));
  const imageSources = new Set<string>();
  let estimatedImageBytes = 0;
  for (const image of value.images) {
    if (!isObject(image) || typeof image.sourceUrl !== "string" || typeof image.contentType !== "string" || typeof image.data !== "string" || imageSources.has(image.sourceUrl)) {
      throw new Error("A lista de imagens do backup é inválida.");
    }
    if (!referencedImages.has(image.sourceUrl)) throw new Error("O backup contém uma imagem sem vínculo com o site.");
    imageSources.add(image.sourceUrl);
    estimatedImageBytes += Math.floor(image.data.length * 0.75);
  }
  if (estimatedImageBytes > 60 * 1024 * 1024) throw new Error("As imagens do backup excedem o limite seguro de 60 MB.");
  for (const url of referencedImages) {
    if (!imageSources.has(url)) throw new Error("O backup está incompleto: uma imagem enviada está ausente.");
  }
  for (const product of tables.products) {
    if (typeof product.imageUrl !== "string" || (!product.imageUrl.startsWith("/products/") && !product.imageUrl.startsWith("/brand/") && !product.imageUrl.startsWith("/api/product-image?"))) {
      throw new Error("O backup contém uma referência de produto não permitida.");
    }
  }
  for (const settings of tables.siteSettings) {
    for (const imageUrl of [settings.store1ImageUrl, settings.store2ImageUrl]) {
      if (typeof imageUrl !== "string" || (imageUrl && !imageUrl.startsWith("/api/store-image?"))) throw new Error("O backup contém uma referência de loja não permitida.");
    }
  }
}

export async function decryptSiteBackup(file: ArrayBuffer, password: string) {
  validateBackupPassword(password);
  const bytes = new Uint8Array(file);
  if (bytes.length < backupMagic.length + 16 + 12 + 16 || bytes.length > maximumBackupBytes + 128) throw new Error("O arquivo de backup é inválido ou muito grande.");
  if (!backupMagic.every((byte, index) => bytes[index] === byte)) throw new Error("Arquivo não reconhecido. Escolha um backup .dvpbackup.");
  const salt = bytes.slice(backupMagic.length, backupMagic.length + 16);
  const iv = bytes.slice(backupMagic.length + 16, backupMagic.length + 28);
  const ciphertext = bytes.slice(backupMagic.length + 28);
  let plaintext: ArrayBuffer;
  try {
    const key = await backupKey(password, salt, ["decrypt"]);
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  } catch {
    throw new Error("A senha do backup está incorreta ou o arquivo foi alterado.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error("O conteúdo do backup está corrompido.");
  }
  validateBackupPayload(parsed);
  return parsed;
}

export function preserveCurrentOwner(payload: SiteBackupPayload, currentOwner: OwnerRecord) {
  const backupOwner = payload.tables.adminUsers.find((user) => user.role === "owner" && user.ownerGuard === 1);
  if (!backupOwner) throw new Error("A conta proprietária não foi encontrada no backup.");
  if (payload.tables.adminUsers.some((user) => user.id !== backupOwner.id && user.username === currentOwner.username)) {
    throw new Error("O backup possui outro acesso com o mesmo usuário da conta proprietária atual.");
  }
  const owner: OwnerRecord = {
    ...backupOwner,
    username: currentOwner.username,
    displayName: currentOwner.displayName,
    passwordHash: currentOwner.passwordHash,
    role: "owner",
    canManageProducts: true,
    canManageContent: true,
    canViewAnalytics: true,
    totpSecret: currentOwner.totpSecret,
    totpEnabled: currentOwner.totpEnabled,
    ownerGuard: 1,
    active: true,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: currentOwner.lastLoginAt,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...payload,
    tables: {
      ...payload.tables,
      adminUsers: payload.tables.adminUsers.map((user) => user.id === backupOwner.id ? owner : user),
    },
  };
}

export async function materializeBackupImages(payload: SiteBackupPayload) {
  const mapping = new Map<string, string>();
  const createdUrls: string[] = [];
  try {
    for (let offset = 0; offset < payload.images.length; offset += 4) {
      const images = payload.images.slice(offset, offset + 4);
      const urls = await Promise.all(images.map((image) => restoreUploadedImageFromBackup(image)));
      urls.forEach((url, index) => {
        mapping.set(images[index].sourceUrl, url);
        createdUrls.push(url);
      });
    }
  } catch (error) {
    await Promise.allSettled(createdUrls.map((url) => removeUploadedImage(url)));
    throw error;
  }
  return {
    payload: {
      ...payload,
      tables: {
        ...payload.tables,
        products: payload.tables.products.map((product) => ({ ...product, imageUrl: mapping.get(product.imageUrl) ?? product.imageUrl })),
        siteSettings: payload.tables.siteSettings.map((settings) => ({
          ...settings,
          store1ImageUrl: mapping.get(settings.store1ImageUrl) ?? settings.store1ImageUrl,
          store2ImageUrl: mapping.get(settings.store2ImageUrl) ?? settings.store2ImageUrl,
        })),
      },
    },
    createdUrls,
  };
}

function d1Database() {
  const database = getRuntimeEnv().DB as D1Database | undefined;
  if (!database?.prepare || !database.batch) throw new Error("O banco de dados não está disponível para restauração.");
  return database;
}

function value(input: unknown): D1Value {
  if (input === null || input === undefined) return null;
  if (typeof input === "boolean") return input ? 1 : 0;
  if (typeof input === "string" || typeof input === "number") return input;
  throw new Error("O backup contém um valor incompatível com o banco de dados.");
}

function insertStatement(database: D1Database, table: string, columns: string[], values: unknown[]) {
  const fields = columns.map((column) => `\`${column}\``).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  return database.prepare(`INSERT INTO \`${table}\` (${fields}) VALUES (${placeholders})`).bind(...values.map(value));
}

export async function restoreBackupTables(payload: SiteBackupPayload) {
  const database = d1Database();
  const statements: D1Statement[] = [
    database.prepare("DELETE FROM `admin_sessions`"),
    database.prepare("DELETE FROM `audit_logs`"),
    database.prepare("DELETE FROM `search_analytics`"),
    database.prepare("DELETE FROM `store_special_hours`"),
    database.prepare("DELETE FROM `product_metrics`"),
    database.prepare("DELETE FROM `product_variants`"),
    database.prepare("DELETE FROM `products`"),
    database.prepare("DELETE FROM `catalog_subcategories`"),
    database.prepare("DELETE FROM `catalog_categories`"),
    database.prepare("DELETE FROM `site_settings`"),
    database.prepare("DELETE FROM `admin_users`"),
    database.prepare("DELETE FROM `sqlite_sequence` WHERE `name` IN ('catalog_categories','catalog_subcategories','products','product_variants','search_analytics','store_special_hours','admin_users','admin_sessions','audit_logs')"),
  ];

  for (const row of payload.tables.catalogCategories) statements.push(insertStatement(database, "catalog_categories", ["id", "name", "icon", "active", "sort_order", "created_at", "updated_at"], [row.id, row.name, row.icon, row.active, row.sortOrder, row.createdAt, row.updatedAt]));
  for (const row of payload.tables.catalogSubcategories) statements.push(insertStatement(database, "catalog_subcategories", ["id", "category_id", "name", "active", "sort_order", "created_at", "updated_at"], [row.id, row.categoryId, row.name, row.active, row.sortOrder, row.createdAt, row.updatedAt]));
  for (const row of payload.tables.products) statements.push(insertStatement(database, "products", ["id", "category", "subcategory", "name", "brand", "active_ingredient", "dosage", "barcode", "registration", "detail", "old_price_cents", "price_cents", "stock_quantity", "badge", "tone", "image_url", "active", "featured", "available_store_1", "available_store_2", "offer_starts_at", "offer_ends_at", "sort_order", "created_at", "updated_at"], [row.id, row.category, row.subcategory, row.name, row.brand, row.activeIngredient, row.dosage, row.barcode, row.registration, row.detail, row.oldPriceCents, row.priceCents, row.stockQuantity, row.badge, row.tone, row.imageUrl, row.active, row.featured ?? true, row.availableStore1, row.availableStore2, row.offerStartsAt, row.offerEndsAt, row.sortOrder, row.createdAt, row.updatedAt]));
  for (const row of payload.tables.productVariants) statements.push(insertStatement(database, "product_variants", ["id", "product_id", "size", "package_quantity", "stock_quantity", "sort_order"], [row.id, row.productId, row.size, row.packageQuantity, row.stockQuantity, row.sortOrder]));
  for (const row of payload.tables.productMetrics) statements.push(insertStatement(database, "product_metrics", ["product_id", "views", "cart_adds", "updated_at"], [row.productId, row.views, row.cartAdds, row.updatedAt]));
  for (const row of payload.tables.searchAnalytics) statements.push(insertStatement(database, "search_analytics", ["id", "normalized_query", "query", "search_count", "last_searched_at"], [row.id, row.normalizedQuery, row.query, row.searchCount, row.lastSearchedAt]));
  for (const row of payload.tables.siteSettings) statements.push(insertStatement(database, "site_settings", ["id", "banner_active", "banner_eyebrow", "banner_title", "banner_text", "banner_cta_label", "banner_cta_href", "store_1_hours", "store_1_image_url", "store_2_hours", "store_2_image_url", "updated_at"], [row.id, row.bannerActive, row.bannerEyebrow, row.bannerTitle, row.bannerText, row.bannerCtaLabel, row.bannerCtaHref, row.store1Hours, row.store1ImageUrl, row.store2Hours, row.store2ImageUrl, row.updatedAt]));
  for (const row of payload.tables.storeSpecialHours) statements.push(insertStatement(database, "store_special_hours", ["id", "store_number", "date", "closed", "opens", "closes", "note", "created_at", "updated_at"], [row.id, row.storeNumber, row.date, row.closed, row.opens, row.closes, row.note, row.createdAt, row.updatedAt]));
  for (const row of payload.tables.adminUsers) statements.push(insertStatement(database, "admin_users", ["id", "username", "display_name", "password_hash", "role", "can_manage_products", "can_manage_content", "can_view_analytics", "totp_secret", "totp_enabled", "owner_guard", "active", "failed_attempts", "locked_until", "last_login_at", "created_at", "updated_at"], [row.id, row.username, row.displayName, row.passwordHash, row.role, row.canManageProducts, row.canManageContent, row.canViewAnalytics, row.totpSecret, row.totpEnabled, row.ownerGuard, row.active, row.failedAttempts, row.lockedUntil, row.lastLoginAt, row.createdAt, row.updatedAt]));
  for (const row of payload.tables.auditLogs) statements.push(insertStatement(database, "audit_logs", ["id", "user_id", "actor_name", "action", "entity_type", "entity_id", "summary", "created_at"], [row.id, row.userId, row.actorName, row.action, row.entityType, row.entityId, row.summary, row.createdAt]));

  await database.batch(statements);
}

export function currentUploadedImageUrls(tables: Pick<BackupTables, "products" | "siteSettings">) {
  return dynamicImageUrls(tables);
}
