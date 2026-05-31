import { createClient } from "npm:@supabase/supabase-js@2.90.1";

declare const Deno: any;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getServiceSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function getAuthedSupabaseClient(jwt: string) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type CompanyType = "dealership" | "provider";
type Action =
  | "approve_access_request"
  | "reject_access_request"
  | "create_provider_account"
  | "create_company_member"
  | "update_company_member_role"
  | "generate_temporary_password"
  | "remove_company_member";

type CompanyMemberRole = "admin" | "employee" | "member";

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

function normalizeEmail(email: unknown) {
  return safeTrim(email).toLowerCase();
}

function profileRoleFor(companyType: CompanyType, role: CompanyMemberRole) {
  if (companyType === "provider") return "PROVIDER";
  return role === "admin" ? "DEALER_ADMIN" : "DEALER_EMPLOYEE";
}

function appRoleFor(companyType: CompanyType, role: CompanyMemberRole) {
  if (companyType === "provider") return "provider";
  return role === "admin" ? "dealership_admin" : "dealership_employee";
}

function dealershipRoleFor(role: CompanyMemberRole) {
  return role === "admin" ? "admin" : "employee";
}

function providerRoleFor(role: CompanyMemberRole) {
  return role === "admin" ? "admin" : "member";
}

function legacyDealerRoleFor(role: CompanyMemberRole) {
  return role === "admin" ? "DEALER_ADMIN" : "DEALER_EMPLOYEE";
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
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
  while (chars.length < 16) chars.push(pickChar(TEMP_PASSWORD_ALL));
  return shuffleChars(chars).join("");
}

async function assertSuperAdmin(jwt: string) {
  const authed = getAuthedSupabaseClient(jwt);
  const { data: u, error: uerr } = await authed.auth.getUser();
  if (uerr) throw new HttpError(401, uerr.message);
  const userId = safeTrim(u.user?.id);
  if (!userId) throw new HttpError(401, "Not authenticated");

  const svc = getServiceSupabaseClient();
  const legacy = await svc.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (legacy.error) throw new Error(legacy.error.message);
  if (safeTrim((legacy.data as any)?.role) === "SUPER_ADMIN") return { svc, userId };

  const v2 = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (v2.error) throw new Error(v2.error.message);
  if (safeTrim((v2.data as any)?.role) === "super_admin") return { svc, userId };

  throw new HttpError(403, "Forbidden");
}

async function assertCompanyAdmin(jwt: string, companyType: CompanyType, companyId: string) {
  const authed = getAuthedSupabaseClient(jwt);
  const { data: u, error: uerr } = await authed.auth.getUser();
  if (uerr) throw new HttpError(401, uerr.message);
  const userId = safeTrim(u.user?.id);
  if (!userId) throw new HttpError(401, "Not authenticated");

  const svc = getServiceSupabaseClient();
  if (companyType === "provider") {
    const member = await svc
      .from("provider_members")
      .select("role")
      .eq("provider_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (member.error) throw new Error(member.error.message);
    if (safeTrim((member.data as any)?.role) !== "admin") throw new HttpError(403, "Provider admin access required");
    return { svc, userId };
  }

  const member = await svc
    .from("dealership_members")
    .select("role")
    .eq("dealership_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (member.error) throw new Error(member.error.message);
  if (safeTrim((member.data as any)?.role) !== "admin") throw new HttpError(403, "Dealership admin access required");
  return { svc, userId };
}

async function assertCompanyManager(jwt: string, companyType: CompanyType, companyId: string) {
  try {
    return await assertSuperAdmin(jwt);
  } catch (e) {
    const err = e instanceof HttpError ? e : null;
    if (!err || err.status !== 403) throw e;
  }

  return await assertCompanyAdmin(jwt, companyType, companyId);
}

async function findAuthUserIdByEmail(svc: ReturnType<typeof getServiceSupabaseClient>, email: string) {
  const profile = await svc.from("profiles").select("id").eq("email", email).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  if ((profile.data as any)?.id) return String((profile.data as any).id);

  const pageSize = 1000;
  for (let page = 1; page <= 50; page++) {
    const res = await svc.auth.admin.listUsers({ page, perPage: pageSize } as any);
    if (res.error) throw new Error(res.error.message);
    const users = ((res.data as any)?.users ?? []) as any[];
    const found = users.find((u) => normalizeEmail(u?.email) === email);
    if (found?.id) return String(found.id);
    if (users.length < pageSize) break;
  }
  return null;
}

async function getRequestProfileId(svc: ReturnType<typeof getServiceSupabaseClient>, request: any) {
  const requesterId = safeTrim(request.requester_id);
  if (requesterId) return requesterId;
  const email = normalizeEmail(request.email);
  if (!email) throw new HttpError(400, "Access request email is required");
  const userId = await findAuthUserIdByEmail(svc, email);
  if (!userId) throw new HttpError(404, "Requester profile not found");
  return userId;
}

async function auditAccessRequest(
  svc: ReturnType<typeof getServiceSupabaseClient>,
  input: {
    accessRequestId: string;
    action: "APPROVED" | "REJECTED";
    fromStatus: string;
    actorUserId: string;
    actorEmail?: string;
    assignedRole?: string | null;
    assignedCompany?: string | null;
  },
) {
  const insert = await svc.from("access_request_audit").insert({
    access_request_id: input.accessRequestId,
    action: input.action,
    from_status: input.fromStatus,
    to_status: input.action,
    assigned_role: input.assignedRole ?? null,
    assigned_company: input.assignedCompany ?? null,
    actor_user_id: input.actorUserId,
    actor_email: input.actorEmail ?? null,
  } as any);
  if (insert.error) throw new Error(insert.error.message);
}

async function approveDealership(
  svc: ReturnType<typeof getServiceSupabaseClient>,
  request: any,
  companyName: string,
  profileId: string,
) {
  const legacyDealer = await svc
    .from("dealers")
    .insert({ name: companyName, markup_pct: 0 } as any)
    .select("id")
    .single();
  if (legacyDealer.error) throw new Error(legacyDealer.error.message);
  const dealerId = safeTrim((legacyDealer.data as any)?.id);
  if (!dealerId) throw new Error("Failed to create dealership");

  const dealership = await svc
    .from("dealerships")
    .upsert(
      {
        name: companyName,
        phone: null,
        province: null,
        status: "approved",
        legacy_dealer_id: dealerId,
      } as any,
      { onConflict: "legacy_dealer_id" },
    )
    .select("id")
    .single();
  if (dealership.error) throw new Error(dealership.error.message);
  const dealershipId = safeTrim((dealership.data as any)?.id);
  if (!dealershipId) throw new Error("Failed to create dealership entity");

  const legacyMember = await svc
    .from("dealer_members")
    .upsert(
      {
        dealer_id: dealerId,
        user_id: profileId,
        role: "DEALER_ADMIN",
        status: "ACTIVE",
      } as any,
      { onConflict: "dealer_id,user_id" },
    );
  if (legacyMember.error) throw new Error(legacyMember.error.message);

  const member = await svc
    .from("dealership_members")
    .upsert(
      {
        dealership_id: dealershipId,
        user_id: profileId,
        role: "admin",
      } as any,
      { onConflict: "user_id,dealership_id" },
    );
  if (member.error) throw new Error(member.error.message);

  const profile = await svc
    .from("profiles")
    .update({
      role: "DEALER_ADMIN",
      company_name: companyName,
      is_active: true,
    } as any)
    .eq("id", profileId);
  if (profile.error) throw new Error(profile.error.message);

  const role = await svc
    .from("user_roles")
    .upsert({ user_id: profileId, role: "dealership_admin" } as any, { onConflict: "user_id,role" });
  if (role.error) throw new Error(role.error.message);

  return { companyId: dealershipId, legacyDealerId: dealerId, userId: profileId, requestId: request.id };
}

async function approveProvider(
  svc: ReturnType<typeof getServiceSupabaseClient>,
  request: any,
  companyName: string,
  profileId: string,
) {
  let providerId = "";
  const existing = await svc.from("providers").select("id").eq("legacy_profile_id", profileId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  providerId = safeTrim((existing.data as any)?.id);

  if (!providerId) {
    const byName = await svc.from("providers").select("id").eq("company_name", companyName).maybeSingle();
    if (byName.error) throw new Error(byName.error.message);
    providerId = safeTrim((byName.data as any)?.id);
  }

  if (!providerId) {
    const created = await svc
      .from("providers")
      .insert({
        company_name: companyName,
        contact_email: normalizeEmail(request.email) || null,
        status: "approved",
        legacy_profile_id: profileId,
      } as any)
      .select("id")
      .single();
    if (created.error) throw new Error(created.error.message);
    providerId = safeTrim((created.data as any)?.id);
  } else {
    const updated = await svc
      .from("providers")
      .update({
        company_name: companyName,
        contact_email: normalizeEmail(request.email) || null,
        status: "approved",
        legacy_profile_id: profileId,
      } as any)
      .eq("id", providerId);
    if (updated.error) throw new Error(updated.error.message);
  }

  if (!providerId) throw new Error("Failed to create provider");

  const member = await svc
    .from("provider_members")
    .upsert(
      {
        provider_id: providerId,
        user_id: profileId,
        role: "admin",
      } as any,
      { onConflict: "user_id,provider_id" },
    );
  if (member.error) throw new Error(member.error.message);

  const profile = await svc
    .from("profiles")
    .update({
      role: "PROVIDER",
      company_name: companyName,
      is_active: true,
    } as any)
    .eq("id", profileId);
  if (profile.error) throw new Error(profile.error.message);

  const role = await svc
    .from("user_roles")
    .upsert({ user_id: profileId, role: "provider" } as any, { onConflict: "user_id,role" });
  if (role.error) throw new Error(role.error.message);

  return { companyId: providerId, userId: profileId, requestId: request.id };
}

async function createOrUpdateAuthUser(
  svc: ReturnType<typeof getServiceSupabaseClient>,
  member: any,
  companyType: CompanyType,
  companyName: string,
  role: CompanyMemberRole,
) {
  const email = normalizeEmail(member.email);
  const firstName = safeTrim(member.firstName);
  const lastName = safeTrim(member.lastName);
  const phone = safeTrim(member.phone) || null;
  if (!email) throw new HttpError(400, "member.email is required");
  if (!firstName) throw new HttpError(400, "member.firstName is required");
  if (!lastName) throw new HttpError(400, "member.lastName is required");

  const temporaryPassword = generateTemporaryPassword();
  let userId = await findAuthUserIdByEmail(svc, email);

  if (!userId) {
    const created = await svc.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { mustChangePassword: true },
    } as any);
    if (created.error) throw new HttpError(400, created.error.message);
    userId = safeTrim((created.data as any)?.user?.id);
  } else {
    const updated = await svc.auth.admin.updateUserById(userId, {
      email,
      password: temporaryPassword,
      user_metadata: { mustChangePassword: true },
    } as any);
    if (updated.error) throw new HttpError(400, updated.error.message);
  }

  if (!userId) throw new Error("Failed to create user");

  const profile = await svc.from("profiles").upsert(
    {
      id: userId,
      email,
      role: profileRoleFor(companyType, role),
      display_name: `${firstName} ${lastName}`.trim(),
      first_name: firstName,
      last_name: lastName,
      phone,
      company_name: companyName,
      is_active: true,
      must_change_password: true,
    } as any,
    { onConflict: "id" },
  );
  if (profile.error) throw new Error(profile.error.message);

  const appRole = await svc
    .from("user_roles")
    .upsert({ user_id: userId, role: appRoleFor(companyType, role) } as any, { onConflict: "user_id,role" });
  if (appRole.error) throw new Error(appRole.error.message);

  if (companyType === "dealership") {
    const oldRole = appRoleFor(companyType, role) === "dealership_admin" ? "dealership_employee" : "dealership_admin";
    const del = await svc.from("user_roles").delete().eq("user_id", userId).eq("role", oldRole);
    if (del.error) throw new Error(del.error.message);
  }

  return { userId, temporaryPassword };
}

async function getCompanyName(svc: ReturnType<typeof getServiceSupabaseClient>, companyType: CompanyType, companyId: string) {
  const table = companyType === "provider" ? "providers" : "dealerships";
  const field = companyType === "provider" ? "company_name" : "name";
  const res = await svc.from(table).select(field).eq("id", companyId).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  const name = safeTrim((res.data as any)?.[field]);
  if (!name) throw new HttpError(404, "Company not found");
  return name;
}

async function createProviderAccount(svc: ReturnType<typeof getServiceSupabaseClient>, body: any) {
  const provider = body?.provider ?? {};
  const member = body?.member ?? {};
  const companyName = safeTrim(provider.companyName);
  const contactEmail = normalizeEmail(provider.contactEmail) || normalizeEmail(member.email) || null;
  const status = safeTrim(provider.status) || "approved";
  if (!companyName) throw new HttpError(400, "provider.companyName is required");

  const { userId, temporaryPassword } = await createOrUpdateAuthUser(
    svc,
    { ...member, role: "admin" },
    "provider",
    companyName,
    "admin",
  );

  const regionsServed = Array.isArray(provider.regionsServed)
    ? provider.regionsServed.map((region: unknown) => safeTrim(region)).filter(Boolean)
    : [];

  const existing = await svc.from("providers").select("id").eq("company_name", companyName).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  let providerId = safeTrim((existing.data as any)?.id);
  const providerRow = {
    company_name: companyName,
    contact_email: contactEmail,
    contact_phone: safeTrim(provider.contactPhone) || null,
    address: safeTrim(provider.address) || null,
    status,
    regions_served: regionsServed,
    legacy_profile_id: userId,
  } as any;

  if (providerId) {
    const updated = await svc.from("providers").update(providerRow).eq("id", providerId);
    if (updated.error) throw new Error(updated.error.message);
  } else {
    const created = await svc.from("providers").insert(providerRow).select("id").single();
    if (created.error) throw new Error(created.error.message);
    providerId = safeTrim((created.data as any)?.id);
  }

  if (!providerId) throw new Error("Failed to create provider");

  const upsert = await svc
    .from("provider_members")
    .upsert({ provider_id: providerId, user_id: userId, role: "admin" } as any, { onConflict: "user_id,provider_id" })
    .select("id")
    .single();
  if (upsert.error) throw new Error(upsert.error.message);

  return {
    providerId,
    providerMemberId: (upsert.data as any)?.id ?? null,
    userId,
    temporaryPassword,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const jwt = getJwt(req);
    if (!jwt) return json(401, { error: "Missing Authorization bearer token" });

    const body = await req.json();
    const action = safeTrim(body?.action) as Action;
    if (!action) return json(400, { error: "action is required" });

    if (action === "approve_access_request" || action === "reject_access_request") {
      const { svc, userId: actorUserId } = await assertSuperAdmin(jwt);
      const requestId = safeTrim(body?.requestId);
      if (!requestId) return json(400, { error: "requestId is required" });

      const reqRow = await svc
        .from("access_requests")
        .select("id, requester_id, request_type, company, name, email, status")
        .eq("id", requestId)
        .maybeSingle();
      if (reqRow.error) throw new Error(reqRow.error.message);
      const accessRequest = reqRow.data as any;
      if (!accessRequest) return json(404, { error: "Access request not found" });
      const fromStatus = safeTrim(accessRequest.status) || "PENDING";

      if (action === "reject_access_request") {
        const rejectionMessage = safeTrim(body?.rejectionMessage) || null;
        const upd = await svc
          .from("access_requests")
          .update({
            status: "REJECTED",
            reviewed_at: new Date().toISOString(),
            reviewed_by: actorUserId,
            rejection_message: rejectionMessage,
          } as any)
          .eq("id", requestId);
        if (upd.error) throw new Error(upd.error.message);
        await auditAccessRequest(svc, {
          accessRequestId: requestId,
          action: "REJECTED",
          fromStatus,
          actorUserId,
        });
        return json(200, { ok: true });
      }

      const companyType = safeTrim(body?.companyType) as CompanyType;
      if (companyType !== "dealership" && companyType !== "provider") {
        return json(400, { error: "companyType is required" });
      }

      const requestType = safeTrim(accessRequest.request_type);
      if (companyType === "provider" && requestType !== "PROVIDER") {
        return json(400, { error: "Request is not a provider request" });
      }
      if (companyType === "dealership" && requestType !== "DEALER") {
        return json(400, { error: "Request is not a dealership request" });
      }

      const assignedCompany = safeTrim(body?.assignedCompany) || safeTrim(accessRequest.company);
      if (!assignedCompany) return json(400, { error: "assignedCompany is required" });

      const profileId = await getRequestProfileId(svc, accessRequest);
      const result = companyType === "provider"
        ? await approveProvider(svc, accessRequest, assignedCompany, profileId)
        : await approveDealership(svc, accessRequest, assignedCompany, profileId);

      const assignedRole = companyType === "provider" ? "PROVIDER" : "DEALER_ADMIN";
      const upd = await svc
        .from("access_requests")
        .update({
          status: "APPROVED",
          reviewed_at: new Date().toISOString(),
          reviewed_by: actorUserId,
          assigned_role: assignedRole,
          assigned_company: assignedCompany,
          rejection_message: null,
        } as any)
        .eq("id", requestId);
      if (upd.error) throw new Error(upd.error.message);

      await auditAccessRequest(svc, {
        accessRequestId: requestId,
        action: "APPROVED",
        fromStatus,
        assignedRole,
        assignedCompany,
        actorUserId,
      });

      return json(200, { ok: true, ...result });
    }

    if (action === "create_provider_account") {
      const { svc } = await assertSuperAdmin(jwt);
      const result = await createProviderAccount(svc, body);
      return json(200, { ok: true, ...result });
    }

    const companyType = safeTrim(body?.companyType) as CompanyType;
    const companyId = safeTrim(body?.companyId);
    if (companyType !== "dealership" && companyType !== "provider") {
      return json(400, { error: "companyType is required" });
    }
    if (!companyId) return json(400, { error: "companyId is required" });

    const { svc, userId: actorUserId } = await assertCompanyManager(jwt, companyType, companyId);

    if (action === "create_company_member") {
      const member = body?.member ?? {};
      const role = safeTrim(member.role) as CompanyMemberRole;
      const normalizedRole = companyType === "provider" ? providerRoleFor(role) : dealershipRoleFor(role);
      const companyName = await getCompanyName(svc, companyType, companyId);
      const { userId, temporaryPassword } = await createOrUpdateAuthUser(
        svc,
        member,
        companyType,
        companyName,
        normalizedRole as CompanyMemberRole,
      );

      if (companyType === "provider") {
        const upsert = await svc
          .from("provider_members")
          .upsert({ provider_id: companyId, user_id: userId, role: normalizedRole } as any, { onConflict: "user_id,provider_id" })
          .select("id")
          .single();
        if (upsert.error) throw new Error(upsert.error.message);
        return json(200, { providerMemberId: (upsert.data as any)?.id ?? null, userId, temporaryPassword });
      }

      const dealershipMember = await svc
        .from("dealership_members")
        .upsert({ dealership_id: companyId, user_id: userId, role: normalizedRole } as any, { onConflict: "user_id,dealership_id" })
        .select("id")
        .single();
      if (dealershipMember.error) throw new Error(dealershipMember.error.message);

      const dealership = await svc.from("dealerships").select("legacy_dealer_id").eq("id", companyId).maybeSingle();
      if (dealership.error) throw new Error(dealership.error.message);
      const legacyDealerId = safeTrim((dealership.data as any)?.legacy_dealer_id);
      let dealerMemberId: string | null = null;
      if (legacyDealerId) {
        const legacy = await svc
          .from("dealer_members")
          .upsert(
            {
              dealer_id: legacyDealerId,
              user_id: userId,
              role: legacyDealerRoleFor(normalizedRole as CompanyMemberRole),
              status: "ACTIVE",
            } as any,
            { onConflict: "dealer_id,user_id" },
          )
          .select("id")
          .single();
        if (legacy.error) throw new Error(legacy.error.message);
        dealerMemberId = (legacy.data as any)?.id ?? null;
      }
      return json(200, { dealerMemberId, dealershipMemberId: (dealershipMember.data as any)?.id ?? null, userId, temporaryPassword });
    }

    if (action === "update_company_member_role") {
      const memberId = safeTrim(body?.memberId);
      const role = safeTrim(body?.role) as CompanyMemberRole;
      if (!memberId) return json(400, { error: "memberId is required" });
      const normalizedRole = companyType === "provider" ? providerRoleFor(role) : dealershipRoleFor(role);
      const table = companyType === "provider" ? "provider_members" : "dealership_members";
      const upd = await svc.from(table).update({ role: normalizedRole } as any).eq("id", memberId).select("user_id").single();
      if (upd.error) throw new Error(upd.error.message);
      const targetUserId = safeTrim((upd.data as any)?.user_id);
      if (targetUserId) {
        const profile = await svc
          .from("profiles")
          .update({ role: profileRoleFor(companyType, normalizedRole as CompanyMemberRole) } as any)
          .eq("id", targetUserId);
        if (profile.error) throw new Error(profile.error.message);
        const appRole = await svc
          .from("user_roles")
          .upsert({ user_id: targetUserId, role: appRoleFor(companyType, normalizedRole as CompanyMemberRole) } as any, { onConflict: "user_id,role" });
        if (appRole.error) throw new Error(appRole.error.message);
      }
      return json(200, { ok: true });
    }

    if (action === "generate_temporary_password") {
      const targetUserId = safeTrim(body?.userId);
      if (!targetUserId) return json(400, { error: "userId is required" });
      const table = companyType === "provider" ? "provider_members" : "dealership_members";
      const column = companyType === "provider" ? "provider_id" : "dealership_id";
      const member = await svc.from(table).select("id").eq(column, companyId).eq("user_id", targetUserId).maybeSingle();
      if (member.error) throw new Error(member.error.message);
      if (!member.data) return json(404, { error: "Member not found" });
      const temporaryPassword = generateTemporaryPassword();
      const upd = await svc.auth.admin.updateUserById(targetUserId, {
        password: temporaryPassword,
        user_metadata: { mustChangePassword: true },
      } as any);
      if (upd.error) throw new Error(upd.error.message);
      const profile = await svc.from("profiles").update({ must_change_password: true } as any).eq("id", targetUserId);
      if (profile.error) throw new Error(profile.error.message);
      return json(200, { temporaryPassword });
    }

    if (action === "remove_company_member") {
      const targetUserId = safeTrim(body?.userId);
      const memberId = safeTrim(body?.memberId);
      if (!targetUserId) return json(400, { error: "userId is required" });
      if (targetUserId === actorUserId) return json(400, { error: "You cannot remove your own account." });

      const table = companyType === "provider" ? "provider_members" : "dealership_members";
      const column = companyType === "provider" ? "provider_id" : "dealership_id";
      const del = memberId
        ? await svc.from(table).delete().eq("id", memberId).eq("user_id", targetUserId).eq(column, companyId).select("id")
        : await svc.from(table).delete().eq("user_id", targetUserId).eq(column, companyId).select("id");
      if (del.error) throw new Error(del.error.message);
      if (!Array.isArray(del.data) || del.data.length === 0) return json(404, { error: "Member not found" });

      if (companyType === "dealership") {
        const dealership = await svc.from("dealerships").select("legacy_dealer_id").eq("id", companyId).maybeSingle();
        if (dealership.error) throw new Error(dealership.error.message);
        const legacyDealerId = safeTrim((dealership.data as any)?.legacy_dealer_id);
        if (legacyDealerId) {
          const legacyDelete = await svc.from("dealer_members").delete().eq("dealer_id", legacyDealerId).eq("user_id", targetUserId);
          if (legacyDelete.error) throw new Error(legacyDelete.error.message);
        }
      }

      const remainingMemberships = companyType === "provider"
        ? await svc.from("provider_members").select("id").eq("user_id", targetUserId)
        : await svc.from("dealership_members").select("id").eq("user_id", targetUserId);
      if (remainingMemberships.error) throw new Error(remainingMemberships.error.message);
      const hasRemainingMemberships = Array.isArray(remainingMemberships.data) && remainingMemberships.data.length > 0;

      if (!hasRemainingMemberships) {
        await svc.from("user_roles").delete().eq("user_id", targetUserId).eq("role", appRoleFor(companyType, "member"));
        if (companyType === "dealership") {
          await svc.from("user_roles").delete().eq("user_id", targetUserId).eq("role", "dealership_admin");
          await svc.from("user_roles").delete().eq("user_id", targetUserId).eq("role", "dealership_employee");
        }
      }

      return json(200, { ok: true });
    }

    return json(400, { error: "Unsupported action" });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const status = err instanceof HttpError ? err.status : 500;
    console.error("company-access-tools error", { status, message: err.message, stack: err.stack });
    return json(status, { error: err.message || "Unknown error" });
  }
});
