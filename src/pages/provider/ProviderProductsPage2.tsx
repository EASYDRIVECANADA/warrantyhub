import { useState, useMemo, useEffect } from "react";
import DashboardLayout, { providerNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, Package, Edit, ToggleLeft, ToggleRight, Sparkles, Copy, Loader2 } from "lucide-react";
import { useToast } from "../../hooks/use-toast";
import { getProductsV2Api } from "../../lib/products/productsV2";
import type { ProductV2 } from "../../lib/products/typesV2";

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

export default function ProviderProductsPage2() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [products, setProducts] = useState<ProductV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloning, setCloning] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const api = getProductsV2Api();

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await api.list();
      setProducts(data);
    } catch (err) {
      console.error("Failed to load products:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProducts(); }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === "all" || p.type === typeFilter;
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [products, search, typeFilter, statusFilter]);

  const handleToggleStatus = async (product: ProductV2) => {
    try {
      const newStatus = product.status === "active" ? "inactive" : "active";
      await api.update(product.id, { status: newStatus });
      await loadProducts();
      toast({ title: newStatus === "active" ? "Product Published" : "Product Unpublished" });
    } catch (err: any) {
      console.error("Toggle status error:", err);
      toast({ title: "Error", description: err?.message || "Failed to update status", variant: "destructive" });
    }
  };

  const handleClone = async (product: ProductV2) => {
    setCloning(product.id);
    try {
      const cloned = await api.create({
        name: `${product.name} (Copy)`,
        type: product.type,
        description: product.description,
        coverageDetails: product.coverageDetails,
        pricing: product.pricing,
        eligibilityRules: product.eligibilityRules,
        benefits: product.benefits,
        termsSections: product.termsSections,
        exclusions: product.exclusions,
      });
      toast({ title: "Product Cloned", description: "A copy has been created as a draft." });
      await loadProducts();
      navigate(`/provider/products/${cloned.id}`);
    } catch {
      toast({ title: "Error", description: "Failed to clone product", variant: "destructive" });
    } finally {
      setCloning(null);
    }
  };

  const tierCount = (p: ProductV2) => p.pricing?.rows?.length ?? 0;

  const getStartingPrice = (p: ProductV2): number => {
    const rows = p.pricing?.rows ?? [];
    let min = Infinity;
    for (const r of rows) {
      if (r.suggestedRetail > 0 && r.suggestedRetail < min) min = r.suggestedRetail;
    }
    return min === Infinity ? 0 : min;
  };

  const coverageCount = (p: ProductV2) => p.coverageDetails?.categories?.length ?? 0;

  return (
    <DashboardLayout navItems={providerNavItems} title="Products">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Your Products</h2>
            <p className="text-sm text-muted-foreground">Manage your warranty plans, tiers, and pricing</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/provider/products/new?ai=true">
                <Sparkles className="w-4 h-4 mr-1" />
                AI Import
              </Link>
            </Button>
            <Button asChild>
              <Link to="/provider/products/new">
                <Plus className="w-4 h-4 mr-1" />
                Add Product
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search products..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="VSC">Vehicle Service Contract</SelectItem>
              <SelectItem value="Tire & Rim">Tire & Rim</SelectItem>
              <SelectItem value="GAP">GAP Insurance</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Products</p><p className="text-2xl font-bold">{products.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active</p><p className="text-2xl font-bold text-green-600">{products.filter(p => p.status === "active").length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Draft</p><p className="text-2xl font-bold text-muted-foreground">{products.filter(p => p.status === "draft").length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">VSC Plans</p><p className="text-2xl font-bold">{products.filter(p => p.type === "VSC").length}</p></CardContent></Card>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((product) => (
              <Card key={product.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-base truncate">{product.name}</h3>
                      <p className="text-xs text-muted-foreground">{TYPE_LABELS[product.type] || product.type}</p>
                    </div>
                    <Badge variant={product.status === "active" ? "default" : "secondary"} className="capitalize ml-2">
                      {product.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center mb-4">
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-lg font-bold">{tierCount(product)}</p>
                      <p className="text-[10px] text-muted-foreground">Pricing Tiers</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-[11px] font-medium">{coverageCount(product)}</p>
                      <p className="text-[10px] text-muted-foreground">Coverage</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      {(() => {
                        const sp = getStartingPrice(product);
                        return sp > 0 ? (
                          <>
                            <p className="text-[11px] font-bold text-primary">${sp.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">Starting From</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[11px] font-medium">&mdash;</p>
                            <p className="text-[10px] text-muted-foreground">Price</p>
                          </>
                        );
                      })()}
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-[11px] font-medium">{new Date(product.updatedAt).toLocaleDateString()}</p>
                      <p className="text-[10px] text-muted-foreground">Updated</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/provider/products/${product.id}`)}>
                      <Edit className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleClone(product)} disabled={cloning === product.id} title="Clone product">
                      {cloning === product.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleToggleStatus(product)}>
                      {product.status === "active" ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filtered.length === 0 && !loading && (
              <div className="col-span-full text-center py-16 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No products found</p>
                <p className="text-sm">Try adjusting your filters or add a new product.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
