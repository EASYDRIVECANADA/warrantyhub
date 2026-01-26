import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { useAuth } from "../providers/AuthProvider";

type ConversationStatus = "OPEN" | "PENDING" | "CLOSED";

type ConversationRow = {
  id: string;
  user_id: string;
  user_email?: string | null;
  user_role?: string | null;
  user_company_name?: string | null;
  last_sender_type?: "USER" | "ADMIN" | null;
  admin_last_read_at?: string | null;
  user_last_read_at?: string | null;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
  user?: {
    email?: string | null;
    display_name?: string | null;
    company_name?: string | null;
    role?: string | null;
  } | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_type: "USER" | "ADMIN";
  body: string;
  created_at: string;
};

function toErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const anyErr = err as any;
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error_description === "string") return anyErr.error_description;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function displayUserLabel(c: ConversationRow) {
  const email = (c.user?.email ?? c.user_email ?? "").toString().trim();
  const company = (c.user?.company_name ?? c.user_company_name ?? "").toString().trim();
  const display = (c.user?.display_name ?? "").toString().trim();
  const role = (c.user?.role ?? c.user_role ?? "").toString().trim();

  const roleLabel = role === "PROVIDER" ? "Provider" : role === "DEALER" ? "Dealer" : role ? role : "User";

  if (company && email) return `${roleLabel} — ${company} (${email})`;
  if (company) return `${roleLabel} — ${company}`;
  if (display && email) return `${roleLabel} — ${display} (${email})`;
  if (email) return email;
  return c.user_id.slice(0, 8);
}

function isUnreadForAdmin(c: ConversationRow) {
  if (c.last_sender_type !== "USER") return false;
  if (!c.last_message_at) return false;
  if (!c.admin_last_read_at) return true;
  return new Date(c.last_message_at).getTime() > new Date(c.admin_last_read_at).getTime();
}

export function AdminSupportInboxPage() {
  const mode = useMemo(() => getAppMode(), []);
  const qc = useQueryClient();
  const { user } = useAuth();

  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "DEALER" | "PROVIDER">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ConversationStatus>("ALL");

  const conversationsQuery = useQuery({
    queryKey: ["admin-support-conversations", mode],
    enabled: mode === "supabase",
    queryFn: async (): Promise<ConversationRow[]> => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data, error } = await supabase
        .from("support_conversations")
        .select(
          "id, user_id, user_email, user_role, user_company_name, last_sender_type, admin_last_read_at, user_last_read_at, status, created_at, updated_at, last_message_at, user:profiles(email, display_name, company_name, role)",
        )
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return (data as ConversationRow[]) ?? [];
    },
  });

  const conversations = conversationsQuery.data ?? [];

  const q = search.trim().toLowerCase();
  const filtered = conversations.filter((c) => {
    if (roleFilter !== "ALL") {
      const role = (c.user?.role ?? c.user_role ?? "").toString();
      if (role !== roleFilter) return false;
    }
    if (statusFilter !== "ALL") {
      if (c.status !== statusFilter) return false;
    }
    if (!q) return true;
    const hay = `${c.user?.email ?? ""} ${c.user?.company_name ?? ""} ${c.user?.display_name ?? ""}`.toLowerCase();
    return hay.includes(q);
  });

  const effectiveSelectedId = selectedId || filtered[0]?.id || "";

  const messagesQuery = useQuery({
    queryKey: ["admin-support-messages", mode, effectiveSelectedId],
    enabled: mode === "supabase" && Boolean(effectiveSelectedId),
    queryFn: async (): Promise<MessageRow[]> => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data, error } = await supabase
        .from("support_messages")
        .select("id, conversation_id, sender_user_id, sender_type, body, created_at")
        .eq("conversation_id", effectiveSelectedId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data as MessageRow[]) ?? [];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: ConversationStatus) => {
      if (!effectiveSelectedId) return;
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");
      const now = new Date().toISOString();
      const res = await supabase
        .from("support_conversations")
        .update({ status, updated_at: now })
        .eq("id", effectiveSelectedId);
      if (res.error) throw res.error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-support-conversations", mode] });
    },
  });

  const sendReplyMutation = useMutation({
    mutationFn: async () => {
      if (mode !== "supabase") throw new Error("Support chat requires Supabase configuration");
      if (!user) throw new Error("Not authenticated");
      if (!effectiveSelectedId) throw new Error("No conversation selected");

      const text = reply.trim();
      if (!text) throw new Error("Message is required");

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const insertMsg = await supabase.from("support_messages").insert({
        conversation_id: effectiveSelectedId,
        sender_user_id: user.id,
        sender_type: "ADMIN",
        body: text,
      });

      if (insertMsg.error) throw insertMsg.error;

      const now = new Date().toISOString();
      const bump = await supabase
        .from("support_conversations")
        .update({
          updated_at: now,
          last_message_at: now,
          status: "PENDING",
          last_sender_type: "ADMIN",
          admin_last_read_at: now,
        })
        .eq("id", effectiveSelectedId);

      if (bump.error) throw bump.error;
    },
    onSuccess: async () => {
      setReply("");
      await qc.invalidateQueries({ queryKey: ["admin-support-messages", mode, effectiveSelectedId] });
      await qc.invalidateQueries({ queryKey: ["admin-support-conversations", mode] });
    },
  });

  const selected = conversations.find((c) => c.id === effectiveSelectedId);
  const busy = conversationsQuery.isLoading || messagesQuery.isLoading || sendReplyMutation.isPending;

  useEffect(() => {
    if (mode !== "supabase") return;
    if (!effectiveSelectedId) return;
    if (!selected) return;
    if (!isUnreadForAdmin(selected)) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const now = new Date().toISOString();
    void supabase.from("support_conversations").update({ admin_last_read_at: now }).eq("id", effectiveSelectedId);
  }, [effectiveSelectedId, mode, selected]);

  return (
    <PageShell
      title="Support Inbox"
      subtitle="Reply to support conversations. Human-handled (not AI)."
      badge="Support"
    >
      {mode !== "supabase" ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Supabase is not configured.</div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 rounded-xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <div className="font-semibold">Conversations</div>
            <div className="mt-3">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email or company" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
              >
                <option value="ALL">All Roles</option>
                <option value="DEALER">Dealer</option>
                <option value="PROVIDER">Provider</option>
              </select>

              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="ALL">All Status</option>
                <option value="OPEN">Open</option>
                <option value="PENDING">Pending</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
          </div>

          <div className="divide-y max-h-[65vh] overflow-auto">
            {filtered.map((c) => {
              const active = c.id === effectiveSelectedId;
              const unread = isUnreadForAdmin(c);
              return (
                <button
                  key={c.id}
                  className={
                    active
                      ? "w-full text-left px-6 py-4 bg-accent/20"
                      : "w-full text-left px-6 py-4 hover:bg-accent/10"
                  }
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="text-sm font-medium flex items-center justify-between gap-3">
                    <span className="truncate">{displayUserLabel(c)}</span>
                    {unread ? (
                      <span className="text-[11px] rounded-full bg-destructive text-destructive-foreground px-2 py-0.5">Unread</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {c.status} • Updated {new Date(c.updated_at).toLocaleString()}
                  </div>
                </button>
              );
            })}

            {conversationsQuery.isLoading ? (
              <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div>
            ) : null}
            {conversationsQuery.isError ? (
              <div className="px-6 py-6 text-sm text-destructive">{toErrorMessage(conversationsQuery.error)}</div>
            ) : null}
            {!conversationsQuery.isLoading && !conversationsQuery.isError && filtered.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No conversations yet.</div>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-8 rounded-xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Conversation</div>
              <div className="text-sm text-muted-foreground mt-1">{selected ? displayUserLabel(selected) : "—"}</div>
              <div className="text-xs text-muted-foreground mt-1">Status: {selected?.status ?? "—"}</div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !effectiveSelectedId}
                onClick={() => updateStatusMutation.mutate("OPEN")}
              >
                Reopen
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !effectiveSelectedId}
                onClick={() => updateStatusMutation.mutate("CLOSED")}
              >
                Close
              </Button>
            </div>
          </div>

          <div className="px-6 py-6">
            {messagesQuery.isError ? (
              <div className="text-sm text-destructive">{toErrorMessage(messagesQuery.error)}</div>
            ) : null}

            <div className="space-y-3 max-h-[45vh] overflow-auto pr-2">
              {(messagesQuery.data ?? []).map((m) => {
                const fromAdmin = m.sender_type === "ADMIN";
                return (
                  <div key={m.id} className={fromAdmin ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={
                        fromAdmin
                          ? "max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm"
                          : "max-w-[80%] rounded-2xl border bg-background px-4 py-2 text-sm"
                      }
                    >
                      <div className={fromAdmin ? "text-primary-foreground/90 text-xs" : "text-muted-foreground text-xs"}>
                        {fromAdmin ? "Admin" : "User"} • {new Date(m.created_at).toLocaleString()}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap break-words">{m.body}</div>
                    </div>
                  </div>
                );
              })}

              {!messagesQuery.isLoading && (messagesQuery.data ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No messages yet.</div>
              ) : null}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3">
              <textarea
                className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                disabled={busy || !effectiveSelectedId || mode !== "supabase"}
              />
              <div className="flex justify-end">
                <Button
                  disabled={busy || !effectiveSelectedId || mode !== "supabase"}
                  onClick={() => {
                    sendReplyMutation.mutate();
                  }}
                >
                  Send reply
                </Button>
              </div>

              {sendReplyMutation.isError ? (
                <div className="text-sm text-destructive">{toErrorMessage(sendReplyMutation.error)}</div>
              ) : null}
              {updateStatusMutation.isError ? (
                <div className="text-sm text-destructive">{toErrorMessage(updateStatusMutation.error)}</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
