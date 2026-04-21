import { useEffect, useState } from "react";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { useDealership } from "../../hooks/useDealership";
import { useAuth } from "../../providers/AuthProvider";
import { supabase } from "../../integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  FileText, Users, DollarSign, TrendingUp, Search, BarChart3,
} from "lucide-react";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "../../components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";

const emptyStats = {
  total: 0, active: 0, draft: 0, submitted: 0,
  revenue: 0, pendingRemittances: 0, avgPerContract: 0,
};

export default function DealershipOverviewPage() {
  const { dealershipId, loading: dLoading } = useDealership();
  const { user } = useAuth();
  const [stats, setStats] = useState(emptyStats);
  const [chartData, setChartData] = useState<{ month: string; contracts: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealershipId) return;

    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, status, status_new, contract_price, dealer_cost_dollars, created_at, product_id")
        .eq("dealership_id", dealershipId);

      if (contracts && contracts.length > 0) {
        const total = contracts.length;
        const activeCount = contracts.reduce((s: number, c: any) => { const n = (c.status_new || c.status || "draft").toLowerCase(); return s + (n === "active" ? 1 : 0); }, 0);
        const draftCount = contracts.reduce((s: number, c: any) => { const n = (c.status_new || c.status || "draft").toLowerCase(); return s + (n === "draft" ? 1 : 0); }, 0);
        const submittedCount = contracts.reduce((s: number, c: any) => { const n = (c.status_new || c.status || "draft").toLowerCase(); return s + (n === "submitted" ? 1 : 0); }, 0);
        const revenue = contracts.reduce((s: number, c: any) => s + (Number(c.contract_price) || Number(c.dealer_cost_dollars) || 0), 0);
        const avgPerContract = total > 0 ? revenue / total : 0;

        setStats({ total, active: activeCount, draft: draftCount, submitted: submittedCount, revenue, pendingRemittances: 0, avgPerContract });

        const months: Record<string, number> = {};
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
          months[key] = 0;
        }
        contracts.forEach((c: any) => {
          const d = new Date(c.created_at);
          const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
          if (key in months) months[key]++;
        });
        setChartData(Object.entries(months).map(([month, contracts]) => ({ month, contracts })));

        const prodCount: Record<string, number> = {};
        contracts.forEach((c: any) => { prodCount[c.product_id] = (prodCount[c.product_id] || 0) + 1; });
        const { data: products } = await supabase.from("products").select("id, name").in("id", Object.keys(prodCount));
        const tp = (products || []).map((p: any) => ({ name: p.name, count: prodCount[p.id] || 0 })).sort((a, b) => b.count - a.count).slice(0, 5);
        if (tp.length > 0) setTopProducts(tp);
      }

      const { data: rems } = await supabase.from("remittances").select("id, status, contract_id").eq("status", "pending");
      setStats((prev) => ({ ...prev, pendingRemittances: rems?.length || prev.pendingRemittances }));
      setLoading(false);
    };
    fetchData();
  }, [dealershipId, user]);

  if (dLoading || loading) {
    return (
      <DashboardLayout navItems={dealershipNavItems} title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  const statCards = [
    { label: "Total Contracts", value: stats.total, icon: FileText, color: "text-primary" },
    { label: "Active", value: stats.active, icon: TrendingUp, color: "text-green-500" },
    { label: "Draft", value: stats.draft, icon: FileText, color: "text-muted-foreground" },
    { label: "Submitted", value: stats.submitted, icon: DollarSign, color: "text-amber-500" },
    { label: "Revenue", value: `$${stats.revenue.toLocaleString()}`, icon: DollarSign, color: "text-green-600" },
    { label: "Pending Remittances", value: stats.pendingRemittances, icon: DollarSign, color: "text-orange-500" },
    { label: "Avg / Contract", value: `$${stats.avgPerContract.toFixed(0)}`, icon: BarChart3, color: "text-primary" },
  ];

  const quickActions = [
    { label: "Find Products", href: "/dealership/find-products", icon: Search },
    { label: "View Contracts", href: "/dealership/contracts", icon: FileText },
    { label: "Team", href: "/dealership/settings/team", icon: Users },
    { label: "Remittances", href: "/dealership/remittances", icon: DollarSign },
    { label: "Reporting", href: "/dealership/reporting", icon: BarChart3 },
  ];

  return (
    <DashboardLayout navItems={dealershipNavItems} title="Dashboard">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
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
              <CardTitle className="text-base">Sales Trend (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{ contracts: { label: "Contracts", color: "hsl(var(--primary))" } }} className="h-[250px]">
                <BarChart data={chartData}>
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="contracts" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
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

        {topProducts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{i + 1}</Badge>
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                    <Badge>{p.count} contracts</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
