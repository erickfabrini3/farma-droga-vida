import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";

const SESSION_COOKIE = "dvp_admin_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
// The Sites runtime supports PBKDF2 up to 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;
const encoder = new TextEncoder();

export type AdminSessionUser = {
  id: number;
  username: string;
  displayName: string;
  role: "owner" | "editor";
  canManageProducts: boolean;
  canManageContent: boolean;
  canViewAnalytics: boolean;
};

export class LoginError extends Error {
  constructor(message: string, public status = 401) {
    super(message);
  }
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  return bytes;
}

async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function constantTimeEqual(first: Uint8Array, second: Uint8Array) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first[index] ^ second[index];
  return difference === 0;
}

async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string) {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of input.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

async function totpAt(secret: string, counter: number) {
  const counterBytes = new Uint8Array(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    counterBytes[index] = remaining & 255;
    remaining = Math.floor(remaining / 256);
  }
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

export function createTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function totpProvisioningUri(username: string, secret: string) {
  const issuer = "Droga Vida Popular";
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${username}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function verifyTotp(secret: string, codeInput: string) {
  const code = codeInput.replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (const drift of [-1, 0, 1]) {
    if (constantTimeEqual(encoder.encode(await totpAt(secret, counter + drift)), encoder.encode(code))) return true;
  }
  return false;
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string) {
  const username = normalizeUsername(value);
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new LoginError("O usuário deve ter de 3 a 32 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.", 400);
  }
  return username;
}

export function validatePassword(password: string) {
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new LoginError("A senha precisa ter pelo menos 10 caracteres, com letra maiúscula, minúscula e número.", 400);
  }
  return password;
}

export async function hashPassword(password: string) {
  validatePassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2$${PASSWORD_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, iterationText, saltHex, hashHex] = stored.split("$");
  const iterations = Number(iterationText);
  const salt = hexToBytes(saltHex ?? "");
  const expected = hexToBytes(hashHex ?? "");
  if (algorithm !== "pbkdf2" || !Number.isInteger(iterations) || !salt || !expected) return false;
  const actual = await derivePassword(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function adminUsersExist() {
  const [user] = await getDb().select({ id: adminUsers.id }).from(adminUsers).limit(1);
  return Boolean(user);
}

export async function createAdminSession(userId: number) {
  const rawToken = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await getDb().insert(adminSessions).values({
    tokenHash: await sha256(rawToken),
    userId,
    expiresAt: expiresAt.toISOString(),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function destroyAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(adminSessions).where(eq(adminSessions.tokenHash, await sha256(token)));
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getAdminSession(): Promise<AdminSessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [session] = await getDb()
    .select({ userId: adminSessions.userId })
    .from(adminSessions)
    .where(and(eq(adminSessions.tokenHash, await sha256(token)), gt(adminSessions.expiresAt, new Date().toISOString())))
    .limit(1);
  if (!session) return null;

  const [user] = await getDb()
    .select({ id: adminUsers.id, username: adminUsers.username, displayName: adminUsers.displayName, role: adminUsers.role, active: adminUsers.active, canManageProducts: adminUsers.canManageProducts, canManageContent: adminUsers.canManageContent, canViewAnalytics: adminUsers.canViewAnalytics })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.userId))
    .limit(1);
  if (!user?.active || (user.role !== "owner" && user.role !== "editor")) return null;
  const isOwner = user.role === "owner";
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    canManageProducts: isOwner || user.canManageProducts,
    canManageContent: isOwner || user.canManageContent,
    canViewAnalytics: isOwner || user.canViewAnalytics,
  };
}

export async function requireAdminSession(): Promise<AdminSessionUser> {
  const user = await getAdminSession();
  if (!user) redirect("/admin/login");
  return user;
}

export async function requireOwnerSession(): Promise<AdminSessionUser> {
  const user = await requireAdminSession();
  if (user.role !== "owner") redirect("/admin");
  return user;
}

export async function authenticateAdmin(usernameInput: string, password: string, totpCode = "") {
  const username = normalizeUsername(usernameInput);
  const db = getDb();
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.username, username)).limit(1);
  const genericError = new LoginError("Usuário ou senha incorretos.");
  if (!user || !user.active) throw genericError;

  const now = new Date();
  if (user.lockedUntil && new Date(user.lockedUntil) > now) {
    throw new LoginError("Acesso temporariamente bloqueado após várias tentativas. Tente novamente em alguns minutos.", 429);
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failedAttempts = user.failedAttempts + 1;
    const lockedUntil = failedAttempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null;
    await db.update(adminUsers).set({ failedAttempts: lockedUntil ? 0 : failedAttempts, lockedUntil, updatedAt: now.toISOString() }).where(eq(adminUsers.id, user.id));
    throw lockedUntil ? new LoginError("Muitas tentativas incorretas. O acesso foi bloqueado por 15 minutos.", 429) : genericError;
  }

  if (user.totpEnabled && (!user.totpSecret || !(await verifyTotp(user.totpSecret, totpCode)))) {
    throw new LoginError(totpCode ? "Código do autenticador inválido." : "Informe o código de 6 dígitos do seu autenticador.", 428);
  }

  await db.update(adminUsers).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: now.toISOString(), updatedAt: now.toISOString() }).where(eq(adminUsers.id, user.id));
  await createAdminSession(user.id);
  return user;
}
