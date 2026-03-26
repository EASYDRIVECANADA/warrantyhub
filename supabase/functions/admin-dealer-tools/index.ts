import { corsHeaders } from "../_shared/cors.ts";
import { getAuthedSupabaseClient, getServiceSupabaseClient } from "../_shared/supabase.ts";

type Action =
  | "invite_user"
  | "update_user_email"
  | "generate_password_reset_link"
  | "set_user_disabled"
  | "update_dealer"
  | "add_dealer_member"
  | "remove_dealer_member"
  | "update_dealer_member";

type Body =
  | {
      action: "invite_user";
      email: string;
      redirectTo?: string;
      profile?: {
        role?: string;
        displayName?: string;
        companyName?: string;
        isActive?: boolean;
      };
    }
  | {
      action: "update_user_email";
      userId: string;
      email: string;
    }
  | {
      action: "generate_password_reset_link";
      email: string;
      redirectTo?: string;
    }
  | {
      action: "set_user_disabled";
      userId: string;
      disabled: boolean;
      duration?: string;
    }
  | {
      action: "update_dealer";
      dealerId: string;
      patch: {
        name?: string;
        markupPct?: number;
        contractFeeCents?: number | null;
        subscriptionStatus?: string | null;
        subscriptionPlanKey?: string | null;
      };
    }
  | {
      action: "add_dealer_member";
      dealerId: string;
      email: string;
      role: "DEALER_ADMIN" | "DEALER_EMPLOYEE";
      status?: "INVITED" | "ACTIVE" | "DISABLED";
      displayName?: string;
      redirectTo?: string;
    }
  | {
      action: "remove_dealer_member";
      dealerMemberId: string;
    }
  | {
      action: "update_dealer_member";
      dealerMemberId: string;
      patch: {
        role?: "DEALER_ADMIN" | "DEALER_EMPLOYEE";
        status?: "INVITED" | "ACTIVE" | "DISABLED";
      };
    };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getJwt(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? "";
}

function normalizeEmail(email: string) {
  return (email ?? "").toString().trim().toLowerCase();
}

function safeTrim(v: unknown) {
  return (v ?? "").toString().trim();
}

function normalizeDealerMemberRole(role: string) {
  if (role === "DEALER_ADMIN" || role === "DEALER_EMPLOYEE") return role;
  return null;
}

function normalizeDealerMemberStatus(status: string) {
  if (status === "INVITED" || status === "ACTIVE" || status === "DISABLED") return status;
  return null;
}

async function findAuthUserIdByEmail(svc: ReturnType<typeof getServiceSupabaseClient>, email: string) {
  const pageSize = 1000;
  for (let page = 1; page <= 50; page++) {
    const res = await svc.auth.admin.listUsers({ page, perPage: pageSize } as any);
    if (res.error) throw new Error(res.error.message);
    const users = ((res.data as any)?.users ?? []) as any[];
    const found = users.find((u) => (u?.email ?? "").toString().trim().toLowerCase() === email);
    if (found?.id) return String(found.id);
    if (users.length < pageSize) break;
  }
  return null;
}

async function assertSuperAdmin(jwt: string) {
  const authed = getAuthedSupabaseClient(jwt);
  const { data: u, error: uerr } = await authed.auth.getUser();
  if (uerr) throw new Error(uerr.message);
  const userId = (u.user?.id ?? "").toString();
  if (!userId) throw new Error("Not authenticated");

  const svc = getServiceSupabaseClient();
  const profile = await svc.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  const role = ((profile.data as any)?.role ?? "").toString();
  if (role !== "SUPER_ADMIN") throw new Error("Forbidden");

  return { userId, svc };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const jwt = getJwt(req);
    if (!jwt) return json(401, { error: "Missing Authorization bearer token" });

    const { svc } = await assertSuperAdmin(jwt);

    const body = (await req.json()) as Partial<Body>;
    const action = (body as any)?.action as Action | undefined;
    if (!action) return json(400, { error: "action is required" });

    if (action === "invite_user") {
      const email = normalizeEmail((body as any).email);
      if (!email) return json(400, { error: "email is required" });

      const redirectTo = ((body as any).redirectTo ?? "").toString().trim() || undefined;

      const res = await svc.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      } as any);

      if (res.error) return json(400, { error: res.error.message });

      const userId = (res.data as any)?.user?.id as string | undefined;
      if (userId) {
        const p = (body as any).profile ?? {};
        const role = typeof p.role === "string" ? p.role : "UNASSIGNED";
        const displayName = typeof p.displayName === "string" ? p.displayName.trim() : null;
        const companyName = typeof p.companyName === "string" ? p.companyName.trim() : null;
        const isActive = typeof p.isActive === "boolean" ? p.isActive : true;

        const insertProfile = await svc
          .from("profiles")
          .upsert(
            {
              id: userId,
              email,
              role,
              display_name: displayName || null,
              company_name: companyName || null,
              is_active: isActive,
            } as any,
            { onConflict: "id" },
          );
        if (insertProfile.error) return json(500, { error: insertProfile.error.message });
      }

      return json(200, { user: (res.data as any)?.user ?? null });
    }

    if (action === "update_user_email") {
      const userId = ((body as any).userId ?? "").toString().trim();
      const email = normalizeEmail((body as any).email);
      if (!userId) return json(400, { error: "userId is required" });
      if (!email) return json(400, { error: "email is required" });

      const upd = await svc.auth.admin.updateUserById(userId, { email } as any);
      if (upd.error) return json(400, { error: upd.error.message });

      const profUpd = await svc.from("profiles").update({ email }).eq("id", userId);
      if (profUpd.error) return json(500, { error: profUpd.error.message });

      return json(200, { user: (upd.data as any)?.user ?? null });
    }

    if (action === "generate_password_reset_link") {
      const email = normalizeEmail((body as any).email);
      if (!email) return json(400, { error: "email is required" });

      const redirectTo = ((body as any).redirectTo ?? "").toString().trim() || undefined;

      const link = await svc.auth.admin.generateLink({
        type: "recovery",
        email,
        options: redirectTo ? { redirectTo } : undefined,
      } as any);

      if (link.error) return json(400, { error: link.error.message });

      return json(200, {
        action_link: (link.data as any)?.properties?.action_link ?? null,
      });
    }

    if (action === "set_user_disabled") {
      const userId = ((body as any).userId ?? "").toString().trim();
      const disabled = Boolean((body as any).disabled);
      if (!userId) return json(400, { error: "userId is required" });

      const duration = ((body as any).duration ?? "87600h").toString().trim() || "87600h";
      const upd = await svc.auth.admin.updateUserById(userId, {
        ban_duration: disabled ? duration : "none",
      } as any);
      if (upd.error) return json(400, { error: upd.error.message });

      const profUpd = await svc.from("profiles").update({ is_active: !disabled }).eq("id", userId);
      if (profUpd.error) return json(500, { error: profUpd.error.message });

      return json(200, { user: (upd.data as any)?.user ?? null });
    }

    if (action === "update_dealer") {
      const dealerId = safeTrim((body as any).dealerId);
      const patch = ((body as any).patch ?? {}) as any;
      if (!dealerId) return json(400, { error: "dealerId is required" });

      const updateRow: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof patch.name === "string") updateRow.name = patch.name.trim();
      if (typeof patch.markupPct === "number" && Number.isFinite(patch.markupPct)) updateRow.markup_pct = patch.markupPct;
      if (patch.contractFeeCents === null || (typeof patch.contractFeeCents === "number" && Number.isFinite(patch.contractFeeCents))) {
        updateRow.contract_fee_cents = patch.contractFeeCents;
      }
      if (patch.subscriptionStatus === null || typeof patch.subscriptionStatus === "string") {
        updateRow.subscription_status = patch.subscriptionStatus === null ? null : safeTrim(patch.subscriptionStatus) || null;
      }
      if (patch.subscriptionPlanKey === null || typeof patch.subscriptionPlanKey === "string") {
        updateRow.subscription_plan_key = patch.subscriptionPlanKey === null ? null : safeTrim(patch.subscriptionPlanKey) || null;
      }

      const upd = await svc.from("dealers").update(updateRow).eq("id", dealerId);
      if (upd.error) return json(400, { error: upd.error.message });
      return json(200, { ok: true });
    }

    if (action === "add_dealer_member") {
      const dealerId = safeTrim((body as any).dealerId);
      const email = normalizeEmail((body as any).email);
      const role = normalizeDealerMemberRole(safeTrim((body as any).role));
      const statusRaw = safeTrim((body as any).status) || "ACTIVE";
      const status = normalizeDealerMemberStatus(statusRaw) ?? "ACTIVE";
      const displayName = typeof (body as any).displayName === "string" ? (body as any).displayName.trim() : "";
      const redirectTo = safeTrim((body as any).redirectTo) || undefined;

      if (!dealerId) return json(400, { error: "dealerId is required" });
      if (!email) return json(400, { error: "email is required" });
      if (!role) return json(400, { error: "role is required" });

      const dealerRow = await svc.from("dealers").select("id, name").eq("id", dealerId).maybeSingle();
      if (dealerRow.error) return json(500, { error: dealerRow.error.message });
      if (!dealerRow.data) return json(404, { error: "Dealer not found" });
      const dealerName = safeTrim((dealerRow.data as any).name) || undefined;

      let profile = await svc.from("profiles").select("id, email, role").eq("email", email).maybeSingle();
      if (profile.error) return json(500, { error: profile.error.message });

      let userId: string | null = (profile.data as any)?.id ?? null;

      if (!userId) {
        try {
          userId = await findAuthUserIdByEmail(svc, email);
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          return json(500, { error: err.message });
        }
      }

      if (!userId) {
        const invite = await svc.auth.admin.inviteUserByEmail(email, { redirectTo } as any);
        if (invite.error) return json(400, { error: invite.error.message });
        userId = (invite.data as any)?.user?.id ?? null;
        if (!userId) return json(500, { error: "Failed to create invited user" });

      }

      const upsert = await svc
        .from("profiles")
        .upsert(
          {
            id: userId,
            email,
            role,
            company_name: dealerName ?? null,
            display_name: displayName || null,
            is_active: status !== "DISABLED",
          } as any,
          { onConflict: "id" },
        );
      if (upsert.error) return json(500, { error: upsert.error.message });

      const insert = await svc
        .from("dealer_members")
        .upsert(
          {
            dealer_id: dealerId,
            user_id: userId,
            role,
            status,
          } as any,
          { onConflict: "dealer_id,user_id" },
        )
        .select("id")
        .single();
      if (insert.error) return json(400, { error: insert.error.message });

      return json(200, { dealerMemberId: (insert.data as any)?.id ?? null, userId });
    }

    if (action === "remove_dealer_member") {
      const dealerMemberId = safeTrim((body as any).dealerMemberId);
      if (!dealerMemberId) return json(400, { error: "dealerMemberId is required" });

      const memberRow = await svc.from("dealer_members").select("id, dealer_id, user_id").eq("id", dealerMemberId).maybeSingle();
      if (memberRow.error) return json(400, { error: memberRow.error.message });
      const userId = safeTrim((memberRow.data as any)?.user_id);
      if (!userId) return json(404, { error: "Dealer member not found" });

      const memberships = await svc.from("dealer_members").select("id").eq("user_id", userId);
      if (memberships.error) return json(500, { error: memberships.error.message });
      const membershipCount = Array.isArray(memberships.data) ? memberships.data.length : 0;
      if (membershipCount > 1) {
        return json(400, {
          error:
            "This user belongs to multiple dealerships. Remove the other memberships first before deleting the account.",
        });
      }

      const delMember = await svc.from("dealer_members").delete().eq("id", dealerMemberId);
      if (delMember.error) return json(400, { error: delMember.error.message });

      const delProfile = await svc.from("profiles").delete().eq("id", userId);
      if (delProfile.error) return json(500, { error: delProfile.error.message });

      const delUser = await svc.auth.admin.deleteUser(userId);
      if (delUser.error) return json(400, { error: delUser.error.message });

      return json(200, { ok: true, userId });
    }

    if (action === "update_dealer_member") {
      const dealerMemberId = safeTrim((body as any).dealerMemberId);
      const patch = ((body as any).patch ?? {}) as any;
      if (!dealerMemberId) return json(400, { error: "dealerMemberId is required" });

      const updateRow: Record<string, unknown> = {};
      if (typeof patch.role === "string") {
        const r = normalizeDealerMemberRole(patch.role);
        if (!r) return json(400, { error: "Invalid role" });
        updateRow.role = r;
      }
      if (typeof patch.status === "string") {
        const s = normalizeDealerMemberStatus(patch.status);
        if (!s) return json(400, { error: "Invalid status" });
        updateRow.status = s;
      }

      if (Object.keys(updateRow).length === 0) return json(400, { error: "No changes provided" });

      const upd = await svc.from("dealer_members").update(updateRow).eq("id", dealerMemberId).select("dealer_id, user_id, role, status").single();
      if (upd.error) return json(400, { error: upd.error.message });

      const userId = safeTrim((upd.data as any)?.user_id);
      const role = safeTrim((upd.data as any)?.role);
      const status = safeTrim((upd.data as any)?.status);
      if (userId) {
        const profUpd = await svc
          .from("profiles")
          .update({ role, is_active: status !== "DISABLED" } as any)
          .eq("id", userId);
        if (profUpd.error) return json(500, { error: profUpd.error.message });
      }

      return json(200, { ok: true });
    }

    return json(400, { error: "Unsupported action" });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("admin-dealer-tools error", { message: err.message, stack: err.stack });
    return json(500, { error: err.message || "Unknown error" });
  }
});
