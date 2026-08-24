import { getRuntimeEnv } from "../runtime-env";

type StoredImage = { body: BodyInit; arrayBuffer(): Promise<ArrayBuffer> };
type ProductBucket = {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<StoredImage | null>;
  delete(key: string): Promise<void>;
};
type RuntimeEnvironment = { BUCKET?: ProductBucket };

export type BackupImage = {
  sourceUrl: string;
  contentType: string;
  data: string;
};

function bucket() {
  const value = (getRuntimeEnv() as RuntimeEnvironment).BUCKET;
  if (!value) throw new Error("Armazenamento de imagens indisponível.");
  return value;
}

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function hasValidImageSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (type === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return false;
}

function storedImageReference(imageUrl: string) {
  if (!imageUrl.startsWith("/api/product-image?") && !imageUrl.startsWith("/api/store-image?")) return null;
  const url = new URL(imageUrl, "https://site.local");
  const key = url.searchParams.get("key") ?? "";
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key)) return null;
  if (url.pathname === "/api/product-image") return { folder: "products" as const, route: "/api/product-image" as const, key };
  if (url.pathname === "/api/store-image") return { folder: "stores" as const, route: "/api/store-image" as const, key };
  return null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("Uma imagem do backup está corrompida.");
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function ownedBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function saveImage(file: File, folder: "products" | "stores", route: "/api/product-image" | "/api/store-image") {
  const extension = allowedTypes.get(file.type);
  if (!extension) throw new Error("Use uma imagem JPG, PNG ou WEBP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");
  const buffer = await file.arrayBuffer();
  if (!hasValidImageSignature(file.type, new Uint8Array(buffer).slice(0, 16))) {
    throw new Error("O conteúdo do arquivo não corresponde a uma imagem válida.");
  }

  const key = `${crypto.randomUUID()}.${extension}`;
  await bucket().put(`${folder}/${key}`, buffer, {
    httpMetadata: { contentType: file.type },
  });
  return `${route}?key=${encodeURIComponent(key)}`;
}

export async function saveProductImage(file: File) {
  return saveImage(file, "products", "/api/product-image");
}

export async function saveStoreImage(file: File) {
  return saveImage(file, "stores", "/api/store-image");
}

export async function duplicateProductImage(imageUrl: string) {
  if (imageUrl.startsWith("/products/") || imageUrl.startsWith("/brand/")) return imageUrl;
  const reference = storedImageReference(imageUrl);
  if (!reference || reference.folder !== "products") throw new Error("A foto original do produto não pôde ser copiada.");
  const object = await bucket().get(`products/${reference.key}`);
  if (!object) throw new Error("A foto original do produto não foi encontrada.");
  const buffer = await object.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const contentType = contentTypeForKey(reference.key);
  if (!bytes.length || bytes.length > 5 * 1024 * 1024 || !hasValidImageSignature(contentType, bytes.subarray(0, 16))) {
    throw new Error("A foto original do produto está inválida.");
  }
  const extension = allowedTypes.get(contentType);
  if (!extension) throw new Error("O formato da foto original não é permitido.");
  const key = `${crypto.randomUUID()}.${extension}`;
  await bucket().put(`products/${key}`, buffer, { httpMetadata: { contentType } });
  return `/api/product-image?key=${encodeURIComponent(key)}`;
}

export async function getProductImage(key: string) {
  return bucket().get(`products/${key}`);
}

export async function getStoreImage(key: string) {
  return bucket().get(`stores/${key}`);
}

export async function removeProductImage(imageUrl: string) {
  if (!imageUrl.startsWith("/api/product-image?")) return;
  const key = new URL(imageUrl, "https://site.local").searchParams.get("key");
  if (key) await bucket().delete(`products/${key}`);
}

export async function removeStoreImage(imageUrl: string) {
  if (!imageUrl.startsWith("/api/store-image?")) return;
  const key = new URL(imageUrl, "https://site.local").searchParams.get("key");
  if (key) await bucket().delete(`stores/${key}`);
}

export async function readUploadedImageForBackup(imageUrl: string): Promise<BackupImage | null> {
  const reference = storedImageReference(imageUrl);
  if (!reference) return null;
  const object = await bucket().get(`${reference.folder}/${reference.key}`);
  if (!object) throw new Error(`A imagem ${reference.key} não foi encontrada no armazenamento.`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  const contentType = contentTypeForKey(reference.key);
  if (bytes.length > 5 * 1024 * 1024 || !hasValidImageSignature(contentType, bytes.subarray(0, 16))) {
    throw new Error(`A imagem ${reference.key} está inválida e não pode entrar no backup.`);
  }
  return { sourceUrl: imageUrl, contentType, data: bytesToBase64(bytes) };
}

export async function restoreUploadedImageFromBackup(image: BackupImage) {
  const reference = storedImageReference(image.sourceUrl);
  if (!reference || image.contentType !== contentTypeForKey(reference.key)) throw new Error("Uma referência de imagem do backup é inválida.");
  const bytes = base64ToBytes(image.data);
  if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024 || !hasValidImageSignature(image.contentType, bytes.subarray(0, 16))) {
    throw new Error("Uma imagem do backup está inválida ou excede 5 MB.");
  }
  const extension = allowedTypes.get(image.contentType);
  if (!extension) throw new Error("O backup contém um formato de imagem não permitido.");
  const key = `${crypto.randomUUID()}.${extension}`;
  await bucket().put(`${reference.folder}/${key}`, ownedBuffer(bytes), { httpMetadata: { contentType: image.contentType } });
  return `${reference.route}?key=${encodeURIComponent(key)}`;
}

export async function removeUploadedImage(imageUrl: string) {
  const reference = storedImageReference(imageUrl);
  if (reference) await bucket().delete(`${reference.folder}/${reference.key}`);
}

export function contentTypeForKey(key: string) {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
