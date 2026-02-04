import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "./ui/button";
import { SupportFaqs } from "./SupportFaqs";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { useAuth } from "../providers/AuthProvider";

type ConversationStatus = "OPEN" | "PENDING" | "CLOSED";

type ConversationRow = {
  id: string;
  user_id: string;
  status: ConversationStatus;
  last_sender_type?: "USER" | "ADMIN" | null;
  admin_last_read_at?: string | null;
  user_last_read_at?: string | null;
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

export function SupportWidget() {
  const mode = useMemo(() => getAppMode(), []);
  const qc = useQueryClient();
  const { user } = useAuth();
  const location = useLocation();

  const userId = (user?.id ?? "").trim();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "faqs">("chat");
  const [draft, setDraft] = useState("");

  const canUseSupport =
    user?.role === "DEALER_ADMIN" ||
    user?.role === "DEALER_EMPLOYEE" ||
    user?.role === "PROVIDER" ||
    user?.role === "ADMIN" ||
    user?.role === "SUPER_ADMIN";

  const isDashboardPath =
    location.pathname === "/dealer-dashboard" ||
    location.pathname === "/dealer-admin" ||
    location.pathname === "/provider-dashboard" ||
    location.pathname === "/company-dashboard";

  const shouldRender = Boolean(userId) && canUseSupport && isDashboardPath;
  const supabaseEnabled = shouldRender && open && mode === "supabase";

  const conversationQuery = useQuery({
    queryKey: ["support-widget-conversation", mode, userId],
    enabled: supabaseEnabled,
    queryFn: async (): Promise<ConversationRow | null> => {
      if (!userId) return null;
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const existing = await supabase
        .from("support_conversations")
        .select("id, user_id, status, last_sender_type, admin_last_read_at, user_last_read_at, created_at, updated_at, last_message_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing.error) throw existing.error;
      return existing.data ? (existing.data as ConversationRow) : null;
    },
  });

  const conversationId = conversationQuery.data?.id ?? "";

  useEffect(() => {
    if (!open) return;
    if (mode !== "supabase") return;
    if (!conversationId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;
    const now = new Date().toISOString();
    void supabase.from("support_conversations").update({ user_last_read_at: now }).eq("id", conversationId);
  }, [conversationId, mode, open]);

  const messagesQuery = useQuery({
    queryKey: ["support-widget-messages", mode, conversationId],
    enabled: supabaseEnabled && Boolean(conversationId),
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
      if (!userId) throw new Error("You must be signed in to send support messages");

      const text = draft.trim();
      if (!text) throw new Error("Message is required");

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const profileRes = await supabase
        .from("profiles")
        .select("email, role, company_name")
        .eq("id", userId)
        .maybeSingle();

      if (profileRes.error) throw profileRes.error;

      const snapEmail = ((profileRes.data as any)?.email ?? user?.email ?? "").toString() || null;
      const snapRole = ((profileRes.data as any)?.role ?? user?.role ?? "").toString() || null;
      const snapCompany = ((profileRes.data as any)?.company_name ?? "").toString() || null;

      let convId = conversationId;
      if (!convId) {
        const insertConv = await supabase
          .from("support_conversations")
          .insert({
            user_id: userId,
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
            const again = await supabase.from("support_conversations").select("id").eq("user_id", userId).single();
            if (again.error) throw again.error;
            convId = (again.data as any).id as string;
          } else {
            throw insertConv.error;
          }
        }
      }

      const insertMsg = await supabase.from("support_messages").insert({
        conversation_id: convId,
        sender_user_id: userId,
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
      await qc.invalidateQueries({ queryKey: ["support-widget-messages", mode] });
      await qc.invalidateQueries({ queryKey: ["support-widget-conversation", mode, userId] });
    },
  });

  const busy = conversationQuery.isLoading || messagesQuery.isLoading || sendMutation.isPending;
  const showChat = tab === "chat";

  if (!shouldRender) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {!open ? (
        <Button
          onClick={() => {
            setTab("chat");
            setOpen(true);
          }}
        >
          Help
        </Button>
      ) : (
        <div className="w-[360px] max-w-[calc(100vw-40px)] max-h-[calc(100vh-40px)] rounded-xl border bg-card shadow-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-sm">Help & Support</div>
              <div className="flex items-center rounded-md border bg-background overflow-hidden">
                <button
                  type="button"
                  className={
                    showChat
                      ? "px-2 py-1 text-xs font-medium bg-accent/30"
                      : "px-2 py-1 text-xs text-muted-foreground hover:bg-accent/10"
                  }
                  onClick={() => setTab("chat")}
                >
                  Chat
                </button>
                <button
                  type="button"
                  className={
                    !showChat
                      ? "px-2 py-1 text-xs font-medium bg-accent/30"
                      : "px-2 py-1 text-xs text-muted-foreground hover:bg-accent/10"
                  }
                  onClick={() => setTab("faqs")}
                >
                  FAQs
                </button>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>

          {mode !== "supabase" ? (
            <div className="p-4 text-sm text-muted-foreground">Supabase is not configured.</div>
          ) : null}

          {conversationQuery.isError ? (
            <div className="p-4 text-sm text-destructive">{toErrorMessage(conversationQuery.error)}</div>
          ) : null}

          <div className="flex-1 overflow-auto p-4">
            {showChat ? (
              <>
                <div className="text-sm font-medium">Hi, how can we help you?</div>
                <div className="text-xs text-muted-foreground mt-1">Send us a message and our team will reply.</div>
                <div className="text-xs text-muted-foreground mt-1">Human support only. This is not an AI chatbot.</div>
                <div className="space-y-2 pr-1 mt-3">
                  {(messagesQuery.data ?? []).map((m) => {
                    const mine = m.sender_type === "USER";
                    return (
                      <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                        <div
                          className={
                            mine
                              ? "max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-3 py-2 text-xs"
                              : "max-w-[85%] rounded-2xl border bg-background px-3 py-2 text-xs"
                          }
                        >
                          <div className={mine ? "text-primary-foreground/80 text-[11px]" : "text-muted-foreground text-[11px]"}>
                            {mine ? "You" : "Support"} • {new Date(m.created_at).toLocaleTimeString()}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap break-words text-sm">{m.body}</div>
                        </div>
                      </div>
                    );
                  })}

                  {!messagesQuery.isLoading && (messagesQuery.data ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">Send a message to start.</div>
                  ) : null}

                  {messagesQuery.isError ? (
                    <div className="text-sm text-destructive">{toErrorMessage(messagesQuery.error)}</div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium">Bridge Warranty-FAQs</div>
                <div className="text-xs text-muted-foreground mt-1">Search common questions before messaging.</div>
                <div className="mt-3">
                  <SupportFaqs compact />
                </div>
              </>
            )}
          </div>

          {showChat ? (
            <div className="p-4 border-t">
              <div className="grid grid-cols-1 gap-2">
                <textarea
                  className="min-h-[84px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type your message…"
                  disabled={busy || mode !== "supabase"}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
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
          ) : (
            <div className="p-4 border-t">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setTab("chat")}>
                  Back to chat
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
