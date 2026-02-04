export type AuditEvent = {
  id: string;
  createdAt: string;
  kind: string;
  actorUserId?: string;
  actorEmail?: string;
  actorRole?: string;
  dealerId?: string;
  providerId?: string;
  entityType?: string;
  entityId?: string;
  message?: string;
  meta?: Record<string, unknown>;
};

const STORAGE_KEY = "warrantyhub.local.audit_events";

function read(): AuditEvent[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<AuditEvent>[];
    return (Array.isArray(parsed) ? parsed : [])
      .map((e): AuditEvent => {
        const createdAt = typeof e.createdAt === "string" ? e.createdAt : new Date().toISOString();
        return {
          id: typeof e.id === "string" ? e.id : crypto.randomUUID(),
          createdAt,
          kind: typeof e.kind === "string" ? e.kind : "UNKNOWN",
          actorUserId: typeof e.actorUserId === "string" ? e.actorUserId : undefined,
          actorEmail: typeof e.actorEmail === "string" ? e.actorEmail : undefined,
          actorRole: typeof e.actorRole === "string" ? e.actorRole : undefined,
          dealerId: typeof e.dealerId === "string" ? e.dealerId : undefined,
          providerId: typeof e.providerId === "string" ? e.providerId : undefined,
          entityType: typeof e.entityType === "string" ? e.entityType : undefined,
          entityId: typeof e.entityId === "string" ? e.entityId : undefined,
          message: typeof e.message === "string" ? e.message : undefined,
          meta: e.meta && typeof e.meta === "object" ? (e.meta as Record<string, unknown>) : undefined,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

function write(items: AuditEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
  }
}

export function logAuditEvent(input: Omit<AuditEvent, "id" | "createdAt"> & { createdAt?: string }) {
  const evt: AuditEvent = {
    id: crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    kind: input.kind,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    dealerId: input.dealerId,
    providerId: input.providerId,
    entityType: input.entityType,
    entityId: input.entityId,
    message: input.message,
    meta: input.meta,
  };

  const existing = read();
  const next = [evt, ...existing].slice(0, 5000);
  write(next);
  return evt;
}

export type ListAuditEventsOptions = {
  dealerId?: string;
  providerId?: string;
  actorUserId?: string;
  limit?: number;
};

export function listAuditEvents(options: ListAuditEventsOptions = {}) {
  const dealerId = (options.dealerId ?? "").trim();
  const providerId = (options.providerId ?? "").trim();
  const actorUserId = (options.actorUserId ?? "").trim();
  const limit = typeof options.limit === "number" ? options.limit : 200;

  return read()
    .filter((e) => (!dealerId ? true : (e.dealerId ?? "").trim() === dealerId))
    .filter((e) => (!providerId ? true : (e.providerId ?? "").trim() === providerId))
    .filter((e) => (!actorUserId ? true : (e.actorUserId ?? "").trim() === actorUserId))
    .slice(0, Math.max(0, limit));
}
