import { getChatGPTUser, type ChatGPTUser } from "./chatgpt-auth";
import { getRuntimeEnv } from "../runtime-env";

type RuntimeEnvironment = { ADMIN_EMAIL?: string };

function configuredAdminEmail() {
  return ((getRuntimeEnv() as RuntimeEnvironment).ADMIN_EMAIL ?? "").trim().toLowerCase();
}

export function isAdminEmail(email: string) {
  const expected = configuredAdminEmail();
  return Boolean(expected) && email.trim().toLowerCase() === expected;
}

export async function getAdminUser(): Promise<ChatGPTUser | null> {
  const user = await getChatGPTUser();
  return user && isAdminEmail(user.email) ? user : null;
}
