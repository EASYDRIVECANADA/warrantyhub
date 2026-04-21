import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout, { providerNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Switch } from "../../components/ui/switch";
import { useToast } from "../../hooks/use-toast";
import { getProductsV2Api } from "../../lib/products/productsV2";
import type { ProductV2, CoverageCategory, PricingRow, Benefit, TermsSection } from "../../lib/products/typesV2";
import {
  Save, ArrowLeft, Plus, Trash2, Sparkles, Eye,
  FileText, Shield, DollarSign, Award, Scale, Loader2, Globe, EyeOff,
} from "lucide-react";
import { cn } from "../../lib/utils";

// ── Types ──────────────────────────────────────────

interface ProductForm {
  name: string;
  type: string;
  description: string;
  group: string;
  slug: string;
  maxAge: string;
  maxMileage: string;
  vehicleTypes: string;
  premiumMakes: string;
  deductible: string;
  perClaim: string;
  eligibilityLabel: string;
  coverageCategories: CoverageCategory[];
  pricingRows: PricingRow[];
  benefits: Benefit[];
  termsSections: TermsSection[];
  exclusions: string;
  waitingPeriod: string;
  coverageTerritory: string;
  disputeResolution: string;
  importantNotes: string;
}

const TYPE_LABELS: Record<string, string> = {
  VSC: "Vehicle Service Contract",
  GAP: "GAP Insurance",
  "Tire & Rim": "Tire & Rim Protection",
  PPF: "Paint Protection Film",
  "Ceramic Coating": "Ceramic Coating",
  Undercoating: "Undercoating",
  "Key Replacement": "Key Replacement",
  "Dent Repair": "Dent Repair",
  Other: "Other",
};

const emptyForm: ProductForm = {
  name: "", type: "VSC", description: "", group: "", slug: "",
  maxAge: "", maxMileage: "", vehicleTypes: "", premiumMakes: "",
  deductible: "", perClaim: "", eligibilityLabel: "",
  coverageCategories: [],
  pricingRows: [],
  benefits: [],
  termsSections: [],
  exclusions: "",
  waitingPeriod: "",
  coverageTerritory: "",
  disputeResolution: "",
  importantNotes: "",
};

// ── DB ↔ Form converters ──────────────────────────

function productToForm(product: ProductV2): ProductForm {
  const cd = (product.coverageDetails ?? {}) as any;
  const pr = (product.pricing ?? {}) as any;
  const er = (product.eligibilityRules ?? {}) as any;

  const pricingRows: PricingRow[] = (pr.rows || pr.tiers || []).map((t: any) => ({
    term: t.term || t.label || "",
    mileageBracket: t.mileageBracket || t.mileage_bracket || "",
    vehicleClass: t.vehicleClass || t.vehicle_class || "Class 1",
    dealerCost: t.dealerCost || t.dealer_cost || 0,
    suggestedRetail: t.suggestedRetail || t.suggested_retail || 0,
  }));

  const coverageCategories: CoverageCategory[] = (cd.categories || cd.coverageCategories || []).map((c: any) => ({
    name: c.name || "",
    parts: Array.isArray(c.parts) ? c.parts : (c.parts || "").split(",").map((s: string) => s.trim()),
  }));

  const rawBenefits = product.benefits || pr.benefits || [];
  const benefits: Benefit[] = rawBenefits.map((b: any) =>
    typeof b === "string" ? { name: b, included: true } : { name: b.name, included: b.included ?? true }
  );

  const rawTerms = product.termsSections || cd.termsSections || [];

  return {
    name: product.name || "",
    type: product.type || "VSC",
    description: product.description || "",
    group: cd.group || "",
    slug: cd.slug || "",
    maxAge: String(er.maxAge || er.max_age || ""),
    maxMileage: String(er.maxMileage || er.max_mileage || ""),
    vehicleTypes: er.vehicleTypes || er.vehicle_types || "",
    premiumMakes: (er.premiumMakes || er.premium_makes || er.makes || []).join?.(", ") ?? "",
    deductible: String(pr.deductible || ""),
    perClaim: String(pr.perClaim || pr.per_claim || ""),
    eligibilityLabel: pr.eligibility || "",
    coverageCategories: coverageCategories,
    pricingRows,
    benefits,
    termsSections: rawTerms,
    exclusions: (product.exclusions || (cd.exclusions || []).join?.("\n")) || "",
    waitingPeriod: cd.waitingPeriod || "",
    coverageTerritory: cd.coverageTerritory || "",
    disputeResolution: cd.disputeResolution || "",
    importantNotes: (pr.importantNotes || []).join?.("\n") || "",
  };
}

function formToDbFields(form: ProductForm) {
  return {
    coverageDetails: {
      group: form.group || undefined,
      slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      categories: form.coverageCategories.map(c => ({ name: c.name, parts: c.parts.filter(Boolean) })),
      termsSections: form.termsSections,
      exclusions: form.exclusions.split("\n").filter(Boolean),
      waitingPeriod: form.waitingPeriod,
      coverageTerritory: form.coverageTerritory,
      disputeResolution: form.disputeResolution,
    },
    pricing: {
      deductible: form.deductible,
      perClaim: form.perClaim || undefined,
      eligibility: form.eligibilityLabel,
      rows: form.pricingRows.map(r => ({
        label: r.term,
        term: r.term,
        mileageBracket: r.mileageBracket,
        vehicleClass: r.vehicleClass,
        dealerCost: r.dealerCost,
        suggestedRetail: r.suggestedRetail,
      })),
      benefits: form.benefits.filter(b => b.included).map(b => ({ name: b.name })),
      importantNotes: form.importantNotes.split("\n").filter(Boolean),
    },
    eligibilityRules: {
      maxAge: form.maxAge || undefined,
      maxMileage: form.maxMileage || undefined,
      makes: form.premiumMakes.split(",").map(s => s.trim()).filter(Boolean),
    },
  };
}

// ── Component ──────────────────────────────────────

export default function ProviderProductEditorPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const api = getProductsV2Api();
  const isNew = !id || id === "new";
  const showAI = searchParams.get("ai") === "true";

  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [activeTab, setActiveTab] = useState(showAI ? "ai" : "overview");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (!isNew && id) {
      api.get(id).then(product => {
        if (product) {
          setForm(productToForm(product));
          setPublished(product.status === "active");
        }
        setLoading(false);
      }).catch(err => {
        console.error("Failed to load product:", err);
        setLoading(false);
      });
    }
  }, [id, isNew]);

  const updateForm = (updates: Partial<ProductForm>) => setForm(prev => ({ ...prev, ...updates }));

  // Coverage helpers
  const addCoverageCategory = () => updateForm({ coverageCategories: [...form.coverageCategories, { name: "", parts: [""] }] });
  const removeCoverageCategory = (i: number) => updateForm({ coverageCategories: form.coverageCategories.filter((_, idx) => idx !== i) });
  const updateCategory = (i: number, u: Partial<CoverageCategory>) => {
    const cats = [...form.coverageCategories]; cats[i] = { ...cats[i], ...u }; updateForm({ coverageCategories: cats });
  };
  const addPartToCategory = (ci: number) => { const c = [...form.coverageCategories]; c[ci].parts.push(""); updateForm({ coverageCategories: c }); };
  const updatePart = (ci: number, pi: number, v: string) => { const c = [...form.coverageCategories]; c[ci].parts[pi] = v; updateForm({ coverageCategories: c }); };
  const removePart = (ci: number, pi: number) => { const c = [...form.coverageCategories]; c[ci].parts = c[ci].parts.filter((_, i) => i !== pi); updateForm({ coverageCategories: c }); };

  // Pricing helpers
  const addPricingRow = () => updateForm({ pricingRows: [...form.pricingRows, { term: "", mileageBracket: "", vehicleClass: "Class 1", dealerCost: 0, suggestedRetail: 0 }] });
  const removePricingRow = (i: number) => updateForm({ pricingRows: form.pricingRows.filter((_, idx) => idx !== i) });
  const updatePricingRow = (i: number, u: Partial<PricingRow>) => { const r = [...form.pricingRows]; r[i] = { ...r[i], ...u }; updateForm({ pricingRows: r }); };

  // Benefits
  const toggleBenefit = (i: number) => { const b = [...form.benefits]; b[i] = { ...b[i], included: !b[i].included }; updateForm({ benefits: b }); };
  const updateBenefitName = (i: number, name: string) => { const b = [...form.benefits]; b[i] = { ...b[i], name }; updateForm({ benefits: b }); };
  const removeBenefit = (i: number) => updateForm({ benefits: form.benefits.filter((_, idx) => idx !== i) });

  // Terms
  const addTermsSection = () => updateForm({ termsSections: [...form.termsSections, { title: "", content: "" }] });
  const removeTermsSection = (i: number) => updateForm({ termsSections: form.termsSections.filter((_, idx) => idx !== i) });
  const updateTermsSection = (i: number, u: Partial<TermsSection>) => { const s = [...form.termsSections]; s[i] = { ...s[i], ...u }; updateForm({ termsSections: s }); };

  // AI extract
  const handleAIExtract = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-plan-data`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }, body: JSON.stringify({ text: aiText }) }
      );
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || "AI extraction failed"); }
      const data = await response.json();
      if (data.product) {
        const p = data.product;
        updateForm({
          name: p.name || form.name, type: p.type || form.type, description: p.description || form.description,
          group: p.group || form.group, maxAge: p.maxAge || form.maxAge, maxMileage: p.maxMileage || form.maxMileage,
          deductible: p.deductible || form.deductible, perClaim: p.perClaim || form.perClaim,
          coverageCategories: p.coverageCategories?.length ? p.coverageCategories : form.coverageCategories,
          pricingRows: p.pricingRows?.length ? p.pricingRows : form.pricingRows,
          benefits: p.benefits?.length ? p.benefits : form.benefits,
          termsSections: p.termsSections?.length ? p.termsSections : form.termsSections,
          exclusions: p.exclusions || form.exclusions, waitingPeriod: p.waitingPeriod || form.waitingPeriod,
          coverageTerritory: p.coverageTerritory || form.coverageTerritory, importantNotes: p.importantNotes || form.importantNotes,
        });
        toast({ title: "AI Extraction Complete", description: "Plan data populated. Review and adjust." });
        setActiveTab("overview");
      }
    } catch (err: any) {
      toast({ title: "AI Error", description: err.message, variant: "destructive" });
    } finally { setAiLoading(false); }
  };

  // Save to DB
  const handleSave = async (publishOnSave?: boolean) => {
    if (!form.name) { toast({ title: "Missing Name", description: "Please enter a product name.", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const db = formToDbFields(form);
      const status = publishOnSave ? "active" : "inactive";
      if (isNew) {
        await api.create({
          name: form.name,
          type: form.type as any,
          description: form.description,
          status: status as any,
          coverageDetails: db.coverageDetails as any,
          pricing: db.pricing as any,
          eligibilityRules: db.eligibilityRules as any,
        });
        if (publishOnSave) setPublished(true);
      } else {
        await api.update(id!, {
          name: form.name,
          type: form.type as any,
          description: form.description,
          status: status as any,
          coverageDetails: db.coverageDetails as any,
          pricing: db.pricing as any,
          eligibilityRules: db.eligibilityRules as any,
        });
        if (publishOnSave !== undefined) setPublished(publishOnSave);
      }
      toast({ title: isNew ? "Product Created" : "Product Saved", description: `${form.name} saved${publishOnSave ? " and published" : " as draft"} successfully.` });
      navigate("/provider/products");
    } catch (err: any) {
      console.error("Save error:", err);
      toast({ title: "Save Failed", description: err.message || "Could not save product.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  // Toggle publish state for existing products
  const handlePublishToggle = async () => {
    if (isNew || !id) return;
    setPublishing(true);
    try {
      const newPublished = !published;
      await api.update(id, { status: newPublished ? "active" : "inactive" } as any);
      setPublished(newPublished);
      toast({ title: newPublished ? "Product Published" : "Product Unpublished", description: newPublished ? "Dealers can now see this product in the marketplace." : "Product hidden from marketplace." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not update publish state.", variant: "destructive" });
    } finally { setPublishing(false); }
  };

  const tabs = [
    { value: "overview", label: "Overview", icon: FileText },
    { value: "eligibility", label: "Eligibility", icon: Shield },
    { value: "coverage", label: "Coverage", icon: Shield },
    { value: "pricing", label: "Pricing Tiers", icon: DollarSign },
    { value: "benefits", label: "Benefits", icon: Award },
    { value: "terms", label: "Terms", icon: Scale },
    { value: "ai", label: "AI", icon: Sparkles },
    { value: "preview", label: "Preview", icon: Eye },
  ];

  if (loading) {
    return (
      <DashboardLayout navItems={providerNavItems} title="Loading...">
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={providerNavItems} title={isNew ? "New Product" : "Edit Product"}>
      <div className="space-y-4 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/provider/products")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <h2 className="text-xl font-bold">{isNew ? "Create New Product" : `Edit: ${form.name}`}</h2>
            {!isNew && (
              <Badge variant={published ? "default" : "secondary"} className={published ? "bg-green-500 text-white" : ""}>
                {published ? "Published" : "Draft"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isNew && (
              <Button variant="outline" onClick={handlePublishToggle} disabled={publishing}>
                {published
                  ? <><EyeOff className="w-4 h-4 mr-1" />{publishing ? "Unpublishing..." : "Unpublish"}</>
                  : <><Globe className="w-4 h-4 mr-1" />{publishing ? "Publishing..." : "Publish"}</>
                }
              </Button>
            )}
            {isNew ? (
              <>
                <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
                  <Save className="w-4 h-4 mr-1" />
                  {saving ? "Saving..." : "Save as Draft"}
                </Button>
                <Button onClick={() => handleSave(true)} disabled={saving}>
                  <Globe className="w-4 h-4 mr-1" />
                  {saving ? "Publishing..." : "Save & Publish"}
                </Button>
              </>
            ) : (
              <Button onClick={() => handleSave(published)} disabled={saving}>
                <Save className="w-4 h-4 mr-1" />
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5 text-xs sm:text-sm">
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* AI */}
          <TabsContent value="ai">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> AI-Powered Plan Import</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!import.meta.env.VITE_LOVABLE_API_KEY ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-4 mb-4"><Sparkles className="w-8 h-8 text-muted-foreground" /></div>
                    <h3 className="text-lg font-semibold mb-2">AI Extraction Not Configured</h3>
                    <p className="text-sm text-muted-foreground max-w-md">AI-powered plan import requires an API key to be configured. Please contact your administrator to enable this feature.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Paste your plan document or brochure text. AI will extract all details and auto-fill the form.</p>
                    <Textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Paste your plan document text here..." className="min-h-[300px] font-mono text-sm" />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{aiText.length} characters</p>
                      <Button onClick={handleAIExtract} disabled={aiLoading || !aiText.trim()}>
                        <Sparkles className="w-4 h-4 mr-1" /> {aiLoading ? "Extracting..." : "Extract & Auto-Fill"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Overview */}
          <TabsContent value="overview">
            <Card>
              <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Product Name *</Label>
                    <Input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} placeholder="e.g., Gold Powertrain $1500" />
                  </div>
                  <div>
                    <Label>Product Type *</Label>
                    <Select value={form.type} onValueChange={(v) => updateForm({ type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TYPE_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Product Group / Family</Label>
                    <Input value={form.group} onChange={(e) => updateForm({ group: e.target.value })} placeholder="e.g., Powertrain" />
                  </div>
                  <div>
                    <Label>Eligibility Label</Label>
                    <Input value={form.eligibilityLabel} onChange={(e) => updateForm({ eligibilityLabel: e.target.value })} placeholder="e.g., Any Year, Make, Model or Mileage" />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => updateForm({ description: e.target.value })} placeholder="Describe what this product covers..." className="min-h-[100px]" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Eligibility */}
          <TabsContent value="eligibility">
            <Card>
              <CardHeader><CardTitle>Eligibility Rules</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>Max Vehicle Age (years)</Label><Input type="number" value={form.maxAge} onChange={(e) => updateForm({ maxAge: e.target.value })} /></div>
                  <div><Label>Max Mileage (km)</Label><Input type="number" value={form.maxMileage} onChange={(e) => updateForm({ maxMileage: e.target.value })} /></div>
                </div>
                <div><Label>Eligible Vehicle Types</Label><Input value={form.vehicleTypes} onChange={(e) => updateForm({ vehicleTypes: e.target.value })} /><p className="text-xs text-muted-foreground mt-1">Comma-separated</p></div>
                <div><Label>Premium Makes (surcharge applies)</Label><Input value={form.premiumMakes} onChange={(e) => updateForm({ premiumMakes: e.target.value })} /><p className="text-xs text-muted-foreground mt-1">Comma-separated</p></div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Coverage */}
          <TabsContent value="coverage">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Coverage Details</CardTitle>
                  <Button size="sm" variant="outline" onClick={addCoverageCategory}><Plus className="w-3.5 h-3.5 mr-1" /> Add Category</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {form.coverageCategories.map((cat, catIdx) => (
                  <div key={catIdx} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Input value={cat.name} onChange={(e) => updateCategory(catIdx, { name: e.target.value })} placeholder="Category name" className="font-semibold max-w-xs" />
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeCoverageCategory(catIdx)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                    <div className="space-y-2">
                      {cat.parts.map((part, partIdx) => (
                        <div key={partIdx} className="flex items-center gap-2">
                          <Input value={part} onChange={(e) => updatePart(catIdx, partIdx, e.target.value)} placeholder="Covered part..." className="flex-1" />
                          <Button size="sm" variant="ghost" className="text-destructive shrink-0" onClick={() => removePart(catIdx, partIdx)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => addPartToCategory(catIdx)} className="text-xs"><Plus className="w-3 h-3 mr-1" /> Add Part</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pricing */}
          <TabsContent value="pricing">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Pricing & Tiers</CardTitle>
                  <Button size="sm" variant="outline" onClick={addPricingRow}><Plus className="w-3.5 h-3.5 mr-1" /> Add Tier</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div><Label>Deductible ($)</Label><Input type="number" value={form.deductible} onChange={(e) => updateForm({ deductible: e.target.value })} /></div>
                  <div><Label>Per-Claim Maximum ($)</Label><Input type="number" value={form.perClaim} onChange={(e) => updateForm({ perClaim: e.target.value })} placeholder="Leave blank for unlimited" /></div>
                  <div><Label>Eligibility Label</Label><Input value={form.eligibilityLabel} onChange={(e) => updateForm({ eligibilityLabel: e.target.value })} placeholder="e.g., Any Year..." /></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Term</th>
                        <th className="text-left p-3 font-medium">Mileage</th>
                        <th className="text-left p-3 font-medium">Vehicle Class</th>
                        <th className="text-right p-3 font-medium">Dealer Cost</th>
                        <th className="text-right p-3 font-medium">Suggested Retail</th>
                        <th className="text-right p-3 font-medium">Margin</th>
                        <th className="p-3 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {form.pricingRows.map((row, i) => {
                        const margin = row.suggestedRetail > 0 ? ((row.suggestedRetail - row.dealerCost) / row.suggestedRetail * 100).toFixed(1) : "0";
                        return (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="p-2"><Input value={row.term} onChange={(e) => updatePricingRow(i, { term: e.target.value })} className="h-9" /></td>
                            <td className="p-2"><Input value={row.mileageBracket} onChange={(e) => updatePricingRow(i, { mileageBracket: e.target.value })} className="h-9" /></td>
                            <td className="p-2"><Input value={row.vehicleClass} onChange={(e) => updatePricingRow(i, { vehicleClass: e.target.value })} className="h-9" /></td>
                            <td className="p-2"><Input type="number" value={row.dealerCost} onChange={(e) => updatePricingRow(i, { dealerCost: Number(e.target.value) })} className="h-9 text-right" /></td>
                            <td className="p-2"><Input type="number" value={row.suggestedRetail} onChange={(e) => updatePricingRow(i, { suggestedRetail: Number(e.target.value) })} className="h-9 text-right" /></td>
                            <td className="p-2 text-right"><Badge variant="secondary" className="text-xs">{margin}%</Badge></td>
                            <td className="p-2"><Button size="sm" variant="ghost" className="text-destructive" onClick={() => removePricingRow(i)}><Trash2 className="w-3 h-3" /></Button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Benefits */}
          <TabsContent value="benefits">
            <Card>
              <CardHeader><CardTitle>Included Benefits</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {form.benefits.map((benefit, i) => (
                    <div key={i} className={cn("flex items-center gap-3 rounded-lg border p-4 transition-colors", benefit.included ? "bg-primary/5 border-primary/20" : "bg-muted/30")}>
                      <Switch checked={benefit.included} onCheckedChange={() => toggleBenefit(i)} />
                      <Input value={benefit.name} onChange={(e) => updateBenefitName(i, e.target.value)} placeholder="Benefit name" className={cn("flex-1 text-sm font-medium", !benefit.included && "text-muted-foreground")} onClick={(e) => e.stopPropagation()} />
                      <Button size="sm" variant="ghost" className="text-destructive shrink-0" onClick={() => removeBenefit(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      {benefit.included && <Badge variant="secondary" className="text-[10px]">Included</Badge>}
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="mt-4" onClick={() => updateForm({ benefits: [...form.benefits, { name: "", included: true }] })}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Benefit
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Terms */}
          <TabsContent value="terms">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Terms & Conditions</CardTitle>
                    <Button size="sm" variant="outline" onClick={addTermsSection}><Plus className="w-3.5 h-3.5 mr-1" /> Add Section</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {form.termsSections.map((section, i) => (
                    <div key={i} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Input value={section.title} onChange={(e) => updateTermsSection(i, { title: e.target.value })} placeholder="Section Title" className="font-semibold max-w-sm" />
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeTermsSection(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                      <Textarea value={section.content} onChange={(e) => updateTermsSection(i, { content: e.target.value })} placeholder="Section content..." className="min-h-[100px]" />
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Additional Terms</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div><Label>General Exclusions</Label><Textarea value={form.exclusions} onChange={(e) => updateForm({ exclusions: e.target.value })} className="min-h-[120px]" /><p className="text-xs text-muted-foreground mt-1">One per line</p></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label>Waiting Period</Label><Input value={form.waitingPeriod} onChange={(e) => updateForm({ waitingPeriod: e.target.value })} /></div>
                    <div><Label>Coverage Territory</Label><Input value={form.coverageTerritory} onChange={(e) => updateForm({ coverageTerritory: e.target.value })} /></div>
                  </div>
                  <div><Label>Dispute Resolution</Label><Textarea value={form.disputeResolution} onChange={(e) => updateForm({ disputeResolution: e.target.value })} className="min-h-[80px]" /></div>
                  <div><Label>Important Notes</Label><Textarea value={form.importantNotes} onChange={(e) => updateForm({ importantNotes: e.target.value })} placeholder="One per line..." className="min-h-[80px]" /></div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Preview */}
          <TabsContent value="preview">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <Badge variant="outline" className="mb-2">{TYPE_LABELS[form.type] || form.type}</Badge>
                      <CardTitle className="text-2xl">{form.name || "Untitled Product"}</CardTitle>
                      {form.group && <p className="text-sm text-muted-foreground mt-1">{form.group}</p>}
                    </div>
                    <Badge variant="secondary">Preview</Badge>
                  </div>
                </CardHeader>
                <CardContent><p className="text-muted-foreground">{form.description || "No description."}</p></CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Eligibility</p><p className="text-sm">{form.eligibilityLabel || `Up to ${form.maxAge}yr / ${Number(form.maxMileage).toLocaleString()}km`}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Deductible</p><p className="text-sm">${form.deductible}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Per Claim</p><p className="text-sm">{form.perClaim ? `$${Number(form.perClaim).toLocaleString()}` : "Unlimited"}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Pricing Tiers</p><p className="text-sm">{form.pricingRows.length} tiers</p></CardContent></Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Pricing ({form.pricingRows.length} tiers)</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/50"><th className="text-left p-2">Term</th><th className="text-left p-2">Class</th><th className="text-right p-2">Dealer Cost</th><th className="text-right p-2">Retail</th></tr></thead>
                      <tbody>
                        {form.pricingRows.map((row, i) => (
                          <tr key={i} className="border-b"><td className="p-2">{row.term}</td><td className="p-2">{row.vehicleClass}</td><td className="p-2 text-right">${row.dealerCost.toLocaleString()}</td><td className="p-2 text-right">${row.suggestedRetail.toLocaleString()}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Benefits</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">{form.benefits.filter(b => b.included).map((b, i) => <Badge key={i} variant="secondary">{b.name}</Badge>)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Coverage Categories</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {form.coverageCategories.map((cat, i) => (
                    <div key={i}><p className="font-semibold text-sm mb-1">{cat.name}</p><div className="flex flex-wrap gap-1">{cat.parts.filter(Boolean).map((p, j) => <Badge key={j} variant="outline" className="text-xs">{p}</Badge>)}</div></div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
