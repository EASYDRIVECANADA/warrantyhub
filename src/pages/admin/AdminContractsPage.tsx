import { useEffect, useState } from "react";
import DashboardLayout, { adminNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { supabase } from "../../integrations/supabase/client";
import { format } from "date-fns";

interface Contract {
  id: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  contract_price: number | null;
  status_new: string | null;
  created_at: string;
}

const statusBadgeClass: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-700",
};

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "draft";
  const cls = statusBadgeClass[s] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${cls}`}>
      {s}
    </span>
  );
}

export default function AdminContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, customer_first_name, customer_last_name, vehicle_make, vehicle_model, vehicle_year, contract_price, status_new, created_at")
        .order("created_at", { ascending: false });
      setContracts(data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <DashboardLayout navItems={adminNavItems} title="Contracts">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No contracts found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((c) => {
                  const customerName = [c.customer_first_name, c.customer_last_name].filter(Boolean).join(" ") || "—";
                  const vehicle = [c.vehicle_year, c.vehicle_make, c.vehicle_model].filter(Boolean).join(" ") || "—";
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{customerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{vehicle}</TableCell>
                      <TableCell className="text-sm">
                        {c.contract_price != null
                          ? new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(c.contract_price)
                          : "—"}
                      </TableCell>
                      <TableCell><StatusBadge status={c.status_new} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(c.created_at), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
