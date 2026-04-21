import { useState, useEffect, useMemo } from "react";
import DashboardLayout, { providerNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { DollarSign, TrendingUp, Clock, CheckCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "../../integrations/supabase/client";
import { useToast } from "../../hooks/use-toast";

interface Remittance {
  id: string;
  dealershipName: string;
  amount: number;
  status: string;
  dueDate: string;
  paidDate: string | null;
  createdAt: string;
  contractId: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  paid: "bg-green-200 text-green-900 dark:bg-green-900/50 dark:text-green-300",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const TABS = ["all", "pending", "submitted", "paid", "overdue"];

export default function ProviderRemittancesPage2() {
  const [tab, setTab] = useState("all");
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
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

      // Fetch remittances for contracts belonging to this provider
      const { data: rows } = await supabase
        .from("remittances")
        .select("id, contract_id, amount, status, due_date, paid_date, created_at")
        .order("created_at", { ascending: false });

      if (!rows || rows.length === 0) { setLoading(false); return; }

      // Filter by provider via contracts
      const contractIds = [...new Set(rows.map((r: any) => r.contract_id))];
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, dealership_id, provider_entity_id")
        .in("id", contractIds)
        .eq("provider_entity_id", providerEntityId);

      if (!contracts || contracts.length === 0) { setLoading(false); return; }

      const myContractIds = new Set(contracts.map((c: any) => c.id));
      const dealershipIds = [...new Set(contracts.map((c: any) => c.dealership_id).filter(Boolean))];

      const { data: dealerships } = dealershipIds.length
        ? await supabase.from("dealerships").select("id, name").in("id", dealershipIds)
        : { data: [] };

      const dealMap: Record<string, string> = {};
      (dealerships || []).forEach((d: any) => { dealMap[d.id] = d.name; });

      const contractDealMap: Record<string, string> = {};
      contracts.forEach((c: any) => { contractDealMap[c.id] = dealMap[c.dealership_id] || "Unknown"; });

      const myRows = rows.filter((r: any) => myContractIds.has(r.contract_id));

      if (myRows.length === 0) { setLoading(false); return; }

      setRemittances(myRows.map((r: any) => ({
        id: r.id,
        dealershipName: contractDealMap[r.contract_id] || "Unknown Dealership",
        amount: Number(r.amount),
        status: r.status,
        dueDate: r.due_date,
        paidDate: r.paid_date,
        createdAt: r.created_at,
        contractId: r.contract_id,
      })));
      setLoading(false);
    };
    load();
  }, []);

  const { toast } = useToast();
  const [markingId, setMarkingId] = useState<string | null>(null);

  const handleMarkPaid = async (remittanceId: string) => {
    setMarkingId(remittanceId);
    try {
      const { error } = await supabase.from("remittances").update({ status: "paid", paid_date: new Date().toISOString().split("T")[0] }).eq("id", remittanceId);
      if (error) throw error;
      setRemittances((prev) => prev.map((r) => r.id === remittanceId ? { ...r, status: "paid", paidDate: new Date().toISOString().split("T")[0] } : r));
      toast({ title: "Marked as Paid", description: "Remittance has been marked as paid." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not update remittance.", variant: "destructive" });
    } finally {
      setMarkingId(null);
    }
  };

  const filtered = useMemo(() => {
    if (tab === "all") return remittances;
    return remittances.filter((r) => r.status === tab);
  }, [tab, remittances]);

  const totalReceived = remittances.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  const totalPending = remittances.filter((r) => ["pending", "submitted"].includes(r.status)).reduce((s, r) => s + r.amount, 0);
  const totalOverdue = remittances.filter((r) => r.status === "overdue").reduce((s, r) => s + r.amount, 0);

  return (
    <DashboardLayout navItems={providerNavItems} title="Remittances">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Received</p>
                <p className="text-xl font-bold text-green-600">${totalReceived.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold">${totalPending.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className="text-xl font-bold text-red-600">${totalOverdue.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Total Remittances</p>
                <p className="text-xl font-bold">{remittances.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <Tabs value={tab} onValueChange={setTab}>
            <CardHeader className="pb-3">
              <TabsList>
                {TABS.map((t) => (
                  <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
                ))}
              </TabsList>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No remittances found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dealership</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Paid Date</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.dealershipName}</TableCell>
                        <TableCell className="font-medium">${r.amount.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[r.status] || ""} variant="secondary">{r.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{format(new Date(r.dueDate), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-sm">{r.paidDate ? format(new Date(r.paidDate), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(r.createdAt), "MMM d, yyyy")}</TableCell>
                        {(r.status === "pending" || r.status === "submitted") ? (
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => handleMarkPaid(r.id)} disabled={markingId === r.id}>
                              {markingId === r.id ? "Marking…" : "Mark Paid"}
                            </Button>
                          </TableCell>
                        ) : null}
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
