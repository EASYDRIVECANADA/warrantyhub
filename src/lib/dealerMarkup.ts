import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAppMode } from "./runtime";
import { getDealerMarkupPct, setDealerMarkupPct } from "./dealerPricing";
import { getSupabaseClient } from "./supabase/client";

function clampMarkupPct(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(200, v));
}

async function fetchMarkupPctSupabase(dealerId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase.from("dealers").select("markup_pct").eq("id", dealerId).maybeSingle();
  if (error) throw error;

  if (!data) return 0;

  const raw = Number((data as any)?.markup_pct);
  return clampMarkupPct(raw);
}

async function updateMarkupPctSupabase(dealerId: string, markupPct: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const pct = clampMarkupPct(markupPct);

  const { data, error } = await supabase
    .from("dealers")
    .update({ markup_pct: pct })
    .eq("id", dealerId)
    .select("markup_pct")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Failed to update markup. Dealer not found or access denied.");

  return clampMarkupPct(Number((data as any)?.markup_pct));
}

export function useDealerMarkupPct(dealerId: string) {
  const mode = useMemo(() => getAppMode(), []);
  const qc = useQueryClient();

  const did = (dealerId ?? "").trim();
  const enabled = Boolean(did);

  const query = useQuery({
    queryKey: ["dealer-markup", mode, did],
    enabled,
    queryFn: async () => {
      if (!did) return 0;
      if (mode === "local") return getDealerMarkupPct(did);
      return fetchMarkupPctSupabase(did);
    },
  });

  const mutation = useMutation({
    mutationFn: async (nextPct: number) => {
      if (!did) throw new Error("dealerId is required");
      if (mode === "local") {
        setDealerMarkupPct(did, nextPct);
        return getDealerMarkupPct(did);
      }
      return updateMarkupPctSupabase(did, nextPct);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["dealer-markup"] });
    },
  });

  return {
    markupPct: typeof query.data === "number" ? query.data : 0,
    isLoading: query.isLoading,
    error: query.error,
    saveMarkupPct: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
