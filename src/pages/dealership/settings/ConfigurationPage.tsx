import { useEffect, useState, useMemo, useCallback } from "react";
import DashboardLayout, { dealershipNavItems } from "../../../components/dashboard/DashboardLayout";
import { Card, CardContent } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Badge } from "../../../components/ui/badge";
import { supabase } from "../../../integrations/supabase/client";
import { useDealership } from "../../../hooks/useDealership";
import { useToast } from "../../../hooks/use-toast";
import { Settings2, DollarSign, Pencil, Check, X, ChevronRight, Search, Package } from "lucide-react";
import { cn } from "../../../lib/utils";

interface FlatTier {
  termLabel: string;
  termMonths: number;
  km: string;
  dealerCost: number;
  suggestedRetail: number;
}

interface Product {
  id: string;
  name: string;
  type: string;
  tier?: string;
  group?: string;
  pricing: any;
  coverage_details: any;
  eligibility_rules: any;
  provider_id: string;
}

interface PricingConfig {
  product_id: string;
  retail_price: Record<string, number>;
  confidentiality_enabled: boolean;
}

const fmt = (v: number) => `$${v.toLocaleString("en-CA", { minimumFractionDigits: 2 })}`;

function extractFlatTiers(pricing: any): FlatTier[] {
  if (!pricing) return [];

  // V2 format: pricing.rows[]
  if (Array.isArray(pricing.rows) && pricing.rows.length > 0) {
    return pricing.rows.map((r: any, i: number) => ({
      termLabel: r.label || `Term ${i + 1}`,
      termMonths: 0,
      km: r.vehicleClass || "",
      dealerCost: Number(r.dealerCost ?? r.dealer_cost ?? 0),
      suggestedRetail: Number(r.suggestedRetail ?? r.suggested_retail ?? 0),
    }));
  }

  const pricingTiers = pricing.pricingTiers || [];
  const tiers: FlatTier[] = [];

  for (const pt of pricingTiers) {
    const terms = pt.terms || [];
    const rows = pt.rows || [];
    const baseRow = rows.find((r: any) => r.label === "Base Price");
    if (!baseRow || !terms.length) continue;

    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      const cost = typeof baseRow.values[i] === "number" ? baseRow.values[i] : parseFloat(baseRow.values[i]) || 0;
      tiers.push({
        termLabel: term.label,
        termMonths: term.months,
        km: term.km || "Unlimited",
        dealerCost: cost,
        suggestedRetail: Math.round(cost * 1.4),
      });
    }
  }

  // Legacy flat format
  if (tiers.length === 0 && pricing.tiers) {
    for (const t of pricing.tiers) {
      tiers.push({
        termLabel: t.term || "",
        termMonths: 0,
        km: t.mileage_bracket || "",
        dealerCost: t.dealer_cost || 0,
        suggestedRetail: t.suggested_retail || 0,
      });
    }
  }

  return tiers;
}

function tierKey(tier: FlatTier, index: number) {
  return `${tier.termLabel}|${tier.km}|${index}`;
}

function displayName(product: Product): string {
  const cd = product.coverage_details || {};
  const tier = cd.tier || product.tier;
  const group = cd.group || product.group;
  if (group && tier) {
    const groupLabel = group.charAt(0).toUpperCase() + group.slice(1);
    return `${groupLabel} Plan — ${tier}`;
  }
  return product.name;
}

const typeLabel = (type: string) => {
  const map: Record<string, string> = {
    VSC: "Vehicle Service Contract",
    "Tire & Rim": "Tire & Rim Protection",
    GAP: "GAP Insurance",
    warranty: "Vehicle Service Contract",
    tire_rim: "Tire & Rim Protection",
  };
  return map[type] || type;
};

export default function ConfigurationPage() {
  const { dealershipId, memberRole, loading: dLoading } = useDealership();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [providers, setProviders] = useState<Record<string, string>>({});
  const [pricingConfigs, setPricingConfigs] = useState<Record<string, PricingConfig>>({});
  const [confidentialityEnabled, setConfidentialityEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [editingTiers, setEditingTiers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editAllMode, setEditAllMode] = useState(false);

  const isAdmin = memberRole === "admin";

  useEffect(() => {
    const fetchData = async () => {
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, product_type, pricing_json, coverage_details_json, coverage_details, eligibility_rules, provider_id, provider_entity_id, published")
        .eq("published", true)
        .order("name");

      const prodList = (prods || []).map((p: any) => {
        const cd = p.coverage_details_json ?? p.coverage_details;
        const pricing = p.pricing_json ?? p.pricing;
        const er = p.eligibility_rules;
        const cdParsed = (() => {
          if (!cd) return {};
          if (typeof cd === "object") return cd;
          try { return JSON.parse(cd); } catch { return {}; }
        })();
        const pricingParsed = (() => {
          if (!pricing) return {};
          if (typeof pricing === "object") return pricing;
          try { return JSON.parse(pricing); } catch { return {}; }
        })();
        const erParsed = (() => {
          if (!er) return {};
          if (typeof er === "object") return er;
          try { return JSON.parse(er); } catch { return {}; }
        })();
        return {
          ...p,
          type: p.product_type || "",
          pricing: pricingParsed,
          coverage_details: cdParsed,
          eligibility_rules: erParsed,
          provider_id: p.provider_entity_id ?? p.provider_id,
          tier: cdParsed?.tier,
          group: cdParsed?.group,
        };
      }) as Product[];

      setProducts(prodList);

      const providerIds = [...new Set(prodList.map((p) => p.provider_id))];
      if (providerIds.length) {
        const { data: provs } = await supabase
          .from("providers")
          .select("id, company_name")
          .in("id", providerIds);
        const map: Record<string, string> = {};
        (provs || []).forEach((p: any) => { map[p.id] = p.company_name; });
        setProviders(map);
      }

      if (prodList.length > 0) setSelectedProduct(prodList[0].id);

      if (dealershipId) {
        const { data: configs } = await supabase
          .from("dealership_product_pricing")
          .select("product_id, retail_price, confidentiality_enabled")
          .eq("dealership_id", dealershipId);

        const configMap: Record<string, PricingConfig> = {};
        (configs || []).forEach((c: any) => {
          configMap[c.product_id] = c;
          if (c.confidentiality_enabled) setConfidentialityEnabled(true);
        });
        setPricingConfigs(configMap);
      }

      setLoading(false);
    };
    fetchData();
  }, [dealershipId]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = !search || displayName(p).toLowerCase().includes(search.toLowerCase());
      const matchesProvider = providerFilter === "all" || p.provider_id === providerFilter;
      return matchesSearch && matchesProvider;
    });
  }, [products, search, providerFilter]);

  const selectedProductData = products.find((p) => p.id === selectedProduct);
  const tiers: FlatTier[] = selectedProductData ? extractFlatTiers(selectedProductData.pricing) : [];

  const handleToggleConfidentiality = async (enabled: boolean) => {
    setConfidentialityEnabled(enabled);
    if (dealershipId) {
      for (const productId of Object.keys(pricingConfigs)) {
        await supabase
          .from("dealership_product_pricing")
          .update({ confidentiality_enabled: enabled })
          .eq("dealership_id", dealershipId)
          .eq("product_id", productId);
      }
    }
    toast({
      title: enabled ? "Confidentiality Pricing Enabled" : "Confidentiality Pricing Disabled",
      description: enabled ? "Retail pricing is now active for customers." : "Showing dealer internal cost.",
    });
  };

  const getRetailPrice = (productId: string, tier: FlatTier, index: number): number | null => {
    const config = pricingConfigs[productId];
    if (!config?.retail_price) return null;
    const key = tierKey(tier, index);
    return (config.retail_price as Record<string, number>)[key] ?? null;
  };

  const getMarkup = (cost: number, retail: number | null): string => {
    if (!retail || retail <= 0 || cost <= 0) return "—";
    const pct = ((retail - cost) / cost) * 100;
    return `${pct.toFixed(1)}%`;
  };

  const handleSaveTierPrice = async (productId: string, tier: FlatTier, index: number) => {
    if (!dealershipId) return;
    const key = tierKey(tier, index);
    const priceStr = editingTiers[key];
    if (!priceStr) return;

    setSaving((prev) => ({ ...prev, [key]: true }));
    const price = parseFloat(priceStr);
    const existing = pricingConfigs[productId];
    const newRetailPrice = { ...(existing?.retail_price || {}), [key]: price };

    if (existing) {
      await supabase
        .from("dealership_product_pricing")
        .update({ retail_price: newRetailPrice, confidentiality_enabled: confidentialityEnabled })
        .eq("dealership_id", dealershipId)
        .eq("product_id", productId);
    } else {
      await supabase.from("dealership_product_pricing").insert({
        dealership_id: dealershipId,
        product_id: productId,
        retail_price: newRetailPrice,
        confidentiality_enabled: confidentialityEnabled,
      });
    }

    setPricingConfigs((prev) => ({
      ...prev,
      [productId]: { product_id: productId, retail_price: newRetailPrice, confidentiality_enabled: confidentialityEnabled },
    }));
    setEditingTiers((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setSaving((prev) => ({ ...prev, [key]: false }));
    toast({ title: "Price Saved" });
  };

  const handleEditAll = useCallback(() => {
    if (!selectedProductData) return;
    const newEditing: Record<string, string> = {};
    tiers.forEach((tier, i) => {
      const key = tierKey(tier, i);
      const customRetail = getRetailPrice(selectedProductData.id, tier, i);
      newEditing[key] = customRetail?.toString() || tier.suggestedRetail.toString();
    });
    setEditingTiers(newEditing);
    setEditAllMode(true);
  }, [selectedProductData, tiers, pricingConfigs]);

  const handleSaveAll = async () => {
    if (!selectedProductData || !dealershipId) return;
    setSaving((prev) => ({ ...prev, __all: true }));

    const existing = pricingConfigs[selectedProductData.id];
    const newRetailPrice = { ...(existing?.retail_price || {}) };

    tiers.forEach((tier, i) => {
      const key = tierKey(tier, i);
      if (editingTiers[key]) newRetailPrice[key] = parseFloat(editingTiers[key]);
    });

    if (existing) {
      await supabase
        .from("dealership_product_pricing")
        .update({ retail_price: newRetailPrice, confidentiality_enabled: confidentialityEnabled })
        .eq("dealership_id", dealershipId)
        .eq("product_id", selectedProductData.id);
    } else {
      await supabase.from("dealership_product_pricing").insert({
        dealership_id: dealershipId,
        product_id: selectedProductData.id,
        retail_price: newRetailPrice,
        confidentiality_enabled: confidentialityEnabled,
      });
    }

    setPricingConfigs((prev) => ({
      ...prev,
      [selectedProductData.id]: { product_id: selectedProductData.id, retail_price: newRetailPrice, confidentiality_enabled: confidentialityEnabled },
    }));
    setEditingTiers({});
    setEditAllMode(false);
    setSaving((prev) => ({ ...prev, __all: false }));
    toast({ title: "All Prices Saved", description: `Updated ${tiers.length} pricing tiers.` });
  };

  const handleCancelAll = () => { setEditingTiers({}); setEditAllMode(false); };

  if (dLoading || loading) {
    return (
      <DashboardLayout navItems={dealershipNavItems} title="Configuration">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={dealershipNavItems} title="Configuration">
      <div className="space-y-6 max-w-[1400px] mx-auto">

        {/* Header card */}
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="py-5 px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Settings2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Dealer Pricing Configuration</h2>
                  <p className="text-sm text-muted-foreground">
                    Set your retail prices for each product. Customers will see these prices on quotes.
                  </p>
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-3 bg-background/80 rounded-xl px-4 py-2.5 border">
                  <span className="text-sm font-medium whitespace-nowrap">Show Retail to Customers</span>
                  <Switch checked={confidentialityEnabled} onCheckedChange={handleToggleConfidentiality} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All Providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {Object.entries(providers).map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Two-panel layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">

          {/* Left: Product list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
              Products ({filteredProducts.length})
            </p>
            <div className="space-y-1 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
              {filteredProducts.map((p) => {
                const flatTiers = extractFlatTiers(p.pricing);
                const minPrice = flatTiers.length > 0 ? Math.min(...flatTiers.map((t) => t.dealerCost)) : 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProduct(p.id); setEditingTiers({}); setEditAllMode(false); }}
                    className={cn(
                      "w-full text-left rounded-xl px-4 py-3 transition-all duration-150 hover:bg-muted/60",
                      selectedProduct === p.id
                        ? "bg-primary/10 border border-primary/30 shadow-sm"
                        : "bg-card border border-transparent"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{displayName(p)}</p>
                        <p className="text-xs text-muted-foreground truncate">{typeLabel(p.type)}</p>
                      </div>
                      <ChevronRight className={cn("w-4 h-4 shrink-0 transition-colors", selectedProduct === p.id ? "text-primary" : "text-muted-foreground/40")} />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{providers[p.provider_id] || "Unknown"}</Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{flatTiers.length} tiers</Badge>
                      {minPrice > 0 && <span className="text-[10px] text-muted-foreground">from {fmt(minPrice)}</span>}
                    </div>
                  </button>
                );
              })}
              {filteredProducts.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No products found.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Pricing detail */}
          <div className="space-y-5">
            {!selectedProductData ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground font-medium">Select a product to configure pricing</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Product header */}
                <Card>
                  <CardContent className="py-5 px-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <DollarSign className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold">{displayName(selectedProductData)}</h3>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {typeLabel(selectedProductData.type)} · {providers[selectedProductData.provider_id] || "Unknown Provider"}
                          </p>
                          {selectedProductData.tier && (
                            <Badge variant="outline" className="mt-1.5">Tier: {selectedProductData.tier}</Badge>
                          )}
                          {selectedProductData.eligibility_rules?.eligibility && (
                            <Badge variant="outline" className="mt-1.5 ml-1.5 font-normal">
                              {selectedProductData.eligibility_rules.eligibility}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {isAdmin && tiers.length > 0 && (
                        <div className="flex items-center gap-2 shrink-0">
                          {editAllMode ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={handleCancelAll}>
                                <X className="w-4 h-4 mr-1" /> Cancel
                              </Button>
                              <Button size="sm" onClick={handleSaveAll} disabled={saving.__all}>
                                <Check className="w-4 h-4 mr-1" /> Save All
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" onClick={handleEditAll}>
                              <Pencil className="w-4 h-4 mr-1" /> Edit All Prices
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Pricing tiers */}
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Pricing Tiers ({tiers.length})
                </p>

                {tiers.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      No pricing tiers configured for this product yet.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {tiers.map((tier, i) => {
                      const key = tierKey(tier, i);
                      const customRetail = getRetailPrice(selectedProductData.id, tier, i);
                      const isEditing = key in editingTiers;
                      const markup = getMarkup(tier.dealerCost, customRetail ?? tier.suggestedRetail);

                      return (
                        <Card key={i} className={cn("transition-all duration-150", isEditing && "ring-2 ring-primary/30 border-primary/20")}>
                          <CardContent className="py-4 px-5">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-3 items-center">
                              <div>
                                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Term</p>
                                <p className="font-semibold text-sm">{tier.termLabel}</p>
                              </div>
                              <div>
                                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Mileage</p>
                                <p className="font-medium text-sm">{tier.km}</p>
                              </div>
                              <div>
                                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Dealer Cost</p>
                                <p className="font-bold text-sm">{fmt(tier.dealerCost)}</p>
                              </div>
                              <div>
                                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Suggested Retail</p>
                                <p className="text-sm text-muted-foreground">{fmt(tier.suggestedRetail)}</p>
                              </div>
                              <div>
                                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Your Retail Price</p>
                                {isEditing ? (
                                  <div className="flex items-center gap-2">
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                                      <Input
                                        type="number"
                                        className="w-28 h-8 pl-6 text-sm"
                                        placeholder="0.00"
                                        value={editingTiers[key]}
                                        onChange={(e) => setEditingTiers((prev) => ({ ...prev, [key]: e.target.value }))}
                                        autoFocus={!editAllMode}
                                      />
                                    </div>
                                    {!editAllMode && (
                                      <>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleSaveTierPrice(selectedProductData.id, tier, i)} disabled={saving[key]}>
                                          <Check className="w-4 h-4 text-green-600" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingTiers((prev) => { const n = { ...prev }; delete n[key]; return n; })}>
                                          <X className="w-4 h-4 text-muted-foreground" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    {customRetail != null ? (
                                      <span className="font-bold text-sm text-primary">{fmt(customRetail)}</span>
                                    ) : (
                                      <span className="text-sm text-muted-foreground/50 italic">Not set</span>
                                    )}
                                    {isAdmin && !editAllMode && (
                                      <Button size="icon" variant="ghost" className="h-7 w-7"
                                        onClick={() => setEditingTiers((prev) => ({ ...prev, [key]: customRetail?.toString() || tier.suggestedRetail.toString() }))}>
                                        <Pencil className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Markup</p>
                                <Badge
                                  variant={markup !== "—" ? "default" : "secondary"}
                                  className={cn("text-xs", markup !== "—" && "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400")}
                                >
                                  {markup}
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
