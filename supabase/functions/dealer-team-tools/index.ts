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

type Action = "create_employee" | "update_employee" | "set_employee_status";

type Body =
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
      action: "update_employee";
      dealerMemberId: string;
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
    .maybeSingle();

  if (membership.error) throw new Error(membership.error.message);
  const m = membership.data as any;
  const dealerId = safeTrim(m?.dealer_id);
  const role = safeTrim(m?.role);

  if (dealerId && role === "DEALER_ADMIN") {
    const ds = await svc.from("dealerships").select("id").eq("legacy_dealer_id", dealerId).maybeSingle();
    if (ds.error) throw new Error(ds.error.message);
    return { svc, dealerId, dealershipId: safeTrim((ds.data as any)?.id), userId };
  }

  const dealershipMembership = await svc
    .from("dealership_members")
    .select("dealership_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (dealershipMembership.error) throw new Error(dealershipMembership.error.message);
  const dm = dealershipMembership.data as any;
  const dealershipId = safeTrim(dm?.dealership_id);
  const dealershipRole = safeTrim(dm?.role);

  if (!dealerId && !dealershipId) throw new HttpError(403, "No dealership assigned");
  if (dealershipRole !== "admin") throw new HttpError(403, "Forbidden");

  const ds = await svc.from("dealerships").select("legacy_dealer_id").eq("id", dealershipId).maybeSingle();
  if (ds.error) throw new Error(ds.error.message);

  return { svc, dealerId: safeTrim((ds.data as any)?.legacy_dealer_id), dealershipId, userId };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const jwt = getJwt(req);
    if (!jwt) return json(401, { error: "Missing Authorization bearer token" });

    const { svc, dealerId, dealershipId } = await assertDealerAdmin(jwt);

    const body = (await req.json()) as Partial<Body>;
    const action = (body as any)?.action as Action | undefined;
    if (!action) return json(400, { error: "action is required" });

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

    if (action === "update_employee") {
      const dealerMemberId = safeTrim((body as any)?.dealerMemberId);
      const e = (body as any)?.employee ?? {};
      const firstName = safeTrim(e.firstName);
      const lastName = safeTrim(e.lastName);
      const phone = safeTrim(e.phone) || null;
      const email = normalizeEmail(e.email);
      const role = normalizeRole(safeTrim(e.role));

      if (!dealerMemberId) return json(400, { error: "dealerMemberId is required" });
      if (!firstName) return json(400, { error: "firstName is required" });
      if (!lastName) return json(400, { error: "lastName is required" });
      if (!email) return json(400, { error: "email is required" });
      if (!role) return json(400, { error: "role is required" });

      const currentMember = await svc
        .from("dealer_members")
        .select("id, dealer_id, user_id, status")
        .eq("id", dealerMemberId)
        .maybeSingle();

      if (currentMember.error) return json(400, { error: currentMember.error.message });
      const m = currentMember.data as any;
      if (!m) return json(404, { error: "Member not found" });
      if (safeTrim(m.dealer_id) !== dealerId) return json(403, { error: "Forbidden" });

      const targetUserId = safeTrim(m.user_id);
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

      const memberUpd = await svc.from("dealer_members").update({ role } as any).eq("id", dealerMemberId);
      if (memberUpd.error) return json(400, { error: memberUpd.error.message });

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

    return json(400, { error: "Unsupported action" });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const status = err instanceof HttpError ? err.status : 500;
    console.error("dealer-team-tools error", { status, message: err.message, stack: err.stack });
    return json(status, { error: err.message || "Unknown error" });
  }
});
