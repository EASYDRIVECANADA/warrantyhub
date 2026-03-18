import { corsHeaders } from "../_shared/cors.ts";
import { getServiceSupabaseClient } from "../_shared/supabase.ts";
import { getStripe, getStripeWebhookSecret, planKeyFromPriceId } from "../_shared/stripe.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readRawBody(req: Request) {
  const buf = await req.arrayBuffer();
  return new TextDecoder().decode(buf);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const stripe = getStripe();
    const secret = getStripeWebhookSecret();
    const sig = req.headers.get("stripe-signature") ?? "";
    if (!sig) return json(400, { error: "Missing stripe-signature" });

    const raw = await readRawBody(req);
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(raw, sig, secret);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json(400, { error: `Webhook signature verification failed: ${msg}` });
    }

    const svc = getServiceSupabaseClient();

    const upsertDealerFromSubscription = async (sub: any) => {
      const dealerId = (sub?.metadata?.dealer_id ?? "").toString().trim();
      const status = (sub?.status ?? "").toString();
      const customerId = (sub?.customer ?? "").toString();
      const subId = (sub?.id ?? "").toString();
      const cancelAtPeriodEnd = Boolean(sub?.cancel_at_period_end);
      const currentPeriodEnd = typeof sub?.current_period_end === "number" ? new Date(sub.current_period_end * 1000).toISOString() : null;
      const trialEnd = typeof sub?.trial_end === "number" ? new Date(sub.trial_end * 1000).toISOString() : null;

      const priceId = (sub?.items?.data?.[0]?.price?.id ?? "").toString();
      const planKey = planKeyFromPriceId(priceId) ?? (sub?.metadata?.plan_key ?? null);

      let seatsLimit: number | null = null;
      let feeCents: number | null = null;
      if (planKey === "STANDARD") {
        seatsLimit = 5;
        feeCents = 399;
      } else if (planKey === "EARLY_ADOPTER") {
        seatsLimit = null;
        feeCents = 0;
      }

      if (dealerId) {
        const upd = await svc
          .from("dealers")
          .update({
            stripe_customer_id: customerId || null,
            stripe_subscription_id: subId || null,
            subscription_status: status || null,
            subscription_plan_key: planKey || null,
            subscription_price_id: priceId || null,
            subscription_cancel_at_period_end: cancelAtPeriodEnd,
            subscription_current_period_end: currentPeriodEnd,
            subscription_trial_end: trialEnd,
            subscription_seats_limit: seatsLimit,
            contract_fee_cents: feeCents,
          })
          .eq("id", dealerId);
        if (upd.error) throw new Error(upd.error.message);
        return;
      }

      // Fallback: match by customer id
      if (customerId) {
        const upd = await svc
          .from("dealers")
          .update({
            stripe_customer_id: customerId || null,
            stripe_subscription_id: subId || null,
            subscription_status: status || null,
            subscription_plan_key: planKey || null,
            subscription_price_id: priceId || null,
            subscription_cancel_at_period_end: cancelAtPeriodEnd,
            subscription_current_period_end: currentPeriodEnd,
            subscription_trial_end: trialEnd,
            subscription_seats_limit: seatsLimit,
            contract_fee_cents: feeCents,
          })
          .eq("stripe_customer_id", customerId);
        if (upd.error) throw new Error(upd.error.message);
      }
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as any;
        const dealerId = (s?.metadata?.dealer_id ?? "").toString().trim();
        const customerId = (s?.customer ?? "").toString();
        const subId = (s?.subscription ?? "").toString();
        if (dealerId) {
          const upd = await svc
            .from("dealers")
            .update({
              stripe_customer_id: customerId || null,
              stripe_subscription_id: subId || null,
            })
            .eq("id", dealerId);
          if (upd.error) throw new Error(upd.error.message);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        let sub = event.data.object as any;

        // If a user cancels while still in a free trial, end the trial immediately by canceling now.
        // Stripe sets cancel_at_period_end=true for a "cancel" action during trial, which would otherwise
        // allow the trial to keep running until trial_end.
        const status = (sub?.status ?? "").toString();
        const cancelAtPeriodEnd = Boolean(sub?.cancel_at_period_end);
        const trialEndUnix = typeof sub?.trial_end === "number" ? sub.trial_end : null;
        const nowUnix = Math.floor(Date.now() / 1000);
        const isInTrial = status === "trialing" && trialEndUnix !== null && trialEndUnix > nowUnix;

        if (cancelAtPeriodEnd && isInTrial && typeof sub?.id === "string" && sub.id) {
          // This will trigger another webhook event; we also retrieve immediately so the DB is updated now.
          await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
          sub = await stripe.subscriptions.retrieve(sub.id);
        }

        await upsertDealerFromSubscription(sub);
        break;
      }
      default:
        break;
    }

    return json(200, { received: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: msg || "Unknown error" });
  }
});
