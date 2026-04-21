import { useEffect, useState } from "react";
import DashboardLayout, { providerNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Link } from "react-router-dom";
import {
  Package, FileText, DollarSign, TrendingUp, Plus, Building2, BarChart3,
} from "lucide-react";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "../../components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import { useAuth } from "../../providers/AuthProvider";
import { supabase } from "../../integrations/supabase/client";

export default function ProviderOverviewPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    activeProducts: 0,
    totalContracts: 0,
    revenue: 0,
    activeDealerships: 0,
    pendingRemittances: 0,
    avgPerContract: 0,
  });
  const [chartData, setChartData] = useState<{ month: string; contracts: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      try {
        const { data: membership } = await supabase
          .from("provider_members")
          .select("provider_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (!membership) { setLoading(false); return; }
        const providerEntityId = (membership as any).provider_id;

        const { data: products } = await supabase
          .from("products")
          .select("id, name, status, published")
          .eq("provider_entity_id", providerEntityId);

        const activeProducts = (products || []).filter((p: any) => p.published || p.status === "active").length;
        const productIds = (products || []).map((p: any) => p.id);

        let totalContracts = 0;
        let revenue = 0;
        let contractsByMonth: Record<string, number> = {};
        let prodCount: Record<string, number> = {};
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
          contractsByMonth[key] = 0;
        }

        if (productIds.length > 0) {
          const { data: contracts } = await supabase
            .from("contracts")
            .select("id, product_id, contract_price, status_new, status, created_at")
            .in("product_id", productIds);

          if (contracts && contracts.length > 0) {
            totalContracts = contracts.length;
            revenue = contracts.reduce((s: number, c: any) => s + (Number(c.contract_price) || 0), 0);
            (contracts as any[]).forEach((c: any) => {
              const d = new Date(c.created_at);
              const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
              if (key in contractsByMonth) contractsByMonth[key]++;
              if (c.product_id) prodCount[c.product_id] = (prodCount[c.product_id] || 0) + 1;
            });

            if (Object.keys(prodCount).length > 0) {
              const { data: prods } = await supabase.from("products").select("id, name").in("id", Object.keys(prodCount));
              const tp = (prods || []).map((p: any) => ({ name: p.name, count: prodCount[p.id] || 0 })).sort((a: any, b: any) => b.count - a.count).slice(0, 5);
              if (tp.length > 0) setTopProducts(tp);
            }
          }
        }

        const { data: rems } = await supabase.from("remittances").select("id, status").in("status", ["pending", "submitted"]);
        const pendingRemittances = rems?.length || 0;

        const { data: dealContracts } = await supabase
          .from("contracts")
          .select("dealership_id")
          .in("product_id", productIds.length > 0 ? productIds : ["__none__"]);
        const activeDealerships = new Set((dealContracts || []).map((c: any) => c.dealership_id).filter(Boolean)).size;

        setChartData(Object.entries(contractsByMonth).map(([month, contracts]) => ({ month, contracts })));
        setStats({
          activeProducts,
          totalContracts,
          revenue,
          activeDealerships,
          pendingRemittances,
          avgPerContract: totalContracts > 0 ? revenue / totalContracts : 0,
        });
      } catch (e) {
        console.error("Failed to load provider overview data:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const statCards = [
    { label: "Active Products", value: stats.activeProducts, icon: Package, color: "text-primary" },
    { label: "Total Contracts", value: stats.totalContracts, icon: FileText, color: "text-green-500" },
    { label: "Revenue", value: `$${stats.revenue.toLocaleString()}`, icon: DollarSign, color: "text-green-600" },
    { label: "Active Dealerships", value: stats.activeDealerships, icon: Building2, color: "text-amber-500" },
    { label: "Pending Remittances", value: stats.pendingRemittances, icon: DollarSign, color: "text-orange-500" },
    { label: "Avg / Contract", value: `$${stats.avgPerContract}`, icon: BarChart3, color: "text-primary" },
  ];

  const quickActions = [
    { label: "Add New Product", href: "/provider/products/new", icon: Plus },
    { label: "View Products", href: "/provider/products", icon: Package },
    { label: "View Contracts", href: "/provider/contracts", icon: FileText },
    { label: "Analytics", href: "/provider/analytics", icon: TrendingUp },
    { label: "Remittances", href: "/provider/remittances", icon: DollarSign },
  ];

  if (loading || !user) {
    return (
      <DashboardLayout navItems={providerNavItems} title="Provider Dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={providerNavItems} title="Provider Dashboard">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statCards.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <p className="text-xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Contracts Sold (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ChartContainer config={{ contracts: { label: "Contracts", color: "hsl(var(--primary))" } }} className="h-[250px]">
                  <BarChart data={chartData}>
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="contracts" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">No contract data yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {quickActions.map((a) => (
                <Button key={a.label} variant="outline" className="w-full justify-start gap-2" asChild>
                  <Link to={a.href}>
                    <a.icon className="w-4 h-4" />
                    {a.label}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Products</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topProducts.length > 0 ? topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{i + 1}</Badge>
                    <span className="text-sm font-medium">{p.name}</span>
                  </div>
                  <Badge>{p.count} sold</Badge>
                </div>
              )) : <p className="text-center text-muted-foreground py-4">No product data yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground py-4">
                {stats.totalContracts > 0 ? `${stats.totalContracts} contracts total` : "No activity yet."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
