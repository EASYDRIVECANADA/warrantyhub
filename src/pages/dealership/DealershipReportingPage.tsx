import { useEffect, useState } from "react";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { supabase } from "../../integrations/supabase/client";
import { useDealership } from "../../hooks/useDealership";
import { useAuth } from "../../providers/AuthProvider";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "../../components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, LineChart, Line } from "recharts";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(45, 93%, 58%)",
  "hsl(142, 76%, 36%)",
  "hsl(346, 87%, 53%)",
  "hsl(199, 89%, 48%)",
];



export default function DealershipReportingPage() {
  const { dealershipId, loading: dLoading } = useDealership();
  const { user } = useAuth();
  const [monthlyData, setMonthlyData] = useState<{ month: string; revenue: number; count: number }[]>([]);
  const [productData, setProductData] = useState<{ name: string; value: number }[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalContracts, setTotalContracts] = useState(0);
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
        .select("id, status, contract_price, created_at, product_id")
        .eq("dealership_id", dealershipId);

      setTotalContracts(contracts?.length ?? 0);
      const rev = (contracts || []).reduce((s: number, c: any) => s + (Number(c.contract_price) || 0), 0);
      setTotalRevenue(rev);

      if (contracts && contracts.length > 0) {
        const months: Record<string, { revenue: number; count: number }> = {};
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
          months[key] = { revenue: 0, count: 0 };
        }
        contracts.forEach((c: any) => {
          const d = new Date(c.created_at);
          const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
          if (key in months) { months[key].revenue += Number(c.contract_price) || 0; months[key].count++; }
        });
        setMonthlyData(Object.entries(months).map(([month, d]) => ({ month, ...d })));

        const prodCount: Record<string, number> = {};
        contracts.forEach((c: any) => { prodCount[c.product_id] = (prodCount[c.product_id] || 0) + 1; });
        const { data: products } = await supabase.from("products").select("id, name").in("id", Object.keys(prodCount));
        setProductData(
          (products || []).map((p: any) => ({ name: p.name, value: prodCount[p.id] || 0 })).sort((a, b) => b.value - a.value).slice(0, 5)
        );
      }
      setLoading(false);
    };
    fetchData();
  }, [dealershipId, user]);

  if (dLoading || loading) {
    return (
      <DashboardLayout navItems={dealershipNavItems} title="Reporting">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  const avgPerContract = totalContracts > 0 ? totalRevenue / totalContracts : 0;

  return (
    <DashboardLayout navItems={dealershipNavItems} title="Reporting">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Contracts</p><p className="text-2xl font-bold">{totalContracts}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Avg / Contract</p><p className="text-2xl font-bold">${avgPerContract.toFixed(0)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Products Sold</p><p className="text-2xl font-bold">{productData.length}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="revenue">
          <TabsList>
            <TabsTrigger value="revenue">Monthly Revenue</TabsTrigger>
            <TabsTrigger value="volume">Monthly Volume</TabsTrigger>
            <TabsTrigger value="products">By Product</TabsTrigger>
          </TabsList>

          <TabsContent value="revenue">
            <Card>
              <CardContent className="pt-6">
                <ChartContainer config={{ revenue: { label: "Revenue", color: "hsl(var(--primary))" } }} className="h-[300px]">
                  <BarChart data={monthlyData}>
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="volume">
            <Card>
              <CardContent className="pt-6">
                <ChartContainer config={{ count: { label: "Contracts", color: "hsl(var(--primary))" } }} className="h-[300px]">
                  <LineChart data={monthlyData}>
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <Card>
              <CardContent className="pt-6 space-y-3">
                {productData.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                    <Badge variant="secondary">{p.value} sold</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
