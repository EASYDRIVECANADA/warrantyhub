import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";
import { supabase } from "../../integrations/supabase/client";
import { cn } from "../../lib/utils";
import { ArrowLeft, Printer, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";

interface ContractRow {
  id: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  vin: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_mileage: number | null;
  contract_price: number | null;
  dealer_cost_dollars: number | null;
  status_new: string | null;
  status: string | null;
  start_date: string | null;
  created_at: string;
  product_id: string;
  dealership_id: string;
  provider_entity_id: string | null;
}

function resolveStatus(c: ContractRow): string {
  if (c.status_new) return c.status_new;
  const legacyMap: Record<string, string> = { DRAFT: "draft", SOLD: "submitted", REMITTED: "active", PAID: "active" };
  return legacyMap[c.status ?? ""] ?? "draft";
}

function safeDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try { return format(new Date(dateStr + "T12:00:00"), "MMMM d, yyyy"); } catch { return dateStr; }
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
  const [dealershipName, setDealershipName] = useState("");
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

      // Load product
      if (c.product_id) {
        const { data: p } = await supabase
          .from("products")
          .select("id, name, product_type, pricing_json, coverage_details_json, provider_entity_id")
          .eq("id", c.product_id)
          .maybeSingle();
        if (p) setProduct(p);

        // Load provider name
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

      // Load dealership name
      if (c.dealership_id) {
        const { data: d } = await supabase
          .from("dealerships")
          .select("name")
          .eq("id", c.dealership_id)
          .maybeSingle();
        if (d) setDealershipName((d as any).name || "");
      }

      setLoading(false);
    })();
  }, [id]);

  const handleSubmit = async () => {
    if (!contract) return;
    setSubmitting(true);
    try {
      await supabase
        .from("contracts")
        .update({ status_new: "submitted", status: "SOLD" })
        .eq("id", contract.id);
      setContract(prev => prev ? { ...prev, status_new: "submitted" } : prev);
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
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  if (!contract) return null;

  const status = resolveStatus(contract);
  const cd = product?.coverage_details_json ?? {};
  const pr = product?.pricing_json ?? {};
  const deductible = pr.deductible;
  const categories: string[] = (cd.categories || []).map((c: any) => c.name);
  const termsSections: Array<{ title: string; content: string }> = cd.termsSections || [];
  const exclusions: string[] = cd.exclusions || [];

  // Find the matching tier label from pricing rows if we have a tier stored
  const pricingRows: Array<{ label: string; vehicleClass: string; dealerCost: number; retail: number }> =
    (pr.rows || pr.tiers || []).map((r: any) => ({
      label: r.term || r.label || "Standard",
      vehicleClass: r.vehicleClass || r.vehicle_class || "",
      dealerCost: Number(r.dealerCost ?? r.dealer_cost ?? 0),
      retail: Number(r.suggestedRetail ?? r.suggested_retail ?? r.retail ?? 0),
    }));

  const contractNumber = `WH-${contract.id.substring(0, 8).toUpperCase()}`;

  return (
    <DashboardLayout navItems={dealershipNavItems} title="Contract">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Action bar — hidden on print */}
        <div className="print:hidden flex items-center justify-between gap-4 pb-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dealership/contracts")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Contracts
            </Button>
            <Badge className={cn("capitalize", statusColors[status] || "")} variant="secondary">
              {status}
            </Badge>
          </div>
          <div className="flex gap-2">
            {status === "draft" && (
              <Button variant="outline" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Submit Contract
              </Button>
            )}
            <Button onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" /> Print Contract
            </Button>
          </div>
        </div>

        {/* Printable contract */}
        <div className="print-contract-root bg-white">
          <div className="max-w-4xl mx-auto p-8 print:p-6 space-y-6">

            {/* Header */}
            <div className="flex items-start justify-between pb-5 border-b-2 border-primary">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground font-bold text-sm">WH</span>
                </div>
                <div>
                  <p className="font-bold text-lg leading-tight">WarrantyHub</p>
                  <p className="text-xs text-muted-foreground">Vehicle Protection Services</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-base">Vehicle Service Contract</p>
                <p className="text-xs text-muted-foreground mt-1">Contract #: {contractNumber}</p>
                <p className="text-xs text-muted-foreground">Date: {format(new Date(contract.created_at), "MMMM d, yyyy")}</p>
                {dealershipName && <p className="text-xs text-muted-foreground">Dealer: {dealershipName}</p>}
              </div>
            </div>

            {/* Contract Holder + Vehicle */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">Contract Holder</p>
                <p className="font-semibold">{contract.customer_first_name} {contract.customer_last_name}</p>
                {contract.customer_email && <p className="text-sm text-muted-foreground">{contract.customer_email}</p>}
                {contract.customer_phone && <p className="text-sm text-muted-foreground">{contract.customer_phone}</p>}
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">Covered Vehicle</p>
                <p className="font-semibold">{contract.vehicle_year} {contract.vehicle_make} {contract.vehicle_model}</p>
                <p className="text-sm text-muted-foreground font-mono">VIN: {contract.vin}</p>
                {contract.vehicle_mileage && (
                  <p className="text-sm text-muted-foreground">Odometer: {contract.vehicle_mileage.toLocaleString()} km</p>
                )}
                {contract.start_date && (
                  <p className="text-sm text-muted-foreground">Start Date: {safeDate(contract.start_date)}</p>
                )}
              </div>
            </div>

            {/* Coverage Details */}
            <div className="rounded-lg border p-4 bg-muted/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Coverage Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Plan</p>
                  <p className="font-semibold text-sm">{product?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Provider</p>
                  <p className="font-semibold text-sm">{providerName || "—"}</p>
                </div>
                {pricingRows.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="font-semibold text-sm">{product?.product_type || "—"}</p>
                  </div>
                )}
                {deductible && (
                  <div>
                    <p className="text-xs text-muted-foreground">Deductible</p>
                    <p className="font-semibold text-sm">${deductible}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Pricing */}
            <div className="rounded-lg border p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Pricing</p>
              <div className="space-y-1.5">
                {contract.dealer_cost_dollars != null && contract.dealer_cost_dollars > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Dealer Cost</span>
                    <span className="font-semibold">${Number(contract.dealer_cost_dollars).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-2 border-t">
                  <span>Total Contract Price</span>
                  <span className="text-primary text-lg">${Number(contract.contract_price || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Covered Components */}
            {categories.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Covered Components</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map(c => (
                    <span key={c} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full border">{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Terms & Conditions */}
            {(termsSections.length > 0 || exclusions.length > 0) && (
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-2">Terms & Conditions</p>
                {termsSections.map((s, i) => (
                  <div key={i}>
                    <p className="text-xs font-semibold mb-1">{s.title}</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{s.content}</p>
                  </div>
                ))}
                {exclusions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-destructive mb-1">Exclusions</p>
                    <ul className="space-y-0.5">
                      {exclusions.map((ex, i) => <li key={i} className="text-xs text-muted-foreground">• {ex}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Signatures */}
            <div className="pt-4 border-t-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-6">Authorization & Signatures</p>
              <div className="grid grid-cols-2 gap-12">
                {[
                  ["Client", `${contract.customer_first_name} ${contract.customer_last_name}`],
                  ["Authorized Dealer", dealershipName || "Dealer"],
                ].map(([role, name]) => (
                  <div key={role} className="space-y-3">
                    <p className="text-sm font-semibold">{role} Signature</p>
                    <div className="border-b border-foreground pt-10" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Signature</span><span>Date: ___________</span>
                    </div>
                    <div className="border-b border-muted pt-4" />
                    <p className="text-xs text-muted-foreground">Print Name: {name}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[9px] text-muted-foreground text-center pt-3 border-t">
              WarrantyHub acts as a marketplace platform. This contract is issued by {providerName || "the named provider"} and is subject to full terms and conditions. Contract #{contractNumber}.
            </p>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
