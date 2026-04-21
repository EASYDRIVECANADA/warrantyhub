import { getSupabaseClient } from "../../lib/supabase/client";

/**
 * Convenience re-export so V2 pages can do:
 *   import { supabase } from "../../integrations/supabase/client";
 *
 * Returns the singleton SupabaseClient (or throws if env vars are missing).
 */
export const supabase = getSupabaseClient()!;
