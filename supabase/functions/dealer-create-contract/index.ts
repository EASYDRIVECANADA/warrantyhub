import { corsHeaders } from "../_shared/cors.ts";
import { getStripe } from "../_shared/stripe.ts";
import { getAuthedSupabaseClient, getServiceSupabaseClient } from "../_shared/supabase.ts";

type CreateContractInput = Record<string, unknown> & { dealerId?: string };

function envFlag(name: string): boolean {
  const v = (Deno.env.get(name) ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

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

    const input = (await req.json()) as CreateContractInput;
    const dealerId = (input.dealerId ?? "").toString().trim();
    if (!dealerId) return json(400, { error: "dealerId is required" });

    const supabase = getAuthedSupabaseClient(jwt);
    const { data: u, error: uerr } = await supabase.auth.getUser();
    if (uerr) return json(401, { error: uerr.message });
    const userId = (u.user?.id ?? "").toString();
    const userEmail = (u.user?.email ?? "").toString();
    if (!userId) return json(401, { error: "Not authenticated" });

    const svc = getServiceSupabaseClient();

    // Verify dealership membership
    const membership = await svc
      .from("dealer_members")
      .select("id, dealer_id, role, status")
      .eq("dealer_id", dealerId)
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (membership.error) return json(500, { error: membership.error.message });
    if (!membership.data) return json(403, { error: "Not authorized" });

    // Load dealer billing state
    const dealerRow = await svc
      .from("dealers")
      .select(
        "id, stripe_customer_id, subscription_status, subscription_plan_key, subscription_current_period_end, contract_fee_cents",
      )
      .eq("id", dealerId)
      .maybeSingle();

    if (dealerRow.error) return json(500, { error: dealerRow.error.message });
    if (!dealerRow.data) return json(404, { error: "Dealer not found" });

    const status = ((dealerRow.data as any).subscription_status ?? "").toString();
    const planKey = ((dealerRow.data as any).subscription_plan_key ?? "").toString();
    const periodEndRaw = (dealerRow.data as any).subscription_current_period_end as string | null;
    const periodEnd = periodEndRaw ? new Date(periodEndRaw).getTime() : null;

    const now = Date.now();
    const isInGrace = status === "canceled" && typeof periodEnd === "number" && periodEnd > now;
    const isActive = status === "active" || status === "trialing" || isInGrace;
    const bypassSubscription = envFlag("BYPASS_SUBSCRIPTION_CHECK");
    if (!isActive && !bypassSubscription) {
      console.log("subscription_check_failed", {
        dealerId,
        status,
        planKey,
        subscription_current_period_end: periodEndRaw,
      });
      return json(402, { error: "Subscription required" });
    }

    // Charge per contract for Standard
    const feeCents = Number((dealerRow.data as any).contract_fee_cents ?? 0) || 0;
    const customerId = ((dealerRow.data as any).stripe_customer_id ?? "").toString().trim();

    let paymentIntentId: string | null = null;
    let paymentIntentStatus: string | null = null;

    if (!bypassSubscription && planKey === "STANDARD" && feeCents > 0) {
      if (!customerId) return json(400, { error: "Dealership missing Stripe customer" });
      const stripe = getStripe();
      try {
        const customer = await stripe.customers.retrieve(customerId);
        const defaultPmId =
          typeof customer === "object" && customer && !Array.isArray(customer)
            ? ((customer as any)?.invoice_settings?.default_payment_method ?? null)
            : null;

        let paymentMethodId: string | null = typeof defaultPmId === "string" ? defaultPmId : null;
        if (!paymentMethodId) {
          const pms = await stripe.paymentMethods.list({ customer: customerId, type: "card" });
          paymentMethodId = (pms.data?.[0]?.id ?? null) as string | null;
          if (paymentMethodId) {
            await stripe.customers.update(customerId, {
              invoice_settings: { default_payment_method: paymentMethodId },
            });
          }
        }

        if (!paymentMethodId) {
          return json(402, {
            error:
              "Payment method required. Please add a card in Billing Portal (or resubscribe with card) before creating contracts on the Standard plan.",
          });
        }

        const pi = await stripe.paymentIntents.create({
          amount: feeCents,
          currency: "cad",
          customer: customerId,
          payment_method: paymentMethodId,
          confirm: true,
          off_session: true,
          description: "Contract processing fee",
          metadata: {
            dealer_id: dealerId,
            created_by_user_id: userId,
            created_by_email: userEmail,
          },
        });
        paymentIntentId = pi.id;
        paymentIntentStatus = pi.status;

        if (pi.status !== "succeeded") {
          console.log("payment_intent_not_succeeded", {
            dealerId,
            paymentIntentId,
            paymentIntentStatus,
          });
          return json(402, { error: `Payment failed: ${pi.status}` });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("payment_intent_error", {
          dealerId,
          message: msg,
        });
        return json(402, { error: `Payment failed: ${msg}` });
      }
    }

    // Insert contract
    const nowIso = new Date().toISOString();
    const insert = {
      contract_number: (input.contractNumber ?? "").toString(),
      customer_name: (input.customerName ?? "").toString(),
      dealer_id: dealerId,
      provider_id: (input.providerId ?? null) as any,
      product_id: (input.productId ?? null) as any,
      product_pricing_id: (input.productPricingId ?? null) as any,
      pricing_term_months: (input.pricingTermMonths ?? null) as any,
      pricing_term_km: (input.pricingTermKm ?? null) as any,
      pricing_vehicle_mileage_min_km: (input.pricingVehicleMileageMinKm ?? null) as any,
      pricing_vehicle_mileage_max_km: (input.pricingVehicleMileageMaxKm ?? null) as any,
      pricing_vehicle_class: (input.pricingVehicleClass ?? null) as any,
      pricing_deductible_cents: (input.pricingDeductibleCents ?? null) as any,
      pricing_base_price_cents: (input.pricingBasePriceCents ?? null) as any,
      pricing_dealer_cost_cents: (input.pricingDealerCostCents ?? null) as any,
      addon_snapshot: (input.addonSnapshot ?? null) as any,
      addon_total_retail_cents: (input.addonTotalRetailCents ?? null) as any,
      addon_total_cost_cents: (input.addonTotalCostCents ?? null) as any,
      created_by_user_id: userId,
      created_by_email: userEmail,
      vin: (input.vin ?? null) as any,
      vehicle_year: (input.vehicleYear ?? null) as any,
      vehicle_make: (input.vehicleMake ?? null) as any,
      vehicle_model: (input.vehicleModel ?? null) as any,
      vehicle_trim: (input.vehicleTrim ?? null) as any,
      vehicle_mileage_km: (input.vehicleMileageKm ?? null) as any,
      vehicle_body_class: (input.vehicleBodyClass ?? null) as any,
      vehicle_engine: (input.vehicleEngine ?? null) as any,
      vehicle_transmission: (input.vehicleTransmission ?? null) as any,
      status: "DRAFT",
      updated_at: nowIso,
      contract_processing_fee_cents: planKey === "STANDARD" ? feeCents : 0,
      stripe_payment_intent_id: paymentIntentId,
      stripe_payment_intent_status: paymentIntentStatus,
      processing_fee_paid_at: paymentIntentId ? nowIso : null,
    };

    const created = await svc.from("contracts").insert(insert).select("*").single();
    if (created.error) {
      console.error("contract_insert_error", {
        dealerId,
        message: created.error.message,
        code: (created.error as any).code ?? null,
        details: (created.error as any).details ?? null,
        hint: (created.error as any).hint ?? null,
        paymentIntentId,
        paymentIntentStatus,
      });

      if (paymentIntentId) {
        try {
          const stripe = getStripe();
          await stripe.refunds.create({ payment_intent: paymentIntentId });
          console.log("contract_insert_refund_created", { dealerId, paymentIntentId });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("contract_insert_refund_failed", { dealerId, paymentIntentId, message: msg });
        }
      }

      return json(500, { error: created.error.message });
    }

    return json(200, { contract: created.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: msg || "Unknown error" });
  }
});
