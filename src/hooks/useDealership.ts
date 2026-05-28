import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import { supabase } from "../integrations/supabase/client";

interface UseDealershipResult {
  dealershipId: string | null;
  dealershipName: string | null;
  memberRole: "admin" | "employee" | null;
  loading: boolean;
  reloadDealership: () => void;
}

export function useDealership(): UseDealershipResult {
  const { user } = useAuth();
  const [dealershipId, setDealershipId] = useState<string | null>(null);
  const [dealershipName, setDealershipName] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<"admin" | "employee" | null>(null);
  const [loading, setLoading] = useState(true);

  const resolve = useCallback(async () => {
    setLoading(true);
    if (!user) {
      setDealershipId(null);
      setDealershipName(null);
      setMemberRole(null);
      setLoading(false);
      return;
    }

    if (user.role !== "DEALER_ADMIN" && user.role !== "DEALER_EMPLOYEE" && user.role !== "SUPER_ADMIN") {
      setDealershipId(null);
      setDealershipName(null);
      setMemberRole(null);
      setLoading(false);
      return;
    }

    // Try new dealership_members first
    const { data: member } = await supabase
      .from("dealership_members")
      .select("dealership_id, role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (member) {
      setDealershipId(member.dealership_id);
      setMemberRole(user.role === "SUPER_ADMIN" ? "admin" : member.role as "admin" | "employee");
      const { data: ds } = await supabase.from("dealerships").select("name").eq("id", member.dealership_id).maybeSingle();
      setDealershipName((ds as any)?.name ?? null);
      setLoading(false);
      return;
    }

    // Fallback: legacy dealer_members → bridge via dealerships.legacy_dealer_id
    const { data: legacyMember } = await supabase
      .from("dealer_members")
      .select("dealer_id, role")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (legacyMember) {
      const { data: dealership } = await supabase
        .from("dealerships")
        .select("id, name")
        .eq("legacy_dealer_id", legacyMember.dealer_id)
        .maybeSingle();

      if (dealership) {
        setDealershipId(dealership.id);
        setDealershipName((dealership as any).name ?? null);
        setMemberRole(
          user.role === "SUPER_ADMIN" ? "admin" : legacyMember.role === "DEALER_ADMIN" ? "admin" : "employee"
        );
        setLoading(false);
        return;
      }
    }

    if (user.role === "SUPER_ADMIN") {
      const { data: dealership } = await supabase
        .from("dealerships")
        .select("id, name")
        .ilike("name", "%easy%drive%canada%")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (dealership) {
        setDealershipId((dealership as any).id);
        setDealershipName((dealership as any).name ?? null);
        setMemberRole("admin");
      }
    }

    setLoading(false);
    setDealershipId(null);
    setDealershipName(null);
    setMemberRole(null);
  }, [user]);

  useEffect(() => { resolve(); }, [resolve]);

  return { dealershipId, dealershipName, memberRole, loading, reloadDealership: resolve };
}
