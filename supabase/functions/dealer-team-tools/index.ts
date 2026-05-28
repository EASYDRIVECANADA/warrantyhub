import { corsHeaders } from "../_shared/cors.ts";
import { getAuthedSupabaseClient, getServiceSupabaseClient } from "../_shared/supabase.ts";

declare const Deno: any;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Action =
  | "list_members"
  | "create_employee"
  | "link_existing_member"
  | "update_employee"
  | "set_employee_status"
  | "generate_temporary_password"
  | "delete_employee";

type Body =
  | {
      action: "list_members";
    }
  | {
      action: "create_employee";
      employee: {
        firstName: string;
        lastName: string;
        phone?: string;
        email: string;
        role: "DEALER_ADMIN" | "DEALER_EMPLOYEE";
      };
    }
  | {
      action: "link_existing_member";
      email: string;
      role: "DEALER_ADMIN" | "DEALER_EMPLOYEE";
    }
  | {
      action: "update_employee";
      dealerMemberId?: string;
      dealershipMemberId?: string;
      userId?: string;
      employee: {
        firstName: string;
        lastName: string;
        phone?: string;
        email: string;
        role: "DEALER_ADMIN" | "DEALER_EMPLOYEE";
      };
    }
  | {
      action: "set_employee_status";
      dealerMemberId: string;
      status: "ACTIVE" | "DISABLED";
    }
  | {
      action: "generate_temporary_password";
      userId: string;
    }
  | {
      action: "delete_employee";
      userId: string;
      dealerMemberId?: string;
      dealershipMemberId?: string;
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

function safeTrim(v: unknown) {
  return (v ?? "").toString().trim();
}

function normalizeEmail(email: string) {
  return (email ?? "").toString().trim().toLowerCase();
}

function normalizeRole(role: string) {
  if (role === "DEALER_ADMIN" || role === "DEALER_EMPLOYEE") return role;
  return null;
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

async function assertDealerAdmin(jwt: string) {
  const membership = await assertDealerMember(jwt);
  if (membership.role !== "admin") throw new HttpError(403, "Forbidden");
  return membership;
}

async function assertDealerMember(jwt: string) {
  const authed = getAuthedSupabaseClient(jwt);
  const { data: u, error: uerr } = await authed.auth.getUser();
  if (uerr) throw new HttpError(401, uerr.message);
  const userId = (u.user?.id ?? "").toString();
  if (!userId) throw new HttpError(401, "Not authenticated");

  const svc = getServiceSupabaseClient();
  const membership = await svc
    .from("dealer_members")
    .select("dealer_id, role, status")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1);

  if (membership.error) throw new Error(membership.error.message);
  const m = ((membership.data as any[]) || [])[0];
  const dealerId = safeTrim(m?.dealer_id);
  const role = safeTrim(m?.role);

  if (dealerId) {
    const ds = await svc.from("dealerships").select("id").eq("legacy_dealer_id", dealerId).limit(1);
    if (ds.error) throw new Error(ds.error.message);
    const dealership = ((ds.data as any[]) || [])[0];
    return {
      svc,
      dealerId,
      dealershipId: safeTrim(dealership?.id),
      userId,
      role: role === "DEALER_ADMIN" ? "admin" as const : "employee" as const,
    };
  }

  const dealershipMembership = await svc
    .from("dealership_members")
    .select("dealership_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (dealershipMembership.error) throw new Error(dealershipMembership.error.message);
  const dm = ((dealershipMembership.data as any[]) || [])[0];
  const dealershipId = safeTrim(dm?.dealership_id);
  const dealershipRole = safeTrim(dm?.role);

  if (!dealershipId) throw new HttpError(403, "No dealership assigned");

  const ds = await svc.from("dealerships").select("legacy_dealer_id").eq("id", dealershipId).limit(1);
  if (ds.error) throw new Error(ds.error.message);
  const dealership = ((ds.data as any[]) || [])[0];

  return {
    svc,
    dealerId: safeTrim(dealership?.legacy_dealer_id),
    dealershipId,
    userId,
    role: dealershipRole === "admin" ? "admin" as const : "employee" as const,
  };
}

async function syncDealershipUserRole(
  svc: any,
  input: {
    userId: string;
    role: "DEALER_ADMIN" | "DEALER_EMPLOYEE";
    dealerId: string;
    dealershipId: string;
  },
) {
  const dealershipRole = input.role === "DEALER_ADMIN" ? "admin" : "employee";
  const nextAppRole = input.role === "DEALER_ADMIN" ? "dealership_admin" : "dealership_employee";
  const oldAppRole = input.role === "DEALER_ADMIN" ? "dealership_employee" : "dealership_admin";

  if (input.dealerId) {
    const memberUpsert = await svc
      .from("dealer_members")
      .upsert(
        {
          dealer_id: input.dealerId,
          user_id: input.userId,
          role: input.role,
          status: "ACTIVE",
        } as any,
        { onConflict: "dealer_id,user_id" },
      );
    if (memberUpsert.error) throw new Error(memberUpsert.error.message);
  }

  if (input.dealershipId) {
    const dealershipMemberUpsert = await svc
      .from("dealership_members")
      .upsert(
        {
          dealership_id: input.dealershipId,
          user_id: input.userId,
          role: dealershipRole,
        } as any,
        { onConflict: "user_id,dealership_id" },
      );
    if (dealershipMemberUpsert.error) throw new Error(dealershipMemberUpsert.error.message);
  }

  const deleteOldRole = await svc.from("user_roles").delete().eq("user_id", input.userId).eq("role", oldAppRole);
  if (deleteOldRole.error) throw new Error(deleteOldRole.error.message);

  const userRoleUpsert = await svc
    .from("user_roles")
    .upsert({ user_id: input.userId, role: nextAppRole } as any, { onConflict: "user_id,role" });
  if (userRoleUpsert.error) throw new Error(userRoleUpsert.error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const jwt = getJwt(req);
    if (!jwt) return json(401, { error: "Missing Authorization bearer token" });

    const body = (await req.json()) as Partial<Body>;
    const action = (body as any)?.action as Action | undefined;
    if (!action) return json(400, { error: "action is required" });

    if (action === "list_members") {
      const { svc, dealerId, dealershipId } = await assertDealerMember(jwt);
      const rows: Array<{ id: string; user_id: string; role: string; created_at: string; source: "dealership" | "legacy" }> = [];
      const seenUserIds = new Set<string>();

      if (dealershipId) {
        const dealershipMembers = await svc
          .from("dealership_members")
          .select("id, user_id, role, created_at")
          .eq("dealership_id", dealershipId)
          .order("created_at");
        if (dealershipMembers.error) return json(400, { error: dealershipMembers.error.message });

        ((dealershipMembers.data || []) as any[]).forEach((m) => {
          const userId = safeTrim(m.user_id);
          if (!userId) return;
          rows.push({
            id: safeTrim(m.id),
            user_id: userId,
            role: safeTrim(m.role) === "admin" ? "admin" : "employee",
            created_at: safeTrim(m.created_at),
            source: "dealership",
          });
          seenUserIds.add(userId);
        });
      }

      if (dealerId) {
        const legacyMembers = await svc
          .from("dealer_members")
          .select("id, user_id, role, status, created_at, profiles:profiles(email, display_name, first_name, last_name, phone)")
          .eq("dealer_id", dealerId)
          .order("created_at");
        if (legacyMembers.error) return json(400, { error: legacyMembers.error.message });

        ((legacyMembers.data || []) as any[]).forEach((m) => {
          const userId = safeTrim(m.user_id);
          if (!userId || seenUserIds.has(userId) || safeTrim(m.status) === "DISABLED") return;
          rows.push({
            id: `legacy:${safeTrim(m.id)}`,
            user_id: userId,
            role: safeTrim(m.role) === "DEALER_ADMIN" ? "admin" : "employee",
            created_at: safeTrim(m.created_at),
            source: "legacy",
          });
          seenUserIds.add(userId);
        });
      }

      const userIds = rows.map((m) => m.user_id).filter(Boolean);
      const profileMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const profiles = await svc
          .from("profiles")
          .select("id, email, display_name, first_name, last_name, phone")
          .in("id", userIds);
        if (profiles.error) return json(400, { error: profiles.error.message });
        ((profiles.data || []) as any[]).forEach((p) => {
          profileMap[safeTrim(p.id)] = p;
        });
      }

      const members = rows.map((m) => {
        const profile = profileMap[m.user_id] || {};
        const name =
          safeTrim(profile.display_name) ||
          [safeTrim(profile.first_name), safeTrim(profile.last_name)].filter(Boolean).join(" ") ||
          safeTrim(profile.email) ||
          "Unknown";
        return {
          ...m,
          profile: {
            name,
            email: safeTrim(profile.email) || null,
            phone: safeTrim(profile.phone) || null,
          },
        };
      });

      return json(200, { members });
    }

    const { svc, dealerId, dealershipId, userId: actorUserId } = await assertDealerAdmin(jwt);

    if (action === "create_employee") {
      const e = (body as any)?.employee ?? {};
      const firstName = safeTrim(e.firstName);
      const lastName = safeTrim(e.lastName);
      const phone = safeTrim(e.phone) || null;
      const email = normalizeEmail(e.email);
      const temporaryPassword = generateTemporaryPassword();
      const role = normalizeRole(safeTrim(e.role));

      if (!firstName) return json(400, { error: "firstName is required" });
      if (!lastName) return json(400, { error: "lastName is required" });
      if (!email) return json(400, { error: "email is required" });
      if (!role) return json(400, { error: "role is required" });

      const created = await svc.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { mustChangePassword: true },
      } as any);

      if (created.error) {
        const rawMessage = created.error.message || "Could not create employee account";
        const message = rawMessage.toLowerCase().includes("already")
          ? "An account with this email already exists."
          : rawMessage;
        return json(400, { error: message });
      }
      const newUserId = (created.data as any)?.user?.id ?? "";
      if (!newUserId) return json(500, { error: "Failed to create user" });

      let dealerName: string | null = null;
      if (dealershipId) {
        const dealershipRow = await svc.from("dealerships").select("name").eq("id", dealershipId).maybeSingle();
        if (dealershipRow.error) return json(500, { error: dealershipRow.error.message });
        dealerName = safeTrim((dealershipRow.data as any)?.name) || null;
      }
      if (!dealerName && dealerId) {
        const dealerRow = await svc.from("dealers").select("name").eq("id", dealerId).maybeSingle();
        if (dealerRow.error) return json(500, { error: dealerRow.error.message });
        dealerName = safeTrim((dealerRow.data as any)?.name) || null;
      }

      const profUpsert = await svc
        .from("profiles")
        .upsert(
          {
            id: newUserId,
            email,
            role,
            display_name: `${firstName} ${lastName}`.trim(),
            company_name: dealerName,
            first_name: firstName,
            last_name: lastName,
            phone,
            is_active: true,
            must_change_password: true,
          } as any,
          { onConflict: "id" },
        );
      if (profUpsert.error) return json(500, { error: profUpsert.error.message });

      let dealerMemberId: string | null = null;
      if (dealerId) {
        const memberUpsert = await svc
          .from("dealer_members")
          .upsert(
            {
              dealer_id: dealerId,
              user_id: newUserId,
              role,
              status: "ACTIVE",
            } as any,
            { onConflict: "dealer_id,user_id" },
          )
          .select("id")
          .single();

        if (memberUpsert.error) return json(400, { error: memberUpsert.error.message });
        dealerMemberId = (memberUpsert.data as any)?.id ?? null;
      }

      if (dealershipId) {
        const dealershipRole = role === "DEALER_ADMIN" ? "admin" : "employee";
        const dealershipMemberUpsert = await svc
          .from("dealership_members")
          .upsert(
            {
              dealership_id: dealershipId,
              user_id: newUserId,
              role: dealershipRole,
            } as any,
            { onConflict: "user_id,dealership_id" },
          );

        if (dealershipMemberUpsert.error) return json(400, { error: dealershipMemberUpsert.error.message });
      }

      const v2Role = role === "DEALER_ADMIN" ? "dealership_admin" : "dealership_employee";
      const userRoleUpsert = await svc.from("user_roles").upsert({ user_id: newUserId, role: v2Role } as any, { onConflict: "user_id,role" });
      if (userRoleUpsert.error) return json(400, { error: userRoleUpsert.error.message });

      return json(200, {
        dealerMemberId,
        userId: newUserId,
        temporaryPassword,
      });
    }

    if (action === "link_existing_member") {
      const email = normalizeEmail((body as any)?.email);
      const role = normalizeRole(safeTrim((body as any)?.role));

      if (!email) return json(400, { error: "email is required" });
      if (!role) return json(400, { error: "role is required" });

      const profileRows = await svc
        .from("profiles")
        .select("id, first_name, last_name, display_name, phone")
        .eq("email", email)
        .limit(1);
      if (profileRows.error) return json(400, { error: profileRows.error.message });
      const profile = ((profileRows.data as any[]) || [])[0];
      const targetUserId = safeTrim(profile?.id);
      if (!targetUserId) return json(404, { error: "No account found for this email." });

      try {
        await syncDealershipUserRole(svc, { userId: targetUserId, role, dealerId, dealershipId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err ?? "");
        return json(400, { error: message });
      }

      const dealerName = dealershipId
        ? await svc.from("dealerships").select("name").eq("id", dealershipId).limit(1)
        : null;
      const legacyDealerName = !dealerName && dealerId
        ? await svc.from("dealers").select("name").eq("id", dealerId).limit(1)
        : null;
      const companyName =
        safeTrim(((dealerName?.data as any[]) || [])[0]?.name) ||
        safeTrim(((legacyDealerName?.data as any[]) || [])[0]?.name) ||
        null;

      const profileUpdate = await svc
        .from("profiles")
        .update({ role, company_name: companyName, is_active: true } as any)
        .eq("id", targetUserId);
      if (profileUpdate.error) return json(500, { error: profileUpdate.error.message });

      return json(200, { ok: true, userId: targetUserId });
    }

    if (action === "update_employee") {
      const dealerMemberId = safeTrim((body as any)?.dealerMemberId);
      const dealershipMemberId = safeTrim((body as any)?.dealershipMemberId);
      const requestedUserId = safeTrim((body as any)?.userId);
      const e = (body as any)?.employee ?? {};
      const firstName = safeTrim(e.firstName);
      const lastName = safeTrim(e.lastName);
      const phone = safeTrim(e.phone) || null;
      const email = normalizeEmail(e.email);
      const role = normalizeRole(safeTrim(e.role));

      if (!dealerMemberId && !dealershipMemberId && !requestedUserId) return json(400, { error: "member id is required" });
      if (!firstName) return json(400, { error: "firstName is required" });
      if (!lastName) return json(400, { error: "lastName is required" });
      if (!email) return json(400, { error: "email is required" });
      if (!role) return json(400, { error: "role is required" });

      let targetUserId = requestedUserId;

      if (dealerMemberId) {
        const currentMember = await svc
          .from("dealer_members")
          .select("id, dealer_id, user_id, status")
          .eq("id", dealerMemberId)
          .maybeSingle();

        if (currentMember.error) return json(400, { error: currentMember.error.message });
        const m = currentMember.data as any;
        if (!m) return json(404, { error: "Member not found" });
        if (safeTrim(m.dealer_id) !== dealerId) return json(403, { error: "Forbidden" });
        targetUserId = safeTrim(m.user_id);
      }

      if (dealershipMemberId) {
        const currentDealershipMember = await svc
          .from("dealership_members")
          .select("id, dealership_id, user_id")
          .eq("id", dealershipMemberId)
          .maybeSingle();

        if (currentDealershipMember.error) return json(400, { error: currentDealershipMember.error.message });
        const dm = currentDealershipMember.data as any;
        if (!dm) return json(404, { error: "Member not found" });
        if (safeTrim(dm.dealership_id) !== dealershipId) return json(403, { error: "Forbidden" });
        targetUserId = safeTrim(dm.user_id);
      }

      if (!targetUserId) return json(400, { error: "Member has no user" });

      const updUser = await svc.auth.admin.updateUserById(targetUserId, {
        email,
      } as any);
      if (updUser.error) return json(400, { error: updUser.error.message });

      const dealerRow = await svc.from("dealers").select("name").eq("id", dealerId).maybeSingle();
      if (dealerRow.error) return json(500, { error: dealerRow.error.message });
      const dealerName = safeTrim((dealerRow.data as any)?.name) || null;

      const profUpd = await svc
        .from("profiles")
        .update(
          {
            email,
            role,
            display_name: `${firstName} ${lastName}`.trim(),
            company_name: dealerName,
            first_name: firstName,
            last_name: lastName,
            phone,
          } as any,
        )
        .eq("id", targetUserId);
      if (profUpd.error) return json(500, { error: profUpd.error.message });

      try {
        await syncDealershipUserRole(svc, { userId: targetUserId, role, dealerId, dealershipId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err ?? "");
        return json(400, { error: message });
      }

      return json(200, { ok: true });
    }

    if (action === "set_employee_status") {
      const dealerMemberId = safeTrim((body as any)?.dealerMemberId);
      const status = safeTrim((body as any)?.status);
      if (!dealerMemberId) return json(400, { error: "dealerMemberId is required" });
      if (status !== "ACTIVE" && status !== "DISABLED") return json(400, { error: "Invalid status" });

      const currentMember = await svc
        .from("dealer_members")
        .select("id, dealer_id, user_id")
        .eq("id", dealerMemberId)
        .maybeSingle();

      if (currentMember.error) return json(400, { error: currentMember.error.message });
      const m = currentMember.data as any;
      if (!m) return json(404, { error: "Member not found" });
      if (safeTrim(m.dealer_id) !== dealerId) return json(403, { error: "Forbidden" });

      const upd = await svc.from("dealer_members").update({ status } as any).eq("id", dealerMemberId);
      if (upd.error) return json(400, { error: upd.error.message });

      const userId = safeTrim(m.user_id);
      if (userId) {
        const profUpd = await svc.from("profiles").update({ is_active: status === "ACTIVE" } as any).eq("id", userId);
        if (profUpd.error) return json(500, { error: profUpd.error.message });
      }

      return json(200, { ok: true });
    }

    if (action === "generate_temporary_password") {
      const targetUserId = safeTrim((body as any)?.userId);
      if (!targetUserId) return json(400, { error: "userId is required" });

      let isTeamMember = false;
      if (dealershipId) {
        const currentMember = await svc
          .from("dealership_members")
          .select("user_id")
          .eq("dealership_id", dealershipId)
          .eq("user_id", targetUserId)
          .maybeSingle();

        if (currentMember.error) return json(400, { error: currentMember.error.message });
        isTeamMember = Boolean(currentMember.data);
      }

      if (!isTeamMember && dealerId) {
        const currentMember = await svc
          .from("dealer_members")
          .select("user_id")
          .eq("dealer_id", dealerId)
          .eq("user_id", targetUserId)
          .maybeSingle();

        if (currentMember.error) return json(400, { error: currentMember.error.message });
        isTeamMember = Boolean(currentMember.data);
      }

      if (!isTeamMember) return json(404, { error: "Member not found" });

      const temporaryPassword = generateTemporaryPassword();
      const updUser = await svc.auth.admin.updateUserById(targetUserId, {
        password: temporaryPassword,
        user_metadata: { mustChangePassword: true },
      } as any);
      if (updUser.error) return json(400, { error: updUser.error.message });
      const profUpd = await svc.from("profiles").update({ must_change_password: true } as any).eq("id", targetUserId);
      if (profUpd.error) return json(500, { error: profUpd.error.message });

      return json(200, { temporaryPassword });
    }

    if (action === "delete_employee") {
      const targetUserId = safeTrim((body as any)?.userId);
      const dealerMemberId = safeTrim((body as any)?.dealerMemberId);
      const dealershipMemberId = safeTrim((body as any)?.dealershipMemberId);

      if (!targetUserId) return json(400, { error: "userId is required" });
      if (targetUserId === actorUserId) return json(400, { error: "You cannot delete your own account." });

      let foundMembership = false;

      if (dealerMemberId) {
        const currentMember = await svc
          .from("dealer_members")
          .select("id, dealer_id, user_id")
          .eq("id", dealerMemberId)
          .maybeSingle();

        if (currentMember.error) return json(400, { error: currentMember.error.message });
        const member = currentMember.data as any;
        if (!member) return json(404, { error: "Member not found" });
        if (safeTrim(member.dealer_id) !== dealerId || safeTrim(member.user_id) !== targetUserId) {
          return json(403, { error: "Forbidden" });
        }

        const del = await svc.from("dealer_members").delete().eq("id", dealerMemberId);
        if (del.error) return json(400, { error: del.error.message });
        foundMembership = true;
      }

      if (dealershipMemberId) {
        const currentMember = await svc
          .from("dealership_members")
          .select("id, dealership_id, user_id")
          .eq("id", dealershipMemberId)
          .maybeSingle();

        if (currentMember.error) return json(400, { error: currentMember.error.message });
        const member = currentMember.data as any;
        if (!member) return json(404, { error: "Member not found" });
        if (safeTrim(member.dealership_id) !== dealershipId || safeTrim(member.user_id) !== targetUserId) {
          return json(403, { error: "Forbidden" });
        }

        const del = await svc.from("dealership_members").delete().eq("id", dealershipMemberId);
        if (del.error) return json(400, { error: del.error.message });
        foundMembership = true;
      }

      if (!foundMembership && dealerId) {
        const del = await svc
          .from("dealer_members")
          .delete()
          .eq("dealer_id", dealerId)
          .eq("user_id", targetUserId)
          .select("id");
        if (del.error) return json(400, { error: del.error.message });
        foundMembership = Array.isArray(del.data) && del.data.length > 0;
      }

      if (dealershipId) {
        const del = await svc
          .from("dealership_members")
          .delete()
          .eq("dealership_id", dealershipId)
          .eq("user_id", targetUserId)
          .select("id");
        if (del.error) return json(400, { error: del.error.message });
        foundMembership = foundMembership || (Array.isArray(del.data) && del.data.length > 0);
      }

      if (!foundMembership) return json(404, { error: "Member not found" });

      const remainingDealerMemberships = await svc.from("dealer_members").select("id").eq("user_id", targetUserId);
      if (remainingDealerMemberships.error) return json(500, { error: remainingDealerMemberships.error.message });
      const remainingDealershipMemberships = await svc.from("dealership_members").select("id").eq("user_id", targetUserId);
      if (remainingDealershipMemberships.error) return json(500, { error: remainingDealershipMemberships.error.message });

      const hasRemainingMemberships =
        (Array.isArray(remainingDealerMemberships.data) && remainingDealerMemberships.data.length > 0) ||
        (Array.isArray(remainingDealershipMemberships.data) && remainingDealershipMemberships.data.length > 0);

      await svc.from("user_roles").delete().eq("user_id", targetUserId).in("role", ["dealership_admin", "dealership_employee"]);

      if (!hasRemainingMemberships) {
        const delProfile = await svc.from("profiles").delete().eq("id", targetUserId);
        if (delProfile.error) return json(500, { error: delProfile.error.message });

        const delUser = await svc.auth.admin.deleteUser(targetUserId);
        if (delUser.error) return json(400, { error: delUser.error.message });
      }

      return json(200, { ok: true, deletedUser: !hasRemainingMemberships });
    }

    return json(400, { error: "Unsupported action" });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const status = err instanceof HttpError ? err.status : 500;
    console.error("dealer-team-tools error", { status, message: err.message, stack: err.stack });
    return json(status, { error: err.message || "Unknown error" });
  }
});
