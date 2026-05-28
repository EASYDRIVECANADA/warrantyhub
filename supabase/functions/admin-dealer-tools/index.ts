import { corsHeaders } from "../_shared/cors.ts";
import { getAuthedSupabaseClient, getServiceSupabaseClient } from "../_shared/supabase.ts";

type Action =
  | "invite_user"
  | "update_user_email"
  | "generate_password_reset_link"
  | "generate_temporary_password"
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
      action: "generate_temporary_password";
      userId: string;
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

function v2DealershipRole(role: string) {
  return role === "DEALER_ADMIN" ? "admin" : "employee";
}

function v2UserRole(role: string) {
  return role === "DEALER_ADMIN" ? "dealership_admin" : "dealership_employee";
}

async function syncUserDealershipRole(
  svc: ReturnType<typeof getServiceSupabaseClient>,
  userId: string,
  role: string,
) {
  const nextRole = v2UserRole(role);
  const previousRole = nextRole === "dealership_admin" ? "dealership_employee" : "dealership_admin";
  const userRole = await svc.from("user_roles").upsert({ user_id: userId, role: nextRole } as any, { onConflict: "user_id,role" });
  if (userRole.error) throw new Error(userRole.error.message);
  const oldRoleDelete = await svc.from("user_roles").delete().eq("user_id", userId).eq("role", previousRole);
  if (oldRoleDelete.error) throw new Error(oldRoleDelete.error.message);
}

const TEMP_PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMP_PASSWORD_LOWER = "abcdefghijkmnopqrstuvwxyz";
const TEMP_PASSWORD_DIGITS = "23456789";
const TEMP_PASSWORD_SYMBOLS = "!@#$%^&*";
const TEMP_PASSWORD_ALL = `${TEMP_PASSWORD_UPPER}${TEMP_PASSWORD_LOWER}${TEMP_PASSWORD_DIGITS}${TEMP_PASSWORD_SYMBOLS}`;

function randomIndex(max: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function pickChar(chars: string) {
  return chars[randomIndex(chars.length)]!;
}

function shuffleChars(chars: string[]) {
  const next = [...chars];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
  }
  return next;
}

function generateTemporaryPassword() {
  const chars = [
    pickChar(TEMP_PASSWORD_UPPER),
    pickChar(TEMP_PASSWORD_LOWER),
    pickChar(TEMP_PASSWORD_DIGITS),
    pickChar(TEMP_PASSWORD_SYMBOLS),
  ];

  while (chars.length < 16) {
    chars.push(pickChar(TEMP_PASSWORD_ALL));
  }

  return shuffleChars(chars).join("");
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

async function ensureDealershipBridge(
  svc: ReturnType<typeof getServiceSupabaseClient>,
  dealerId: string,
  dealerName?: string,
) {
  const existing = await svc.from("dealerships").select("id").eq("legacy_dealer_id", dealerId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const existingId = safeTrim((existing.data as any)?.id);
  if (existingId) return existingId;

  const insert = await svc
    .from("dealerships")
    .upsert(
      {
        name: safeTrim(dealerName) || "Dealership",
        legacy_dealer_id: dealerId,
        status: "approved",
      } as any,
      { onConflict: "legacy_dealer_id" },
    )
    .select("id")
    .single();
  if (insert.error) throw new Error(insert.error.message);

  return safeTrim((insert.data as any)?.id);
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
  if (role === "SUPER_ADMIN") return { userId, svc };

  const v2Role = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (v2Role.error) throw new Error(v2Role.error.message);
  const userRole = ((v2Role.data as any)?.role ?? "").toString();
  if (userRole === "super_admin") return { userId, svc };

  throw new Error("Forbidden");
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

    if (action === "generate_temporary_password") {
      const targetUserId = safeTrim((body as any).userId);
      if (!targetUserId) return json(400, { error: "userId is required" });

      const temporaryPassword = generateTemporaryPassword();
      const upd = await svc.auth.admin.updateUserById(targetUserId, {
        password: temporaryPassword,
        user_metadata: { mustChangePassword: true },
      } as any);
      if (upd.error) return json(400, { error: upd.error.message });
      const profile = await svc.from("profiles").update({ must_change_password: true } as any).eq("id", targetUserId);
      if (profile.error) return json(500, { error: profile.error.message });

      return json(200, { temporaryPassword });
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

      const dealershipUpdate: Record<string, unknown> = {};
      if (typeof updateRow.name === "string") dealershipUpdate.name = updateRow.name;
      if (typeof updateRow.updated_at === "string") dealershipUpdate.updated_at = updateRow.updated_at;
      if (Object.keys(dealershipUpdate).length > 0) {
        const v2Upd = await svc.from("dealerships").update(dealershipUpdate).eq("legacy_dealer_id", dealerId);
        if (v2Upd.error) return json(400, { error: v2Upd.error.message });
      }

      return json(200, { ok: true });
    }

    if (action === "add_dealer_member") {
      const dealerId = safeTrim((body as any).dealerId);
      const email = normalizeEmail((body as any).email);
      const role = normalizeDealerMemberRole(safeTrim((body as any).role));
      const statusRaw = safeTrim((body as any).status) || "ACTIVE";
      const status = normalizeDealerMemberStatus(statusRaw) ?? "ACTIVE";
      const displayName = typeof (body as any).displayName === "string" ? (body as any).displayName.trim() : "";

      if (!dealerId) return json(400, { error: "dealerId is required" });
      if (!email) return json(400, { error: "email is required" });
      if (!role) return json(400, { error: "role is required" });

      const dealerRow = await svc.from("dealers").select("id, name").eq("id", dealerId).maybeSingle();
      if (dealerRow.error) return json(500, { error: dealerRow.error.message });
      if (!dealerRow.data) return json(404, { error: "Dealer not found" });
      const dealerName = safeTrim((dealerRow.data as any).name) || undefined;

      let dealershipId = "";
      try {
        dealershipId = await ensureDealershipBridge(svc, dealerId, dealerName);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return json(500, { error: err.message });
      }

      const profile = await svc.from("profiles").select("id, email, role").eq("email", email).limit(1);
      if (profile.error) return json(500, { error: profile.error.message });

      let userId: string | null = ((profile.data as any[])?.[0]?.id ?? null) as string | null;
      let temporaryPassword: string | null = null;

      if (!userId) {
        try {
          userId = await findAuthUserIdByEmail(svc, email);
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          return json(500, { error: err.message });
        }
      }

      if (!userId) {
        temporaryPassword = generateTemporaryPassword();
        const created = await svc.auth.admin.createUser({
          email,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: { mustChangePassword: true },
        } as any);
        if (created.error) return json(400, { error: created.error.message });
        userId = (created.data as any)?.user?.id ?? null;
        if (!userId) return json(500, { error: "Failed to create user" });
      }

      const profileRow = {
        id: userId,
        email,
        role,
        company_name: dealerName ?? null,
        display_name: displayName || null,
        is_active: status !== "DISABLED",
        ...(temporaryPassword ? { must_change_password: true } : {}),
      } as any;

      const upsert = await svc
        .from("profiles")
        .upsert(profileRow, { onConflict: "id" });
      if (upsert.error) return json(500, { error: upsert.error.message });

      const existingMember = await svc
        .from("dealer_members")
        .select("id")
        .eq("dealer_id", dealerId)
        .eq("user_id", userId)
        .limit(1);
      if (existingMember.error) return json(400, { error: existingMember.error.message });

      let dealerMemberId = ((existingMember.data as any[])?.[0]?.id ?? null) as string | null;
      if (dealerMemberId) {
        const updateMember = await svc
          .from("dealer_members")
          .update({ role, status } as any)
          .eq("dealer_id", dealerId)
          .eq("user_id", userId);
        if (updateMember.error) return json(400, { error: updateMember.error.message });
      } else {
        const insert = await svc
          .from("dealer_members")
          .insert(
            {
              dealer_id: dealerId,
              user_id: userId,
              role,
              status,
            } as any,
          )
          .select("id");
        if (insert.error) return json(400, { error: insert.error.message });
        dealerMemberId = ((insert.data as any[])?.[0]?.id ?? null) as string | null;
      }

      const dealershipMember = await svc
        .from("dealership_members")
        .upsert(
          {
            dealership_id: dealershipId,
            user_id: userId,
            role: v2DealershipRole(role),
          } as any,
          { onConflict: "user_id,dealership_id" },
        );
      if (dealershipMember.error) return json(400, { error: dealershipMember.error.message });

      try {
        await syncUserDealershipRole(svc, userId, role);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return json(400, { error: err.message });
      }

      return json(200, { dealerMemberId, userId, temporaryPassword });
    }

    if (action === "remove_dealer_member") {
      const dealerMemberId = safeTrim((body as any).dealerMemberId);
      if (!dealerMemberId) return json(400, { error: "dealerMemberId is required" });

      const memberRow = await svc.from("dealer_members").select("id, dealer_id, user_id").eq("id", dealerMemberId).maybeSingle();
      if (memberRow.error) return json(400, { error: memberRow.error.message });
      const userId = safeTrim((memberRow.data as any)?.user_id);
      const dealerId = safeTrim((memberRow.data as any)?.dealer_id);
      if (!userId) return json(404, { error: "Dealer member not found" });

      const dealershipRow = dealerId
        ? await svc.from("dealerships").select("id").eq("legacy_dealer_id", dealerId).maybeSingle()
        : null;
      if (dealershipRow?.error) return json(500, { error: dealershipRow.error.message });
      const dealershipId = safeTrim((dealershipRow?.data as any)?.id);

      const delMember = await svc.from("dealer_members").delete().eq("id", dealerMemberId);
      if (delMember.error) return json(400, { error: delMember.error.message });

      if (dealershipId) {
        const delDealershipMember = await svc
          .from("dealership_members")
          .delete()
          .eq("dealership_id", dealershipId)
          .eq("user_id", userId);
        if (delDealershipMember.error) return json(400, { error: delDealershipMember.error.message });
      }

      const remainingLegacyMemberships = await svc.from("dealer_members").select("id").eq("user_id", userId);
      if (remainingLegacyMemberships.error) return json(500, { error: remainingLegacyMemberships.error.message });
      const remainingV2Memberships = await svc.from("dealership_members").select("id").eq("user_id", userId);
      if (remainingV2Memberships.error) return json(500, { error: remainingV2Memberships.error.message });

      const hasRemainingMemberships =
        (Array.isArray(remainingLegacyMemberships.data) && remainingLegacyMemberships.data.length > 0) ||
        (Array.isArray(remainingV2Memberships.data) && remainingV2Memberships.data.length > 0);

      if (!hasRemainingMemberships) {
        await svc.from("user_roles").delete().eq("user_id", userId).in("role", ["dealership_admin", "dealership_employee"]);

        const delProfile = await svc.from("profiles").delete().eq("id", userId);
        if (delProfile.error) return json(500, { error: delProfile.error.message });

        const delUser = await svc.auth.admin.deleteUser(userId);
        if (delUser.error) return json(400, { error: delUser.error.message });
      }

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
      const dealerId = safeTrim((upd.data as any)?.dealer_id);
      const role = safeTrim((upd.data as any)?.role);
      const status = safeTrim((upd.data as any)?.status);
      if (userId) {
        const profUpd = await svc
          .from("profiles")
          .update({ role, is_active: status !== "DISABLED" } as any)
          .eq("id", userId);
        if (profUpd.error) return json(500, { error: profUpd.error.message });

        const dealerRow = dealerId ? await svc.from("dealers").select("name").eq("id", dealerId).maybeSingle() : null;
        if (dealerRow?.error) return json(500, { error: dealerRow.error.message });
        let dealershipId = "";
        if (dealerId) {
          try {
            dealershipId = await ensureDealershipBridge(svc, dealerId, safeTrim((dealerRow?.data as any)?.name));
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            return json(500, { error: err.message });
          }
        }
        if (dealershipId && role) {
          const dealershipMember = await svc
            .from("dealership_members")
            .upsert(
              {
                dealership_id: dealershipId,
                user_id: userId,
                role: v2DealershipRole(role),
              } as any,
              { onConflict: "user_id,dealership_id" },
            );
          if (dealershipMember.error) return json(400, { error: dealershipMember.error.message });
        }

        if (role) {
          try {
            await syncUserDealershipRole(svc, userId, role);
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            return json(400, { error: err.message });
          }
        }
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
