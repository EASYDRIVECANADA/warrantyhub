import Stripe from "stripe";

export function getStripe() {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function getStripeWebhookSecret() {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  return secret;
}

export function getStripePriceIds() {
  const standardMonthly = Deno.env.get("STRIPE_PRICE_STANDARD_MONTHLY") ?? "";
  const earlyAdopterYearly = Deno.env.get("STRIPE_PRICE_EARLY_ADOPTER_YEARLY") ?? "";
  if (!standardMonthly || !earlyAdopterYearly) {
    throw new Error("Missing STRIPE_PRICE_STANDARD_MONTHLY or STRIPE_PRICE_EARLY_ADOPTER_YEARLY");
  }
  return { standardMonthly, earlyAdopterYearly };
}

export function planKeyFromPriceId(priceId: string) {
  const { standardMonthly, earlyAdopterYearly } = getStripePriceIds();
  if (priceId === earlyAdopterYearly) return "EARLY_ADOPTER" as const;
  if (priceId === standardMonthly) return "STANDARD" as const;
  return null;
}
