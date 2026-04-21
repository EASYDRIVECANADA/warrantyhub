import { useState, useEffect, useMemo } from "react";
import DashboardLayout, { providerNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Search, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "../../integrations/supabase/client";

interface Contract {
  id: string;
  dealershipName: string;
  customerFirstName: string;
  customerLastName: string;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  productName: string;
  status: string;
  contractPrice: number | null;
  dealerCost: number | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-destructive/10 text-destructive",
};

const TABS = ["all", "active", "submitted", "expired", "cancelled"];

export default function ProviderContractsPage2() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Resolve my provider entity id
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from("provider_members")
        .select("provider_id")
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle();

      if (!membership) { setLoading(false); return; }

      const providerEntityId = (membership as any).provider_id;

      // Fetch contracts for this provider
      const { data: rows } = await supabase
        .from("contracts")
        .select("id, customer_first_name, customer_last_name, vehicle_year, vehicle_make, vehicle_model, contract_price, dealer_cost_dollars, status_new, created_at, product_id, dealership_id")
        .eq("provider_entity_id", providerEntityId)
        .order("created_at", { ascending: false });

      if (!rows || rows.length === 0) { setLoading(false); return; }

      // Resolve product names
      const productIds = [...new Set(rows.map((r: any) => r.product_id).filter(Boolean))];
      const dealershipIds = [...new Set(rows.map((r: any) => r.dealership_id).filter(Boolean))];

      const [prodRes, dealRes] = await Promise.all([
        productIds.length ? supabase.from("products").select("id, name").in("id", productIds) : Promise.resolve({ data: [] }),
        dealershipIds.length ? supabase.from("dealerships").select("id, name").in("id", dealershipIds) : Promise.resolve({ data: [] }),
      ]);

      const prodMap: Record<string, string> = {};
      ((prodRes.data as any[]) || []).forEach((p) => { prodMap[p.id] = p.name; });
      const dealMap: Record<string, string> = {};
      ((dealRes.data as any[]) || []).forEach((d) => { dealMap[d.id] = d.name; });

      const legacyMap: Record<string, string> = { DRAFT: "draft", SOLD: "submitted", REMITTED: "active", PAID: "active" };

      setContracts(rows.map((r: any) => ({
        id: r.id,
        dealershipName: dealMap[r.dealership_id] || "Unknown Dealership",
        customerFirstName: r.customer_first_name || "",
        customerLastName: r.customer_last_name || "",
        vehicleYear: r.vehicle_year,
        vehicleMake: r.vehicle_make,
        vehicleModel: r.vehicle_model,
        productName: prodMap[r.product_id] || "—",
        status: r.status_new || legacyMap[r.status] || "draft",
        contractPrice: r.contract_price != null ? Number(r.contract_price) : null,
        dealerCost: r.dealer_cost_dollars != null ? Number(r.dealer_cost_dollars) : null,
        createdAt: r.created_at,
      })));
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = contracts;
    if (tab !== "all") list = list.filter((c) => c.status === tab);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (c) =>
          `${c.customerFirstName} ${c.customerLastName}`.toLowerCase().includes(s) ||
          c.dealershipName.toLowerCase().includes(s) ||
          c.productName.toLowerCase().includes(s) ||
          `${c.vehicleYear} ${c.vehicleMake} ${c.vehicleModel}`.toLowerCase().includes(s)
      );
    }
    return list;
  }, [tab, search, contracts]);

  return (
    <DashboardLayout navItems={providerNavItems} title="Contracts">
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by customer, dealership, product..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Card>
          <Tabs value={tab} onValueChange={setTab}>
            <CardHeader className="pb-3">
              <TabsList>
                {TABS.map((t) => (
                  <TabsTrigger key={t} value={t} className="capitalize">
                    {t} ({t === "all" ? contracts.length : contracts.filter((c) => c.status === t).length})
                  </TabsTrigger>
                ))}
              </TabsList>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No contracts found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dealership</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Contract Price</TableHead>
                      <TableHead>Your Revenue</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.dealershipName}</TableCell>
                        <TableCell>{c.customerFirstName} {c.customerLastName}</TableCell>
                        <TableCell className="text-sm">{[c.vehicleYear, c.vehicleMake, c.vehicleModel].filter(Boolean).join(" ") || "—"}</TableCell>
                        <TableCell className="text-sm">{c.productName}</TableCell>
                        <TableCell>{c.contractPrice != null ? `$${c.contractPrice.toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="font-medium text-green-600">{c.dealerCost != null ? `$${c.dealerCost.toLocaleString()}` : "—"}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[c.status] || ""} variant="secondary">{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(c.createdAt), "MMM d, yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </DashboardLayout>
  );
}
