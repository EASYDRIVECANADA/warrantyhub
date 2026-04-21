import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Checkbox } from "../../components/ui/checkbox";
import { useToast } from "../../hooks/use-toast";
import { useDealership } from "../../hooks/useDealership";
import { supabase } from "../../integrations/supabase/client";
import { getContractsV2Api } from "../../lib/contracts/contractsV2";
import { cn } from "../../lib/utils";
import {
  ArrowLeft, Check, AlertCircle, Car, Shield, DollarSign,
  User, FileText, Loader2, Search,
} from "lucide-react";
import { format } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────

interface VehicleInfo {
  year: number | null;
  make: string | null;
  model: string | null;
  bodyClass?: string | null;
  warning?: string;
}

interface ProductOption {
  id: string;
  name: string;
  product_type: string;
  provider_entity_id: string | null;
  providerName: string;
  pricing_json: any;
  eligibility_rules: any;
  coverage_details_json: any;
}

interface PricingRow {
  label: string;
  vehicleClass: string;
  dealerCost: number;
  retail: number;
}

interface AddOn {
  name: string;
  price: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getPricingRows(pricing: any): PricingRow[] {
  if (!pricing) return [];
  return (pricing.rows || pricing.tiers || [])
    .map((r: any) => ({
      label: r.term || r.label || "Standard",
      vehicleClass: r.vehicleClass || r.vehicle_class || "",
      dealerCost: Number(r.dealerCost ?? r.dealer_cost ?? 0),
      retail: Number(r.suggestedRetail ?? r.suggested_retail ?? r.retail ?? 0),
    }))
    .filter((r: PricingRow) => r.dealerCost > 0 || r.retail > 0);
}

function getAddOns(pricing: any): AddOn[] {
  if (!pricing?.addons?.length) return [];
  return pricing.addons
    .filter((a: any) => a && !(a.included))
    .map((a: any) => ({
      name: typeof a === "string" ? a : a.name,
      price: typeof a === "string" ? 0 : Number(a.price ?? 0),
    }));
}

function checkEligibility(
  product: ProductOption,
  year: number | null,
  mileageKm: number | null,
): { eligible: boolean; reason: string } {
  const er = product.eligibility_rules || {};
  if (year && er.maxAge) {
    const age = new Date().getFullYear() - year;
    if (age > Number(er.maxAge))
      return { eligible: false, reason: `Vehicles ${er.maxAge} yrs or newer only` };
  }
  if (mileageKm && er.maxMileage) {
    if (mileageKm > Number(er.maxMileage))
      return { eligible: false, reason: `Under ${Number(er.maxMileage).toLocaleString()} km only` };
  }
  return { eligible: true, reason: "" };
}

function safeDate(dateStr: string): string {
  try {
    return format(new Date(dateStr + "T12:00:00"), "MMMM d, yyyy");
  } catch {
    return dateStr;
  }
}

const STEP_LABELS = ["Vehicle", "Product", "Pricing", "Add-Ons", "Customer", "Review"];

// ── Component ────────────────────────────────────────────────────────────────

export default function NewContractPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { dealershipId, loading: dLoading } = useDealership();
  const contractsApi = getContractsV2Api();

  // Wizard navigation
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Step 1 — Vehicle
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [vinLoading, setVinLoading] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);

  // Step 2 — Product
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState("");

  // Step 3 — Pricing
  const [selectedTierLabel, setSelectedTierLabel] = useState("");

  // Step 4 — Add-ons
  const [selectedAddOns, setSelectedAddOns] = useState<Set<string>>(new Set());

  // Step 5 — Customer
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Meta
  const [saving, setSaving] = useState(false);
  const [providerName, setProviderName] = useState("");
  const [dealershipName, setDealershipName] = useState("");

  // ── Load products ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, product_type, provider_entity_id, pricing_json, eligibility_rules, coverage_details_json")
        .eq("published", true)
        .order("name");

      if (!prods) { setProductsLoading(false); return; }

      const entityIds = [...new Set(prods.map((p: any) => p.provider_entity_id).filter(Boolean))] as string[];
      const providerMap: Record<string, string> = {};
      if (entityIds.length > 0) {
        const { data: provs } = await supabase.from("providers").select("id, company_name").in("id", entityIds);
        (provs || []).forEach((p: any) => { providerMap[p.id] = p.company_name; });
      }

      const mapped: ProductOption[] = prods.map((p: any) => ({
        ...p,
        providerName: providerMap[p.provider_entity_id] || "Provider",
        coverage_details_json: p.coverage_details_json ?? {},
      }));
      setProducts(mapped);
      setProductsLoading(false);

      // Pre-select from query param
      const preId = searchParams.get("productId");
      if (preId && mapped.find(p => p.id === preId)) setSelectedProductId(preId);
    })();
  }, []);

  // Load dealership name
  useEffect(() => {
    if (!dealershipId) return;
    supabase.from("dealerships").select("name").eq("id", dealershipId).maybeSingle()
      .then(({ data }) => { if (data) setDealershipName((data as any).name || ""); });
  }, [dealershipId]);

  // When product changes, reset tier / add-ons and set provider name
  useEffect(() => {
    const p = products.find(p => p.id === selectedProductId);
    if (p) {
      const rows = getPricingRows(p.pricing_json);
      setSelectedTierLabel(rows.length === 1 ? rows[0].label : "");
      setSelectedAddOns(new Set());
      setProviderName(p.providerName);
    }
  }, [selectedProductId, products]);

  // Derived values
  const selectedProduct = products.find(p => p.id === selectedProductId) ?? null;
  const pricingRows = selectedProduct ? getPricingRows(selectedProduct.pricing_json) : [];
  const addOns = selectedProduct ? getAddOns(selectedProduct.pricing_json) : [];
  const chosenRow = pricingRows.find(r => r.label === selectedTierLabel) ?? (pricingRows.length === 1 ? pricingRows[0] : null);
  const addOnTotal = Array.from(selectedAddOns).reduce((sum, name) => {
    const ao = addOns.find(a => a.name === name);
    return sum + (ao?.price || 0);
  }, 0);
  const totalDealerCost = (chosenRow?.dealerCost || 0) + addOnTotal;
  const totalRetail = (chosenRow?.retail || 0) + addOnTotal;

  // ── VIN decode ─────────────────────────────────────────────────────────────
  const handleDecodeVin = async () => {
    if (vin.length !== 17) return;
    setVinLoading(true); setVinError(null); setVehicleInfo(null);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
      const data = await res.json();
      const r = data.Results?.[0];
      if (!r || (!r.Make && !r.ModelYear)) { setVinError("Could not decode this VIN. Check the number and try again."); return; }
      const warning = r.ErrorCode === "0" ? undefined
        : (r.Make?.trim() || r.Model?.trim())
          ? "Some details couldn't be verified — year/make/model decoded successfully."
          : r.ErrorText || "Partial decode — some details may be incomplete.";
      setVehicleInfo({ year: r.ModelYear ? parseInt(r.ModelYear) : null, make: r.Make || null, model: r.Model || null, bodyClass: r.BodyClass || null, warning });
    } catch { setVinError("Network error — check your connection."); }
    finally { setVinLoading(false); }
  };

  // ── Wizard navigation ──────────────────────────────────────────────────────
  const validateStep = (): boolean => {
    switch (currentStep) {
      case 1:
        if (vin.length !== 17) { toast({ title: "Enter a valid 17-character VIN", variant: "destructive" }); return false; }
        return true;
      case 2:
        if (!selectedProductId) { toast({ title: "Select a product to continue", variant: "destructive" }); return false; }
        return true;
      case 3:
        if (!chosenRow) { toast({ title: "Select a pricing tier to continue", variant: "destructive" }); return false; }
        return true;
      case 4: return true;
      case 5:
        if (!firstName.trim() || !lastName.trim()) { toast({ title: "First and last name are required", variant: "destructive" }); return false; }
        return true;
      default: return true;
    }
  };

  const goNext = () => {
    if (!validateStep()) return;
    setCompletedSteps(prev => new Set([...prev, currentStep]));
    setCurrentStep(s => Math.min(s + 1, 6));
  };

  const goBack = () => setCurrentStep(s => Math.max(s - 1, 1));

  // ── Save & Print ───────────────────────────────────────────────────────────
  const handleSaveAndPrint = async () => {
    if (!dealershipId) return;
    setSaving(true);
    try {
      await contractsApi.create({
        dealershipId,
        providerEntityId: selectedProduct?.provider_entity_id ?? "",
        productId: selectedProductId,
        customerFirstName: firstName.trim(),
        customerLastName: lastName.trim(),
        customerEmail: email.trim() || undefined,
        customerPhone: phone.trim() || undefined,
        vehicleVin: vin.trim(),
        vehicleMake: vehicleInfo?.make ?? "",
        vehicleModel: vehicleInfo?.model ?? "",
        vehicleYear: vehicleInfo?.year ?? 0,
        vehicleMileage: mileage ? parseInt(mileage) : undefined,
        contractPrice: totalRetail || totalDealerCost || undefined,
        dealerCost: totalDealerCost || undefined,
        startDate: startDate || undefined,
      });
      toast({ title: "Contract saved", description: "Print the contract or close to view it in your contracts list." });
      const onAfterPrint = () => navigate("/dealership/contracts");
      window.addEventListener("afterprint", onAfterPrint, { once: true });
      setTimeout(() => { window.removeEventListener("afterprint", onAfterPrint); navigate("/dealership/contracts"); }, 30000);
      window.print();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not save contract.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Contract data for review ───────────────────────────────────────────────
  const cd = selectedProduct?.coverage_details_json ?? {};
  const pr = selectedProduct?.pricing_json ?? {};
  const deductible = pr.deductible;
  const categories: string[] = (cd.categories || []).map((c: any) => c.name);
  const termsSections: Array<{ title: string; content: string }> = cd.termsSections || [];
  const exclusions: string[] = cd.exclusions || [];
  const previewContractNumber = `WH-${Date.now().toString(36).toUpperCase()}`;

  if (dLoading) return (
    <DashboardLayout navItems={dealershipNavItems} title="New Contract">
      <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout navItems={dealershipNavItems} title="New Contract">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ── Header + Progress Bar (hidden on print) ── */}
        <div className="print:hidden">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dealership/contracts")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Contracts
            </Button>
            <h2 className="text-xl font-bold">New Contract</h2>
          </div>

          {/* Progress bar */}
          <div className="flex items-start mb-2">
            {STEP_LABELS.map((label, i) => {
              const step = i + 1;
              const isDone = completedSteps.has(step) && step !== currentStep;
              const isCurrent = step === currentStep;
              const isClickable = isDone || step < currentStep;
              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5 min-w-[52px]">
                    <button
                      disabled={!isClickable}
                      onClick={() => { if (isClickable) setCurrentStep(step); }}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                        isCurrent && "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2",
                        isDone && "bg-primary text-primary-foreground cursor-pointer hover:bg-primary/80",
                        !isCurrent && !isDone && "bg-muted text-muted-foreground",
                      )}
                    >
                      {isDone ? <Check className="w-3.5 h-3.5" /> : step}
                    </button>
                    <span className={cn(
                      "text-[9px] text-center leading-tight font-medium",
                      isCurrent ? "text-primary" : isDone ? "text-primary/70" : "text-muted-foreground",
                    )}>{label}</span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div className={cn("flex-1 h-0.5 mx-1 mb-5", step < currentStep ? "bg-primary" : "bg-border")} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Step 1: Vehicle ── */}
        {currentStep === 1 && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Car className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-base">Vehicle Information</h3>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">VIN (17 characters)</Label>
                  <Input
                    className="mt-1 font-mono tracking-wider"
                    placeholder="Enter VIN number"
                    value={vin}
                    maxLength={17}
                    onChange={e => {
                      setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                      setVehicleInfo(null); setVinError(null);
                    }}
                  />
                </div>
                <div className="pt-5">
                  <Button variant="outline" size="sm" className="h-9" onClick={handleDecodeVin} disabled={vin.length !== 17 || vinLoading}>
                    {vinLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span className="ml-1">Decode</span>
                  </Button>
                </div>
              </div>
              {vinError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 shrink-0" />{vinError}
                </div>
              )}
              {vehicleInfo && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-start gap-3">
                  <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">
                      {vehicleInfo.year} {vehicleInfo.make} {vehicleInfo.model}
                      {vehicleInfo.bodyClass ? <span className="text-muted-foreground font-normal"> · {vehicleInfo.bodyClass}</span> : null}
                    </p>
                    {vehicleInfo.warning && <p className="text-xs text-amber-600 mt-0.5">{vehicleInfo.warning}</p>}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Mileage (km)</Label>
                  <Input type="number" placeholder="e.g. 45000" value={mileage} onChange={e => setMileage(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Start Date</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Product ── */}
        {currentStep === 2 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-base">Select a Product</h3>
            </div>
            {productsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : products.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No published products available. Ask your provider to publish products first.</p>
            ) : (
              <div className="grid gap-3">
                {products.map(p => {
                  const elig = checkEligibility(p, vehicleInfo?.year ?? null, mileage ? parseInt(mileage) : null);
                  const cats: string[] = (p.coverage_details_json?.categories || []).map((c: any) => c.name).slice(0, 4);
                  const rows = getPricingRows(p.pricing_json);
                  const minCost = rows.length ? Math.min(...rows.map(r => r.dealerCost).filter(Boolean)) : 0;
                  const isSelected = selectedProductId === p.id;
                  return (
                    <button
                      key={p.id}
                      disabled={!elig.eligible}
                      onClick={() => setSelectedProductId(p.id)}
                      className={cn(
                        "w-full text-left rounded-xl border p-4 transition-all",
                        isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" :
                        !elig.eligible ? "border-border opacity-50 cursor-not-allowed bg-muted/20" :
                        "border-border hover:border-primary/40 hover:bg-muted/20",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <Badge variant="secondary" className="text-xs">{p.product_type}</Badge>
                            <span className="text-xs bg-accent/10 text-accent border border-accent/20 rounded-full px-2 py-0.5">{p.providerName}</span>
                            {!elig.eligible && <Badge variant="destructive" className="text-xs">{elig.reason}</Badge>}
                          </div>
                          <p className="font-semibold text-sm">{p.name}</p>
                          {cats.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {cats.map(c => <span key={c} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{c}</span>)}
                            </div>
                          )}
                        </div>
                        {minCost > 0 && isFinite(minCost) && (
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted-foreground">From</p>
                            <p className="font-bold text-primary text-sm">${minCost.toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Pricing Tiers ── */}
        {currentStep === 3 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-base">Select Pricing Tier</h3>
              {selectedProduct && <span className="text-sm text-muted-foreground">— {selectedProduct.name}</span>}
            </div>
            {pricingRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No pricing tiers configured for this product.</p>
            ) : (
              <div className="grid gap-3">
                {pricingRows.map(row => {
                  const isSelected = chosenRow?.label === row.label;
                  const margin = row.retail - row.dealerCost;
                  return (
                    <button
                      key={row.label}
                      onClick={() => setSelectedTierLabel(row.label)}
                      className={cn(
                        "w-full text-left rounded-xl border p-4 transition-all",
                        isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40 hover:bg-muted/20",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{row.label}</p>
                          {row.vehicleClass && <p className="text-xs text-muted-foreground mt-0.5">{row.vehicleClass}</p>}
                        </div>
                        <div className="text-right space-y-0.5">
                          <p className="font-bold">${row.dealerCost.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">dealer cost</span></p>
                          {row.retail > 0 && <p className="text-sm text-primary font-semibold">${row.retail.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">retail</span></p>}
                          {margin > 0 && <p className="text-xs text-green-600 font-medium">+${margin.toLocaleString()} margin</p>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Add-Ons ── */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-base">Optional Add-Ons</h3>
            </div>
            {addOns.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground text-sm">No optional add-ons available for this product.</p>
                  <p className="text-muted-foreground text-xs mt-1">Click Next to continue to customer info.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {addOns.map(ao => {
                  const isSelected = selectedAddOns.has(ao.name);
                  return (
                    <div
                      key={ao.name}
                      className={cn(
                        "flex items-center gap-4 rounded-xl border p-4 cursor-pointer transition-all select-none",
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30 hover:bg-muted/20",
                      )}
                      onClick={() => setSelectedAddOns(prev => {
                        const next = new Set(prev);
                        next.has(ao.name) ? next.delete(ao.name) : next.add(ao.name);
                        return next;
                      })}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => setSelectedAddOns(prev => {
                          const next = new Set(prev);
                          next.has(ao.name) ? next.delete(ao.name) : next.add(ao.name);
                          return next;
                        })}
                      />
                      <span className="flex-1 font-medium text-sm">{ao.name}</span>
                      {ao.price > 0 && <span className="font-semibold text-sm">+${ao.price.toLocaleString()}</span>}
                    </div>
                  );
                })}
                <div className="rounded-xl bg-muted/40 border p-4 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Base cost</span>
                    <span className="font-semibold">${(chosenRow?.dealerCost || 0).toLocaleString()}</span>
                  </div>
                  {addOnTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Add-ons</span>
                      <span className="font-semibold">+${addOnTotal.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold border-t pt-2">
                    <span>Total dealer cost</span>
                    <span>${totalDealerCost.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 5: Customer ── */}
        {currentStep === 5 && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-base">Customer Information</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">First Name *</Label>
                  <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Last Name *</Label>
                  <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@email.com" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" className="mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 6: Review & Sign ── */}
        {currentStep === 6 && (
          <>
            {/* Printable contract document */}
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
                    <p className="text-xs text-muted-foreground mt-1">Contract #: {previewContractNumber}</p>
                    <p className="text-xs text-muted-foreground">Date: {format(new Date(), "MMMM d, yyyy")}</p>
                    {dealershipName && <p className="text-xs text-muted-foreground">Dealer: {dealershipName}</p>}
                  </div>
                </div>

                {/* Contract Holder + Vehicle */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">Contract Holder</p>
                    <p className="font-semibold">{firstName} {lastName}</p>
                    {email && <p className="text-sm text-muted-foreground">{email}</p>}
                    {phone && <p className="text-sm text-muted-foreground">{phone}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">Covered Vehicle</p>
                    <p className="font-semibold">{vehicleInfo?.year} {vehicleInfo?.make} {vehicleInfo?.model}</p>
                    <p className="text-sm text-muted-foreground font-mono">VIN: {vin}</p>
                    {mileage && <p className="text-sm text-muted-foreground">Odometer: {parseInt(mileage).toLocaleString()} km</p>}
                    {startDate && <p className="text-sm text-muted-foreground">Start Date: {safeDate(startDate)}</p>}
                  </div>
                </div>

                {/* Coverage Details */}
                <div className="rounded-lg border p-4 bg-muted/20">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Coverage Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-xs text-muted-foreground">Plan</p><p className="font-semibold text-sm">{selectedProduct?.name}</p></div>
                    <div><p className="text-xs text-muted-foreground">Provider</p><p className="font-semibold text-sm">{providerName || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Term</p><p className="font-semibold text-sm">{chosenRow?.label || "—"}</p></div>
                    {deductible && <div><p className="text-xs text-muted-foreground">Deductible</p><p className="font-semibold text-sm">${deductible}</p></div>}
                  </div>
                </div>

                {/* Pricing */}
                <div className="rounded-lg border p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Pricing Breakdown</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Base Coverage</span>
                      <span className="font-semibold">${(chosenRow?.dealerCost || 0).toLocaleString()}</span>
                    </div>
                    {Array.from(selectedAddOns).map(name => {
                      const ao = addOns.find(a => a.name === name);
                      return ao ? (
                        <div key={name} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-semibold">+${ao.price.toLocaleString()}</span>
                        </div>
                      ) : null;
                    })}
                    <div className="flex justify-between font-bold pt-2 border-t">
                      <span>Total Contract Price</span>
                      <span className="text-primary text-lg">${(totalRetail > 0 ? totalRetail : totalDealerCost).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Covered Components */}
                {categories.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Covered Components</p>
                    <div className="flex flex-wrap gap-2">
                      {categories.map(c => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}
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
                        <ul className="space-y-0.5">{exclusions.map((ex, i) => <li key={i} className="text-xs text-muted-foreground">• {ex}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Signatures */}
                <div className="pt-4 border-t-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-6">Authorization & Signatures</p>
                  <div className="grid grid-cols-2 gap-12">
                    {[["Client", `${firstName} ${lastName}`], ["Authorized Dealer", dealershipName || "Dealer"]].map(([role, name]) => (
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
                  WarrantyHub acts as a marketplace platform. This contract is issued by {providerName || "the named provider"} and is subject to full terms and conditions. Contract #{previewContractNumber}.
                </p>
              </div>
            </div>

            {/* Action bar — hidden on print */}
            <div className="print:hidden flex items-center justify-between pt-4 mt-2 border-t">
              <Button variant="outline" onClick={goBack}>← Back</Button>
              <Button onClick={handleSaveAndPrint} disabled={saving}>
                {saving
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                  : <><FileText className="w-4 h-4 mr-2" /> Save & Print Contract</>
                }
              </Button>
            </div>
          </>
        )}

        {/* ── Next / Back navigation (steps 1–5) — hidden on print ── */}
        {currentStep < 6 && (
          <div className="print:hidden flex justify-between pb-6">
            <Button variant="outline" onClick={goBack} disabled={currentStep === 1}>
              ← Back
            </Button>
            <Button onClick={goNext}>
              Next →
            </Button>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
