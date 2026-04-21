import { useEffect, useState } from "react";
import DashboardLayout, { providerNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "../../components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, LineChart, Line } from "recharts";
import { Loader2 } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../providers/AuthProvider";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(45, 93%, 58%)",
  "hsl(142, 76%, 36%)",
  "hsl(346, 87%, 53%)",
  "hsl(199, 89%, 48%)",
  "hsl(262, 83%, 58%)",
];

interface MonthlyEntry { month: string; revenue: number; contracts: number; }
interface ProductEntry { name: string; value: number; revenue: number; }
interface DealerEntry { name: string; contracts: number; revenue: number; }

export default function ProviderAnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<MonthlyEntry[]>([]);
  const [productMix, setProductMix] = useState<ProductEntry[]>([]);
  const [dealerPerf, setDealerPerf] = useState<DealerEntry[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalContracts, setTotalContracts] = useState(0);
  const [activeDealerships, setActiveDealerships] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // 1. Get provider entity ID
        const { data: membership } = await supabase
          .from("provider_members")
          .select("provider_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (!membership) { setLoading(false); return; }
        const providerEntityId = (membership as any).provider_id;

        // 2. Get all products for this provider
        const { data: products } = await supabase
          .from("products")
          .select("id, name")
          .eq("provider_entity_id", providerEntityId);

        const productIds = (products || []).map((p: any) => p.id);
        const productNames: Record<string, string> = {};
        (products || []).forEach((p: any) => { productNames[p.id] = p.name; });

        if (productIds.length === 0) { setLoading(false); return; }

        // 3. Get all contracts for those products
        const { data: contracts } = await supabase
          .from("contracts")
          .select("id, product_id, dealership_id, contract_price, created_at")
          .in("product_id", productIds);

        const rows = contracts || [];

        // 4. Summary stats
        const rev = rows.reduce((s, c: any) => s + (Number(c.contract_price) || 0), 0);
        const dealerIds = new Set(rows.map((c: any) => c.dealership_id).filter(Boolean));
        setTotalRevenue(rev);
        setTotalContracts(rows.length);
        setActiveDealerships(dealerIds.size);

        // 5. Monthly data — last 6 months
        const now = new Date();
        const monthBuckets: Record<string, { revenue: number; contracts: number }> = {};
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = d.toLocaleString("default", { month: "short" }) + " '" + String(d.getFullYear()).slice(2);
          monthBuckets[key] = { revenue: 0, contracts: 0 };
        }
        rows.forEach((c: any) => {
          const d = new Date(c.created_at);
          const key = d.toLocaleString("default", { month: "short" }) + " '" + String(d.getFullYear()).slice(2);
          if (key in monthBuckets) {
            monthBuckets[key].revenue += Number(c.contract_price) || 0;
            monthBuckets[key].contracts += 1;
          }
        });
        setMonthlyData(
          Object.entries(monthBuckets).map(([month, v]) => ({ month, ...v }))
        );

        // 6. Product mix
        const prodCount: Record<string, { count: number; revenue: number }> = {};
        rows.forEach((c: any) => {
          if (!c.product_id) return;
          if (!prodCount[c.product_id]) prodCount[c.product_id] = { count: 0, revenue: 0 };
          prodCount[c.product_id].count += 1;
          prodCount[c.product_id].revenue += Number(c.contract_price) || 0;
        });
        const mix = Object.entries(prodCount)
          .map(([id, v]) => ({ name: productNames[id] || "Unknown", value: v.count, revenue: v.revenue }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 6);
        setProductMix(mix);

        // 7. Dealership performance — load names
        const dealerIdArr = [...dealerIds] as string[];
        const dealerNames: Record<string, string> = {};
        if (dealerIdArr.length > 0) {
          const { data: dealerships } = await supabase
            .from("dealerships")
            .select("id, name")
            .in("id", dealerIdArr);
          (dealerships || []).forEach((d: any) => { dealerNames[d.id] = d.name; });
        }

        const dealerCount: Record<string, { contracts: number; revenue: number }> = {};
        rows.forEach((c: any) => {
          if (!c.dealership_id) return;
          if (!dealerCount[c.dealership_id]) dealerCount[c.dealership_id] = { contracts: 0, revenue: 0 };
          dealerCount[c.dealership_id].contracts += 1;
          dealerCount[c.dealership_id].revenue += Number(c.contract_price) || 0;
        });
        const perf = Object.entries(dealerCount)
          .map(([id, v]) => ({ name: dealerNames[id] || "Dealership", ...v }))
          .sort((a, b) => b.contracts - a.contracts)
          .slice(0, 8);
        setDealerPerf(perf);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const avgPerContract = totalContracts > 0 ? Math.round(totalRevenue / totalContracts) : 0;

  if (loading) {
    return (
      <DashboardLayout navItems={providerNavItems} title="Analytics">
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}><CardContent className="p-4 flex items-center justify-center h-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={providerNavItems} title="Analytics">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Contracts</p><p className="text-2xl font-bold">{totalContracts}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Avg / Contract</p><p className="text-2xl font-bold">${avgPerContract.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active Dealerships</p><p className="text-2xl font-bold">{activeDealerships}</p></CardContent></Card>
        </div>

        {totalContracts === 0 ? (
          <Card>
            <CardContent className="p-16 text-center">
              <p className="text-muted-foreground font-medium">No contract data yet</p>
              <p className="text-sm text-muted-foreground mt-1">Charts will appear once dealerships start creating contracts for your products.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="revenue">
            <TabsList>
              <TabsTrigger value="revenue">Revenue Trend</TabsTrigger>
              <TabsTrigger value="volume">Contract Volume</TabsTrigger>
              <TabsTrigger value="products">Product Mix</TabsTrigger>
              <TabsTrigger value="dealerships">Dealership Performance</TabsTrigger>
            </TabsList>

            <TabsContent value="revenue">
              <Card>
                <CardHeader><CardTitle className="text-base">Monthly Revenue (Last 6 Months)</CardTitle></CardHeader>
                <CardContent>
                  <ChartContainer config={{ revenue: { label: "Revenue", color: "hsl(var(--primary))" } }} className="h-[350px]">
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
                <CardHeader><CardTitle className="text-base">Contract Volume (Last 6 Months)</CardTitle></CardHeader>
                <CardContent>
                  <ChartContainer config={{ contracts: { label: "Contracts", color: "hsl(var(--primary))" } }} className="h-[350px]">
                    <LineChart data={monthlyData}>
                      <XAxis dataKey="month" fontSize={12} />
                      <YAxis fontSize={12} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="contracts" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products">
              <div className="grid lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-base">By Volume</CardTitle></CardHeader>
                  <CardContent>
                    {productMix.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">No product data yet.</p>
                    ) : (
                      <ChartContainer config={{ value: { label: "Contracts", color: "hsl(var(--primary))" } }} className="h-[300px]">
                        <BarChart data={productMix} layout="vertical">
                          <XAxis type="number" fontSize={12} />
                          <YAxis type="category" dataKey="name" fontSize={11} width={110} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Revenue by Product</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {productMix.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">No product data yet.</p>
                    ) : productMix.map((p, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-sm font-medium truncate max-w-[140px]">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant="outline">{p.value} sold</Badge>
                          <span className="text-sm font-bold">${p.revenue.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="dealerships">
              <Card>
                <CardHeader><CardTitle className="text-base">Dealership Performance</CardTitle></CardHeader>
                <CardContent>
                  {dealerPerf.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No dealership data yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {dealerPerf.map((d, i) => {
                        const maxContracts = dealerPerf[0].contracts;
                        const pct = maxContracts > 0 ? (d.contracts / maxContracts) * 100 : 0;
                        return (
                          <div key={i} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Badge variant="secondary" className="w-6 h-6 p-0 flex items-center justify-center text-xs shrink-0">{i + 1}</Badge>
                                <span className="text-sm font-medium truncate max-w-[180px]">{d.name}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm shrink-0">
                                <span className="text-muted-foreground">{d.contracts} contracts</span>
                                <span className="font-bold">${d.revenue.toLocaleString()}</span>
                              </div>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
