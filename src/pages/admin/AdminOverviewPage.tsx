import { useEffect, useState } from "react";
import DashboardLayout, { adminNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent } from "../../components/ui/card";
import { supabase } from "../../integrations/supabase/client";
import { Building2, Shield, FileText, Clock, AlertCircle } from "lucide-react";

interface Stats {
  totalDealerships: number;
  totalProviders: number;
  totalContracts: number;
  pendingDealerships: number;
  pendingProviders: number;
}

const statCards = [
  { key: "totalDealerships", label: "Total Dealerships", icon: Building2, color: "text-primary" },
  { key: "totalProviders", label: "Total Providers", icon: Shield, color: "text-green-500" },
  { key: "totalContracts", label: "Total Contracts", icon: FileText, color: "text-blue-500" },
  { key: "pendingDealerships", label: "Pending Dealerships", icon: Clock, color: "text-amber-500" },
  { key: "pendingProviders", label: "Pending Providers", icon: AlertCircle, color: "text-orange-500" },
] as const;

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats>({
    totalDealerships: 0,
    totalProviders: 0,
    totalContracts: 0,
    pendingDealerships: 0,
    pendingProviders: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [dealerships, providers, contracts, pendingD, pendingP] = await Promise.all([
        supabase.from("dealerships").select("id", { count: "exact", head: true }),
        supabase.from("providers").select("id", { count: "exact", head: true }),
        supabase.from("contracts").select("id", { count: "exact", head: true }),
        supabase.from("dealerships").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("providers").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);

      setStats({
        totalDealerships: dealerships.count ?? 0,
        totalProviders: providers.count ?? 0,
        totalContracts: contracts.count ?? 0,
        pendingDealerships: pendingD.count ?? 0,
        pendingProviders: pendingP.count ?? 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, []);

  return (
    <DashboardLayout navItems={adminNavItems} title="Overview">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Platform Overview</h2>
          <p className="text-sm text-muted-foreground">System-wide statistics at a glance</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            {statCards.map(({ key, label, icon: Icon, color }) => (
              <Card key={key}>
                <CardContent className="p-5 flex items-center gap-3">
                  <Icon className={`w-6 h-6 flex-shrink-0 ${color}`} />
                  <div>
                    <p className="text-2xl font-bold">{stats[key]}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
