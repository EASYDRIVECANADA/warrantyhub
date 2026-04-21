import { useEffect, useState, useMemo } from "react";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { supabase } from "../../integrations/supabase/client";
import { useDealership } from "../../hooks/useDealership";
import { useAuth } from "../../providers/AuthProvider";
import { Search, Plus, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

interface Contract {
  id: string;
  customer_first_name: string;
  customer_last_name: string;
  vin: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  status_new: string | null;
  status: string | null;
  contract_price: number | null;
  dealer_cost_dollars: number | null;
  created_at: string;
  product_id: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-destructive/10 text-destructive",
};

const TABS = ["all", "draft", "submitted", "active", "expired", "cancelled"];



export default function DealershipContractsPage() {
  const navigate = useNavigate();
  const { dealershipId, loading: dLoading } = useDealership();
  const { user } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [products, setProducts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealershipId) return;

    const fetchData = async () => {
      const { data } = await supabase
        .from("contracts")
        .select("*")
        .eq("dealership_id", dealershipId)
        .order("created_at", { ascending: false });

      const contractData = (data as Contract[]) || [];
      setContracts(contractData);
      const productIds = [...new Set(contractData.map((c) => c.product_id))];
      if (productIds.length) {
        const { data: prods } = await supabase.from("products").select("id, name").in("id", productIds);
        const map: Record<string, string> = {};
        (prods || []).forEach((p: any) => { map[p.id] = p.name; });
        setProducts(map);
      }
      setLoading(false);
    };
    fetchData();
  }, [dealershipId, user]);

  // Resolve display status — prefer status_new (V2), fall back to legacy status mapping
  const resolveStatus = (c: Contract): string => {
    if (c.status_new) return c.status_new;
    const legacyMap: Record<string, string> = { DRAFT: "draft", SOLD: "submitted", REMITTED: "active", PAID: "active" };
    return legacyMap[c.status ?? ""] ?? "draft";
  };

  const filtered = useMemo(() => {
    let list = contracts;
    if (tab !== "all") list = list.filter((c) => resolveStatus(c) === tab);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.customer_first_name?.toLowerCase().includes(s) ||
          c.customer_last_name?.toLowerCase().includes(s) ||
          c.vin?.toLowerCase().includes(s) ||
          (products[c.product_id] || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [contracts, tab, search, products]);

  const legacyStatusMap: Record<string, string> = { draft: "DRAFT", submitted: "SOLD", active: "REMITTED", cancelled: "DRAFT", expired: "DRAFT" };

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (!user) {
      setContracts((prev) => prev.map((c) => (c.id === id ? { ...c, status_new: newStatus } : c)));
      return;
    }
    await supabase.from("contracts").update({ status_new: newStatus, status: legacyStatusMap[newStatus] ?? "DRAFT" }).eq("id", id);
    setContracts((prev) => prev.map((c) => (c.id === id ? { ...c, status_new: newStatus } : c)));
  };

  if (dLoading) {
    return (
      <DashboardLayout navItems={dealershipNavItems} title="Contracts">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={dealershipNavItems} title="Contracts">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by name, VIN, product..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => navigate("/dealership/contracts/new")}>
            <Plus className="w-4 h-4 mr-1" /> New Contract
          </Button>
        </div>

        <Card>
          <Tabs value={tab} onValueChange={setTab}>
            <CardHeader className="pb-3">
              <TabsList>
                {TABS.map((t) => (
                  <TabsTrigger key={t} value={t} className="capitalize">
                    {t} {t === "all" ? `(${contracts.length})` : `(${contracts.filter((c) => resolveStatus(c) === t).length})`}
                  </TabsTrigger>
                ))}
              </TabsList>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No contracts found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.customer_first_name} {c.customer_last_name}</TableCell>
                        <TableCell>{c.vehicle_year} {c.vehicle_make} {c.vehicle_model}</TableCell>
                        <TableCell className="text-sm">{products[c.product_id] || "—"}</TableCell>
                        <TableCell>${Number(c.contract_price || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[resolveStatus(c)] || ""} variant="secondary">{resolveStatus(c)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(c.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/dealership/contracts/${c.id}`)}>
                              <Eye className="w-3.5 h-3.5 mr-1" /> View
                            </Button>
                            {resolveStatus(c) === "draft" && (
                              <Button size="sm" variant="outline" onClick={() => handleStatusChange(c.id, "submitted")}>Submit</Button>
                            )}
                            {(resolveStatus(c) === "draft" || resolveStatus(c) === "submitted") && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleStatusChange(c.id, "cancelled")}>Cancel</Button>
                            )}
                          </div>
                        </TableCell>
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
