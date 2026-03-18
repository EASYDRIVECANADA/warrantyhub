import { corsHeaders } from "../_shared/cors.ts";
import { getStripe } from "../_shared/stripe.ts";
import { getAuthedSupabaseClient, getServiceSupabaseClient } from "../_shared/supabase.ts";

type Body = {
  dealerId: string;
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

function getOrigin(req: Request) {
  const origin = (req.headers.get("origin") ?? "").trim();
  if (origin) return origin;

  const referer = (req.headers.get("referer") ?? "").trim();
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore
    }
  }

  const env = (Deno.env.get("PUBLIC_SITE_URL") ?? Deno.env.get("SITE_URL") ?? "").trim();
  if (env) {
    try {
      return new URL(env).origin;
    } catch {
      // ignore
    }
  }

  return "https://bridgewarranty.com";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const jwt = getJwt(req);
    if (!jwt) return json(401, { error: "Missing Authorization bearer token" });

    const body = (await req.json()) as Partial<Body>;
    const dealerId = (body.dealerId ?? "").toString().trim();
    if (!dealerId) return json(400, { error: "dealerId is required" });

    const supabase = getAuthedSupabaseClient(jwt);
    const { data: u, error: uerr } = await supabase.auth.getUser();
    if (uerr) return json(401, { error: uerr.message });
    const userId = (u.user?.id ?? "").toString();
    if (!userId) return json(401, { error: "Not authenticated" });

    const svc = getServiceSupabaseClient();

    const membership = await svc
      .from("dealer_members")
      .select("id, dealer_id, role, status")
      .eq("dealer_id", dealerId)
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (membership.error) return json(500, { error: membership.error.message });
    if (!membership.data || (membership.data as any).role !== "DEALER_ADMIN") {
      return json(403, { error: "Only Dealer Admin can manage billing" });
    }

    const dealerRow = await svc.from("dealers").select("stripe_customer_id").eq("id", dealerId).maybeSingle();
    if (dealerRow.error) return json(500, { error: dealerRow.error.message });
    const customerId = ((dealerRow.data as any)?.stripe_customer_id ?? "").toString().trim();
    if (!customerId) return json(400, { error: "No Stripe customer for this dealership" });

    const stripe = getStripe();
    const origin = getOrigin(req);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dealer-billing`,
    });

    return json(200, { url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: msg || "Unknown error" });
  }
});
