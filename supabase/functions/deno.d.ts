declare const Deno: any;

declare module "stripe" {
  const Stripe: any;
  export default Stripe;
}

declare module "@supabase/supabase-js" {
  export function createClient(...args: any[]): any;
}
