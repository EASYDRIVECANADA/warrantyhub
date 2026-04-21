import { useEffect, useState, useMemo } from "react";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Checkbox } from "../../components/ui/checkbox";
import { supabase } from "../../integrations/supabase/client";
import { useDealership } from "../../hooks/useDealership";
import { format } from "date-fns";
import { Send } from "lucide-react";
import { useToast } from "../../hooks/use-toast";

interface SoldContract {
  id: string;
  customer_first_name: string;
  customer_last_name: string;
  contract_price: number | null;
  dealer_cost_dollars: number | null;
  product_id: string;
  provider_entity_id: string | null;
  created_at: string;
}

interface Remittance {
  id: string;
  amount: number;
  status: string;
  due_date: string;
  paid_date: string | null;
  created_at: string;
  contract_id: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  paid: "bg-green-200 text-green-900 dark:bg-green-900/50 dark:text-green-300",
};

const TABS = ["all", "pending", "submitted", "approved", "paid"];

export default function DealershipRemittancesPage() {
  const { dealershipId, loading: dLoading } = useDealership();
  const { toast } = useToast();
  const [soldContracts, setSoldContracts] = useState<SoldContract[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealershipId) return;

    const fetchData = async () => {
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, customer_first_name, customer_last_name, contract_price, dealer_cost_dollars, product_id, provider_entity_id, created_at")
        .eq("dealership_id", dealershipId)
        .eq("status_new", "submitted");

      const { data: rems } = await supabase
        .from("remittances")
        .select("*")
        .order("created_at", { ascending: false });

      const remittedContractIds = new Set((rems || []).map((r: any) => r.contract_id));
      const unremitted = (contracts || []).filter((c: any) => !remittedContractIds.has(c.id));

      setSoldContracts(unremitted);
      setRemittances((rems || []) as Remittance[]);
      setLoading(false);
    };
    fetchData();
  }, [dealershipId]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const selectedTotal = useMemo(
    () => soldContracts.filter((c) => selected.includes(c.id)).reduce((s, c) => s + (Number(c.dealer_cost_dollars) || 0), 0),
    [selected, soldContracts]
  );

  const filteredRemittances = useMemo(() => {
    if (tab === "all") return remittances;
    return remittances.filter((r) => r.status === tab);
  }, [remittances, tab]);

  const handleSubmitRemittance = async () => {
    if (!dealershipId) return;

    const selectedContracts = soldContracts.filter((c) => selected.includes(c.id));
    const inserts = selectedContracts.map((c) => ({
      contract_id: c.id,
      amount: Number(c.dealer_cost_dollars) || 0,
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      status: "pending",
    }));

    const { error } = await supabase.from("remittances").insert(inserts);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const contractIds = selectedContracts.map((c) => c.id);
      const { error: updateError } = await supabase.from("contracts").update({ status_new: "active", status: "REMITTED" }).in("id", contractIds);
      if (updateError) {
        console.error("Failed to update contract status:", updateError);
      }
      toast({ title: "Submitted", description: `${selected.length} remittance(s) submitted.` });
      setSoldContracts((prev) => prev.filter((c) => !selected.includes(c.id)));
      setSelected([]);
      const { data: rems } = await supabase.from("remittances").select("*").order("created_at", { ascending: false });
      setRemittances((rems || []) as Remittance[]);
    }
  };

  if (dLoading || loading) {
    return (
      <DashboardLayout navItems={dealershipNavItems} title="Remittances">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={dealershipNavItems} title="Remittances">
      <div className="space-y-6">
        {/* Ready to Remit */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Ready to Remit</CardTitle>
              {selected.length > 0 && (
                <Button size="sm" onClick={handleSubmitRemittance}>
                  <Send className="w-4 h-4 mr-1" />
                  Submit {selected.length} — ${selectedTotal.toLocaleString()}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {soldContracts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No contracts ready for remittance.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Customer</TableHead>
                    <TableHead>Contract Price</TableHead>
                    <TableHead>Dealer Cost</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soldContracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                      </TableCell>
                      <TableCell className="font-medium">{c.customer_first_name} {c.customer_last_name}</TableCell>
                      <TableCell>${Number(c.contract_price || 0).toLocaleString()}</TableCell>
                      <TableCell>${Number(c.dealer_cost_dollars || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(c.created_at), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Remittance History */}
        <Card>
          <Tabs value={tab} onValueChange={setTab}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Remittance History</CardTitle>
                <TabsList>
                  {TABS.map((t) => (
                    <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </CardHeader>
            <CardContent>
              {filteredRemittances.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No remittances found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Paid Date</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRemittances.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">${r.amount.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[r.status] || ""} variant="secondary">{r.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{format(new Date(r.due_date), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-sm">{r.paid_date ? format(new Date(r.paid_date), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
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
