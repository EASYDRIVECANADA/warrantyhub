import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Search, RotateCcw, Car, Shield, Check, Loader2, AlertCircle, LayoutGrid, FileText, DollarSign } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useDealership } from "../../hooks/useDealership";

interface VehicleInfo {
  year: number | null;
  make: string | null;
  model: string | null;
  bodyClass?: string | null;
  vehicleType?: string | null;
  warning?: string;
}

interface Product {
  id: string;
  name: string;
  product_type: string;
  published: boolean;
  provider_entity_id: string | null;
  provider_id: string | null;
  providerName: string;
  pricing_json: any;
  coverage_details_json: any;
  eligibility_rules: any;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const typeLabel = (type: string) => {
  const map: Record<string, string> = {
    VSC: "Vehicle Service Contract",
    EXTENDED_WARRANTY: "Vehicle Service Contract",
    "Tire & Rim": "Tire & Rim Protection",
    TIRE_RIM: "Tire & Rim Protection",
    GAP: "GAP Insurance",
    warranty: "Vehicle Service Contract",
    tire_rim: "Tire & Rim Protection",
  };
  return map[type] || type;
};


const getMinPrice = (pricing: any): number | null => {
  if (!pricing) return null;
  const costs: number[] = [];
  // V2 editor format: rows[].dealerCost  ← what ProviderProductEditorPage saves
  for (const r of pricing.rows || []) {
    if (typeof r.dealerCost === "number" && r.dealerCost > 0) costs.push(r.dealerCost);
    if (typeof r.dealer_cost === "number" && r.dealer_cost > 0) costs.push(r.dealer_cost);
  }
  // Legacy flat tiers format
  for (const t of pricing.tiers || []) {
    if (typeof t.dealer_cost === "number" && t.dealer_cost > 0) costs.push(t.dealer_cost);
    if (typeof t.dealerCost === "number" && t.dealerCost > 0) costs.push(t.dealerCost);
  }
  return costs.length > 0 ? Math.min(...costs) : null;
};


const getMaxPrice = (pricing: any): number | null => {
  if (!pricing) return null;
  const retails: number[] = [];
  for (const r of pricing.rows || []) {
    if (typeof r.dealerCost === "number" && r.dealerCost > 0) retails.push(r.dealerCost);
    if (typeof r.dealer_cost === "number" && r.dealer_cost > 0) retails.push(r.dealer_cost);
  }
  return retails.length > 0 ? Math.max(...retails) : null;
};

const getUniqueTierNames = (pricing: any): string[] => {
  if (!pricing) return [];
  const seen = new Set<string>();
  const chips: string[] = [];
  for (const r of pricing.rows || []) {
    const vc: string = (r.vehicleClass ?? r.vehicle_class ?? "").trim();
    // Extract short name: "Bronze - $750 Per Claim" → "Bronze"
    const short = vc.split(" - ")[0].trim();
    if (short && !seen.has(short)) { seen.add(short); chips.push(short); }
  }
  return chips;
};

/**
 * Returns true if the product's eligibility_rules are satisfied by the decoded vehicle.
 * If no eligibility rules are set, the product is eligible for all vehicles.
 */
function isEligible(eligibilityRules: any, vehicle: VehicleInfo | null, mileageKm: number | null): boolean {
  if (!vehicle) return true; // no vehicle decoded yet — show all
  if (!eligibilityRules || Object.keys(eligibilityRules).length === 0) return true;

  // Max age check (vehicle year)
  if (eligibilityRules.maxAge && vehicle.year) {
    const currentYear = new Date().getFullYear();
    const vehicleAge = currentYear - vehicle.year;
    const maxAge = parseInt(eligibilityRules.maxAge, 10);
    if (!isNaN(maxAge) && vehicleAge > maxAge) return false;
  }

  // Max mileage check
  if (eligibilityRules.maxMileage && mileageKm !== null) {
    const maxMileage = parseInt(String(eligibilityRules.maxMileage).replace(/[^0-9]/g, ""), 10);
    if (!isNaN(maxMileage) && mileageKm > maxMileage) return false;
  }

  // Make restriction
  if (eligibilityRules.makes && Array.isArray(eligibilityRules.makes) && eligibilityRules.makes.length > 0) {
    if (vehicle.make) {
      const makeLower = vehicle.make.toLowerCase();
      const allowed = eligibilityRules.makes.map((m: string) => m.toLowerCase());
      if (!allowed.some((a: string) => makeLower.includes(a) || a.includes(makeLower))) return false;
    }
  }

  // Model restriction
  if (eligibilityRules.models && Array.isArray(eligibilityRules.models) && eligibilityRules.models.length > 0) {
    if (vehicle.model) {
      const modelLower = vehicle.model.toLowerCase();
      const allowed = eligibilityRules.models.map((m: string) => m.toLowerCase());
      if (!allowed.some((a: string) => modelLower.includes(a) || a.includes(modelLower))) return false;
    }
  }

  return true;
}

// ─── component ──────────────────────────────────────────────────────────────

export default function FindProductsPage() {
  const navigate = useNavigate();
  const { dealershipId } = useDealership();
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [vinLoading, setVinLoading] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [dealerPricing, setDealerPricing] = useState<Record<string, { retail_price: Record<string, number>; confidentiality_enabled: boolean }>>({});

  // ── load products (real data) ──────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data: prods, error } = await supabase
          .from("products")
          .select("id, name, product_type, published, provider_entity_id, provider_id, pricing_json, coverage_details_json, eligibility_rules")
          .eq("published", true)
          .order("name");

        if (error) {
          console.error("FindProducts: error fetching products:", error);
          setProducts([]);
          setLoading(false);
          return;
        }

        if (!prods || prods.length === 0) {
          setProducts([]);
          setLoading(false);
          return;
        }

        // Resolve provider names — prefer providers table via provider_entity_id
        const entityIds = [...new Set((prods || []).map((p: any) => p.provider_entity_id).filter(Boolean))];
        let providerMap: Record<string, string> = {};

        if (entityIds.length > 0) {
          const { data: provs } = await supabase
            .from("providers")
            .select("id, company_name")
            .in("id", entityIds);
          (provs || []).forEach((p: any) => { providerMap[p.id] = p.company_name; });
        }

        // Fallback: legacy provider_id → profiles table
        const legacyIds = (prods || [])
          .filter((p: any) => !p.provider_entity_id && p.provider_id)
          .map((p: any) => p.provider_id);

        if (legacyIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, company_name, display_name")
            .in("id", legacyIds);
          (profiles || []).forEach((p: any) => {
            providerMap[p.id] = p.company_name || p.display_name || "Unknown Provider";
          });
        }

        const enriched: Product[] = (prods || []).map((p: any) => ({
          ...p,
          providerName: providerMap[p.provider_entity_id] || providerMap[p.provider_id] || "Unknown Provider",
        }));

        setProducts(enriched);
        const provList = [...new Set(enriched.map((p) => p.providerName).filter((n) => n !== "Unknown Provider"))].sort();
        setProviders(provList);
      } catch (err) {
        console.error("Failed to load products:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── load dealer's custom pricing ──────────────────────────────────────
  useEffect(() => {
    if (!dealershipId) return;
    (async () => {
      const { data } = await supabase
        .from("dealership_product_pricing")
        .select("product_id, retail_price, confidentiality_enabled")
        .eq("dealership_id", dealershipId);
      const map: Record<string, { retail_price: Record<string, number>; confidentiality_enabled: boolean }> = {};
      (data || []).forEach((r: any) => { map[r.product_id] = r; });
      setDealerPricing(map);
    })();
  }, [dealershipId]);

  // ── VIN decode via real edge function ─────────────────────────────────
  const handleDecode = async () => {
    if (vin.length !== 17) return;
    setVinLoading(true);
    setVinError(null);
    setVehicleInfo(null);

    try {
      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
      const res = await fetch(url);

      if (!res.ok) {
        setVinError("Could not reach VIN decode service. Try again.");
        return;
      }

      const data = await res.json();
      const r = data.Results?.[0];

      if (!r || (!r.Make && !r.ModelYear && !r.Model)) {
        setVinError("Could not decode this VIN. Check the number and try again.");
        return;
      }

      const hasMakeModel = (r.Make && r.Make.trim()) || (r.Model && r.Model.trim());
      const warningMsg = r.ErrorCode === "0"
        ? undefined
        : hasMakeModel
          ? "Some VIN details couldn't be verified, but year/make/model were decoded successfully."
          : (r.ErrorText || "Partial decode — some details may be incomplete.");

      setVehicleInfo({
        year: r.ModelYear ? parseInt(r.ModelYear) : null,
        make: r.Make || null,
        model: r.Model || null,
        bodyClass: r.BodyClass || null,
        vehicleType: r.VehicleType || null,
        warning: warningMsg,
      });
    } catch {
      setVinError("Network error — check your connection and try again.");
    } finally {
      setVinLoading(false);
    }
  };

  const handleReset = () => {
    setVin("");
    setMileage("");
    setVehicleInfo(null);
    setVinError(null);
  };

  // ── filtered products ─────────────────────────────────────────────────
  const mileageKm = mileage ? parseInt(mileage, 10) : null;

  const filteredProducts = useMemo(() => {
    let list = products;

    // Provider filter
    if (selectedProvider !== "all") list = list.filter((p) => p.providerName === selectedProvider);

    // Type filter
    if (selectedType !== "all") list = list.filter((p) => p.product_type === selectedType);

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.providerName.toLowerCase().includes(q));
    }

    // Eligibility filter — only applied when a vehicle has been decoded
    if (vehicleInfo) {
      list = list.filter((p) => isEligible(p.eligibility_rules, vehicleInfo, mileageKm));
    }

    return list;
  }, [products, selectedProvider, selectedType, searchQuery, vehicleInfo, mileageKm]);

  const productTypes = useMemo(() => [...new Set(products.map((p) => p.product_type))].sort(), [products]);

  const eligibleCount = vehicleInfo ? filteredProducts.length : null;
  const ineligibleCount = vehicleInfo ? products.filter((p) => !isEligible(p.eligibility_rules, vehicleInfo, mileageKm)).length : null;

  // ── render ────────────────────────────────────────────────────────────
  return (
    <DashboardLayout navItems={dealershipNavItems} title="Find Products">
      <div className="-m-6">

        {/* Hero */}
        <section className="bg-gradient-to-br from-[hsl(225,80%,15%)] via-[hsl(225,70%,20%)] to-[hsl(225,60%,25%)] text-white">
          <div className="px-6 md:px-8 py-10 md:py-14">
            <div className="max-w-2xl">
              <Badge className="bg-white/20 text-white border-white/30 mb-4">Dealer Product Finder</Badge>
              <h1 className="text-2xl md:text-4xl font-bold leading-tight">
                Browse & Quote<br />
                <span className="text-yellow-400">Warranty Plans</span>
              </h1>
              <p className="text-white/60 mt-3 text-base max-w-lg">
                Decode a vehicle VIN to see only eligible plans, compare coverage, and generate quotes.
              </p>
            </div>
          </div>
        </section>

        {/* Vehicle & Deal Information Bar */}
        <section id="vin-bar" className="bg-card border-b border-border">
          <div className="px-6 md:px-8 py-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Car className="w-4 h-4 text-primary" />
              </div>
              <h2 className="font-bold text-foreground">Vehicle & Deal Information</h2>
            </div>

            {/* Row 1: VIN + Decode/Reset */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-end mb-3">
              <div>
                <Label htmlFor="vin" className="text-xs text-muted-foreground">VIN Number (17 characters)</Label>
                <Input
                  id="vin"
                  placeholder="Enter VIN to filter eligible plans"
                  value={vin}
                  onChange={(e) => { setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setVehicleInfo(null); setVinError(null); }}
                  maxLength={17}
                  className="font-mono tracking-wider mt-1"
                />
              </div>
              <Button onClick={handleDecode} disabled={vin.length !== 17 || vinLoading} size="sm" className="gap-1.5">
                {vinLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Decode
              </Button>
              <Button onClick={handleReset} variant="outline" size="sm" className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </Button>
            </div>

            {/* Row 2: Mileage + Loan Amount (always visible) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="mileage" className="text-xs text-muted-foreground">Vehicle Mileage (km) — for eligibility checks</Label>
                <Input
                  id="mileage"
                  type="number"
                  placeholder="e.g. 45000"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="loanAmount" className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Loan Amount — for GAP calculations
                </Label>
                <Input
                  id="loanAmount"
                  type="number"
                  placeholder="e.g. 35000"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {vinError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {vinError}
              </div>
            )}
          </div>
        </section>

        {/* Vehicle Summary (after decode) */}
        {vehicleInfo && !vinError && (
          <section className="bg-gradient-to-r from-primary/5 to-yellow-400/5 border-b border-primary/20">
            <div className="px-6 md:px-8 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Car className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-foreground">
                    {vehicleInfo.year} {vehicleInfo.make} {vehicleInfo.model}
                  </p>
                  {vehicleInfo.bodyClass && <p className="text-xs text-muted-foreground">{vehicleInfo.bodyClass}</p>}
                  {vehicleInfo.warning && <p className="text-xs text-amber-600">{vehicleInfo.warning}</p>}
                </div>
                <div className="ml-auto text-right">
                  {eligibleCount !== null && (
                    <p className="text-sm font-semibold text-green-600">{eligibleCount} eligible plan{eligibleCount !== 1 ? "s" : ""}</p>
                  )}
                  {ineligibleCount !== null && ineligibleCount > 0 && (
                    <p className="text-xs text-muted-foreground">{ineligibleCount} plan{ineligibleCount !== 1 ? "s" : ""} not eligible</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: "Year", value: vehicleInfo.year ?? "—" },
                  { label: "Make", value: vehicleInfo.make ?? "—" },
                  { label: "Model", value: vehicleInfo.model ?? "—" },
                  { label: "Mileage", value: mileage ? `${Number(mileage).toLocaleString()} km` : "—" },
                ].map((item) => (
                  <div key={item.label} className="bg-card rounded-lg p-3 border border-border">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{item.label}</p>
                    <p className="text-sm font-bold text-foreground mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Filters */}
        <div className="border-b bg-card/50 sticky top-0 z-40">
          <div className="px-6 md:px-8 py-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                onClick={() => setSelectedProvider("all")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${selectedProvider === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              >
                All Providers
              </button>
              {providers.map((prov) => (
                <button
                  key={prov}
                  onClick={() => setSelectedProvider(prov)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${selectedProvider === prov ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                >
                  {prov}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedType("all")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${selectedType === "all" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  All Types
                </button>
                {productTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedType(t)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${selectedType === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search plans..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-44 h-8 pl-8 text-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        <section className="px-6 md:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {vehicleInfo ? `Plans for ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}` : "All Available Plans"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {filteredProducts.length} plan{filteredProducts.length !== 1 ? "s" : ""}
                {vehicleInfo ? " eligible for this vehicle" : " available"}
                {selectedProvider !== "all" ? ` · ${selectedProvider}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => navigate("/dealership/compare")}
              >
                <LayoutGrid className="w-4 h-4" />
                Compare All Plans
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => navigate("/dealership/contracts/new")}
              >
                <FileText className="w-4 h-4" />
                New Quote
              </Button>
            </div>
          </div>




          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-xl border bg-card py-16 text-center">
              <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">No active products found.</p>
              <p className="text-sm text-muted-foreground mt-1">Providers need to publish products before they appear here.</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-xl border bg-card py-16 text-center">
              <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">
                {vehicleInfo ? "No eligible plans for this vehicle." : "No plans match your filters."}
              </p>
              {vehicleInfo && (
                <p className="text-sm text-muted-foreground mt-1">
                  Try adjusting the mileage or checking another provider.
                </p>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
              {filteredProducts.map((product) => {
                const config = dealerPricing[product.id];
                const useCustomRetail = config?.confidentiality_enabled && config?.retail_price && Object.keys(config.retail_price).length > 0;
                const minCustomRetail = useCustomRetail ? Math.min(...Object.values(config.retail_price).filter(v => v > 0)) : null;
                const minPrice = minCustomRetail ?? getMinPrice(product.pricing_json);
                const maxPrice = getMaxPrice(product.pricing_json);
                const tierChips = getUniqueTierNames(product.pricing_json);
                const cd = product.coverage_details_json || {};
                const categories: Array<{ name: string; parts: string[] }> = cd.categories || [];
                const er = product.eligibility_rules || {};
                const eligParts: string[] = [];
                if (er.maxAge) eligParts.push(`up to ${er.maxAge} yrs`);
                if (er.maxMileage) eligParts.push(`up to ${Number(er.maxMileage).toLocaleString()} km`);
                const eligText = eligParts.length ? eligParts.join(", ") : "";
                const isTireRim = ["Tire & Rim", "TIRE_RIM", "tire_rim"].includes(product.product_type);
                const totalCoverage = categories.length;
                const visibleCats = categories.slice(0, 5);
                const hiddenCount = totalCoverage - 5;

                return (
                  <div key={product.id} className="flex flex-col rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-primary/30 transition-all overflow-hidden">
                    {/* Colorful accent bar */}
                    <div className={`h-1.5 w-full ${isTireRim ? "bg-gradient-to-r from-teal-500 to-cyan-400" : "bg-gradient-to-r from-primary to-blue-400"}`} />

                    <div className="p-5 flex flex-col flex-1 gap-3">

                      {/* Badges: provider + tier count or type */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          {product.providerName}
                        </span>
                        {tierChips.length > 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                            {tierChips.length} Tier{tierChips.length !== 1 ? "s" : ""}
                          </span>
                        ) : isTireRim ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                            Tire & Rim
                          </span>
                        ) : null}
                      </div>

                      {/* Plan name + price */}
                      <div>
                        <h3 className="font-bold text-slate-900 text-[15px] leading-snug">{product.name}</h3>
                        {minPrice !== null && (
                          <p className="text-sm font-bold text-primary mt-0.5">
                            ${minPrice.toLocaleString()}
                            {maxPrice !== null && maxPrice !== minPrice && ` – $${maxPrice.toLocaleString()}`}
                          </p>
                        )}
                      </div>

                      {/* Tier chips (Bronze, Gold, etc.) */}
                      {tierChips.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tierChips.slice(0, 4).map((chip) => (
                            <span key={chip} className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {chip}
                            </span>
                          ))}
                          {tierChips.length > 4 && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-500">
                              +{tierChips.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Eligibility box */}
                      {eligText && (
                        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                          <p className="text-xs text-slate-500">{eligText.charAt(0).toUpperCase() + eligText.slice(1)}</p>
                        </div>
                      )}

                      {/* Coverage count + list */}
                      {totalCoverage > 0 && (
                        <>
                          <div className="flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="text-xs font-semibold text-slate-800">
                              <strong>{totalCoverage}</strong> item{totalCoverage !== 1 ? "s" : ""} covered
                            </span>
                          </div>
                          <ul className="space-y-1">
                            {visibleCats.map((cat) => (
                              <li key={cat.name} className="flex items-center gap-2 text-xs text-slate-600">
                                <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                                <span className="font-medium text-slate-700">{cat.name}</span>
                              </li>
                            ))}
                            {hiddenCount > 0 && (
                              <li className="text-xs text-primary font-medium pl-5">
                                +{hiddenCount} more
                              </li>
                            )}
                          </ul>
                        </>
                      )}

                      {/* $0 Premium Fees */}
                      <div className="flex">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          $0 Premium Fees
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-auto pt-1 flex gap-2">
                        <button
                          onClick={() => isTireRim ? navigate("/dealership/tire-rim") : navigate(`/dealership/coverage/${product.id}`)}
                          className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-white transition-colors shadow-sm"
                        >
                          View Details →
                        </button>
                        <button
                          onClick={() => navigate(`/dealership/contracts/new?productId=${product.id}`)}
                          className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-300 text-slate-600 hover:border-primary/40 hover:text-primary bg-white transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Quote
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
