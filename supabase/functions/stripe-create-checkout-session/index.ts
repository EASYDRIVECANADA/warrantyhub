import { corsHeaders } from "../_shared/cors.ts";
import { getStripe, getStripePriceIds } from "../_shared/stripe.ts";
import { getAuthedSupabaseClient, getServiceSupabaseClient } from "../_shared/supabase.ts";

type Body = {
  dealerId: string;
  planKey: "STANDARD" | "EARLY_ADOPTER";
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const jwt = getJwt(req);
    if (!jwt) return json(401, { error: "Missing Authorization bearer token" });

    const body = (await req.json()) as Partial<Body>;
    const dealerId = (body.dealerId ?? "").toString().trim();
    const planKey = body.planKey;
    if (!dealerId) return json(400, { error: "dealerId is required" });
    if (planKey !== "STANDARD" && planKey !== "EARLY_ADOPTER") return json(400, { error: "Invalid planKey" });

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
      return json(403, { error: "Only Dealer Admin can subscribe" });
    }

    const dealerRow = await svc.from("dealers").select("id, name, stripe_customer_id").eq("id", dealerId).maybeSingle();
    if (dealerRow.error) return json(500, { error: dealerRow.error.message });
    if (!dealerRow.data) return json(404, { error: "Dealer not found" });

    const stripe = getStripe();
    let customerId = ((dealerRow.data as any).stripe_customer_id ?? "").toString().trim();

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: ((dealerRow.data as any).name ?? "").toString() || undefined,
        metadata: {
          dealer_id: dealerId,
        },
      });
      customerId = customer.id;
      const upd = await svc.from("dealers").update({ stripe_customer_id: customerId }).eq("id", dealerId);
      if (upd.error) return json(500, { error: upd.error.message });
    }

    const { standardMonthly, earlyAdopterYearly } = getStripePriceIds();
    const priceId = planKey === "EARLY_ADOPTER" ? earlyAdopterYearly : standardMonthly;

    const origin = req.headers.get("origin") ?? "https://bridgewarranty.com";
    const successUrl = `${origin}/dealer-billing/success`;
    const cancelUrl = `${origin}/dealer-billing/cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_collection: "always",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 15,
        metadata: {
          dealer_id: dealerId,
          plan_key: planKey,
        },
      },
      metadata: {
        dealer_id: dealerId,
        plan_key: planKey,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    });

    return json(200, { url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: msg || "Unknown error" });
  }
});
