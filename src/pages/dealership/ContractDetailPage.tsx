import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Printer } from "lucide-react";

import { BridgeWarrantyApplicationContract } from "../../components/contracts/BridgeWarrantyApplicationContract";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";
import { supabase } from "../../integrations/supabase/client";
import { BRAND } from "../../lib/brand";
import { buildSavedBridgeWarrantyContractProps } from "../../lib/contracts/bridgeWarrantyPrintProps";
import { cn } from "../../lib/utils";

interface ContractRow {
  id: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_province?: string | null;
  customer_postal_code?: string | null;
  vin: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_mileage: number | null;
  vehicle_engine?: string | null;
  vehicle_transmission?: string | null;
  contract_price: number | null;
  dealer_cost_dollars: number | null;
  pricing_vehicle_class: string | null;
  pricing_term_months: number | null;
  pricing_term_km: number | null;
  pricing_base_price_cents: number | null;
  pricing_dealer_cost_cents: number | null;
  addon_snapshot: Array<{
    name?: string;
    term?: string;
    vehicleClass?: string;
    dealerCost?: number;
    retail?: number;
    retailDisplay?: string;
    retailKey?: string;
  }> | null;
  addon_total_retail_cents: number | null;
  addon_total_cost_cents: number | null;
  status_new: string | null;
  status: string | null;
  start_date: string | null;
  end_date?: string | null;
  created_at: string;
  product_id: string;
  dealership_id: string;
  provider_entity_id: string | null;
}

type DealershipInfo = {
  name?: string;
  phone?: string;
  address?: string;
};

function resolveStatus(c: ContractRow): string {
  if (c.status_new) return c.status_new;
  const legacyMap: Record<string, string> = { DRAFT: "draft", SOLD: "submitted", REMITTED: "active", PAID: "active" };
  return legacyMap[c.status ?? ""] ?? "draft";
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  expired: "bg-red-100 text-red-800",
  cancelled: "bg-destructive/10 text-destructive",
};

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [contract, setContract] = useState<ContractRow | null>(null);
  const [product, setProduct] = useState<any>(null);
  const [providerName, setProviderName] = useState("");
  const [dealership, setDealership] = useState<DealershipInfo>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: c, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error || !c) {
        toast({ title: "Contract not found", variant: "destructive" });
        navigate("/dealership/contracts");
        return;
      }
      setContract(c as ContractRow);

      if (c.product_id) {
        const { data: p } = await supabase
          .from("products")
          .select("id, name, product_type, pricing_json, coverage_details_json, provider_entity_id")
          .eq("id", c.product_id)
          .maybeSingle();
        if (p) setProduct(p);

        const provId = (c as any).provider_entity_id ?? p?.provider_entity_id;
        if (provId) {
          const { data: prov } = await supabase
            .from("providers")
            .select("company_name")
            .eq("id", provId)
            .maybeSingle();
          if (prov) setProviderName((prov as any).company_name || "");
        }
      }

      if (c.dealership_id) {
        const { data: d } = await supabase
          .from("dealerships")
          .select("name, phone, address")
          .eq("id", c.dealership_id)
          .maybeSingle();
        if (d) {
          setDealership({
            name: (d as any).name || "",
            phone: (d as any).phone || "",
            address: (d as any).address || "",
          });
        }
      }

      setLoading(false);
    })();
  }, [id, navigate, toast]);

  const handleSubmit = async () => {
    if (!contract) return;
    setSubmitting(true);
    try {
      await supabase
        .from("contracts")
        .update({ status_new: "submitted", status: "SOLD" })
        .eq("id", contract.id);
      setContract((prev) => prev ? { ...prev, status_new: "submitted" } : prev);
      toast({ title: "Contract submitted" });
    } catch {
      toast({ title: "Error", description: "Could not submit contract.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout navItems={dealershipNavItems} title="Contract">
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!contract) return null;

  const status = resolveStatus(contract);
  const printProps = buildSavedBridgeWarrantyContractProps({
    brandName: BRAND.name,
    contract,
    product,
    dealer: dealership,
    providerName,
  });

  return (
    <DashboardLayout navItems={dealershipNavItems} title="Contract">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="print:hidden flex items-center justify-between gap-4 pb-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dealership/contracts")}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Contracts
            </Button>
            <Badge className={cn("capitalize", statusColors[status] || "")} variant="secondary">
              {status}
            </Badge>
          </div>
          <div className="flex gap-2">
            {status === "draft" && (
              <Button variant="outline" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Submit Contract
              </Button>
            )}
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print Contract
            </Button>
          </div>
        </div>

        <BridgeWarrantyApplicationContract {...printProps} />
      </div>
    </DashboardLayout>
  );
}
