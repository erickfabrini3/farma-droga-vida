import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import type { AdminSessionUser } from "./admin-session";

export type AuditEntry = typeof auditLogs.$inferSelect;

export async function writeAuditLog(
  user: AdminSessionUser,
  action: string,
  entityType: string,
  entityId: string | number | null,
  summary: string,
) {
  try {
    await getDb().insert(auditLogs).values({
      userId: user.id,
      actorName: user.displayName,
      action,
      entityType,
      entityId: entityId === null ? null : String(entityId),
      summary: summary.slice(0, 240),
    });
  } catch {
    // A ação principal não deve falhar se o registro de auditoria estiver temporariamente indisponível.
  }
}

export async function listAuditLogs(limit = 60): Promise<AuditEntry[]> {
  try {
    return await getDb().select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(Math.min(200, Math.max(1, limit)));
  } catch {
    return [];
  }
}
