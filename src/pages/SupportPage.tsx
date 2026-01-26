import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
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
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
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

export function SupportPage() {
  const mode = useMemo(() => getAppMode(), []);
  const qc = useQueryClient();
  const { user } = useAuth();

  const [draft, setDraft] = useState("");

  const getSnapshot = async (supabase: NonNullable<ReturnType<typeof getSupabaseClient>>) => {
    if (!user) throw new Error("Not authenticated");

    const profileRes = await supabase
      .from("profiles")
      .select("email, role, company_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileRes.error) throw profileRes.error;

    const snapEmail = ((profileRes.data as any)?.email ?? user.email ?? "").toString() || null;
    const snapRole = ((profileRes.data as any)?.role ?? user.role ?? "").toString() || null;
    const snapCompany = ((profileRes.data as any)?.company_name ?? "").toString() || null;

    return { snapEmail, snapRole, snapCompany };
  };

  const conversationQuery = useQuery({
    queryKey: ["support-conversation", mode, user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<ConversationRow | null> => {
      if (mode !== "supabase") throw new Error("Support chat requires Supabase configuration");
      if (!user) throw new Error("Not authenticated");

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const existing = await supabase
        .from("support_conversations")
        .select("id, user_id, user_email, user_role, user_company_name, status, created_at, updated_at, last_message_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing.error) throw existing.error;
      return existing.data ? (existing.data as ConversationRow) : null;
    },
  });

  const conversationId = conversationQuery.data?.id ?? "";

  const messagesQuery = useQuery({
    queryKey: ["support-messages", mode, conversationId],
    enabled: mode === "supabase" && Boolean(conversationId),
    queryFn: async (): Promise<MessageRow[]> => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data, error } = await supabase
        .from("support_messages")
        .select("id, conversation_id, sender_user_id, sender_type, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data as MessageRow[]) ?? [];
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (mode !== "supabase") throw new Error("Support chat requires Supabase configuration");
      if (!user) throw new Error("Not authenticated");

      const text = draft.trim();
      if (!text) throw new Error("Message is required");

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { snapEmail, snapRole, snapCompany } = await getSnapshot(supabase);

      let convId = conversationId;
      if (!convId) {
        const insertConv = await supabase
          .from("support_conversations")
          .insert({
            user_id: user.id,
            user_email: snapEmail,
            user_role: snapRole,
            user_company_name: snapCompany,
            status: "OPEN",
          })
          .select("id")
          .single();

        if (!insertConv.error) {
          convId = (insertConv.data as any).id as string;
        } else {
          const code = (insertConv.error as any)?.code;
          if (code === "23505") {
            const again = await supabase.from("support_conversations").select("id").eq("user_id", user.id).single();
            if (again.error) throw again.error;
            convId = (again.data as any).id as string;
          } else {
            throw insertConv.error;
          }
        }
      }

      const insertMsg = await supabase.from("support_messages").insert({
        conversation_id: convId,
        sender_user_id: user.id,
        sender_type: "USER",
        body: text,
      });

      if (insertMsg.error) throw insertMsg.error;

      const now = new Date().toISOString();
      const bump = await supabase
        .from("support_conversations")
        .update({
          updated_at: now,
          last_message_at: now,
          status: "OPEN",
          last_sender_type: "USER",
          user_email: snapEmail,
          user_role: snapRole,
          user_company_name: snapCompany,
          user_last_read_at: now,
        })
        .eq("id", convId);

      if (bump.error) throw bump.error;
    },
    onSuccess: async () => {
      setDraft("");
      await qc.invalidateQueries({ queryKey: ["support-conversation", mode, user?.id] });
      await qc.invalidateQueries({ queryKey: ["support-messages", mode] });
    },
  });

  const busy = conversationQuery.isLoading || messagesQuery.isLoading || sendMutation.isPending;

  return (
    <PageShell title="Help & Support" subtitle="Send a message to support. Replies are handled by real admins." badge="Support">
      {mode !== "supabase" ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Supabase is not configured.</div>
      ) : null}

      {conversationQuery.isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {toErrorMessage(conversationQuery.error)}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="font-semibold">Conversation</div>
          <div className="text-sm text-muted-foreground mt-1">
            Status: {conversationQuery.data?.status ?? "—"}
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="text-sm font-medium">Hi, how can we help you?</div>
          <div className="text-sm text-muted-foreground mt-1">Send us a message and our team will reply.</div>
          <div className="text-sm text-muted-foreground mt-1">Human support only. This is not an AI chatbot.</div>
          {messagesQuery.isError ? (
            <div className="text-sm text-destructive">{toErrorMessage(messagesQuery.error)}</div>
          ) : null}

          <div className="space-y-3 mt-4">
            {(messagesQuery.data ?? []).map((m) => {
              const mine = m.sender_type === "USER";
              return (
                <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      mine
                        ? "max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm"
                        : "max-w-[80%] rounded-2xl border bg-background px-4 py-2 text-sm"
                    }
                  >
                    <div className={mine ? "text-primary-foreground/90 text-xs" : "text-muted-foreground text-xs"}>
                      {mine ? "You" : "Support"} • {new Date(m.created_at).toLocaleString()}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words">{m.body}</div>
                  </div>
                </div>
              );
            })}

            {!messagesQuery.isLoading && (messagesQuery.data ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No messages yet. Send your first message below.</div>
            ) : null}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3">
            <textarea
              className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Describe your issue or question…"
              disabled={busy || mode !== "supabase"}
            />
            <div className="flex justify-end">
              <Button
                disabled={busy || mode !== "supabase"}
                onClick={() => {
                  sendMutation.mutate();
                }}
              >
                Send
              </Button>
            </div>

            {sendMutation.isError ? (
              <div className="text-sm text-destructive">{toErrorMessage(sendMutation.error)}</div>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
