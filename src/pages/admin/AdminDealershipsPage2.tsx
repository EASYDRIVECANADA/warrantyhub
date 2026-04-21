import { useEffect, useState } from "react";
import DashboardLayout, { adminNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { supabase } from "../../integrations/supabase/client";
import { useToast } from "../../hooks/use-toast";
import { format } from "date-fns";

interface Dealership {
  id: string;
  name: string;
  phone: string | null;
  province: string | null;
  admin_code: string;
  status: string;
  created_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    suspended: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

export default function AdminDealershipsPage2() {
  const { toast } = useToast();
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("dealerships")
        .select("id, name, phone, province, admin_code, status, created_at")
        .order("created_at", { ascending: false });
      setDealerships(data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    const { error } = await supabase.from("dealerships").update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setDealerships((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
      toast({ title: "Status Updated", description: `Dealership marked as ${status}.` });
    }
    setUpdating(null);
  };

  return (
    <DashboardLayout navItems={adminNavItems} title="Dealerships">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Dealerships</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : dealerships.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No dealerships found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Province</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Admin Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dealerships.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.province ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.phone ?? "—"}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{d.admin_code}</code>
                    </TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(d.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {d.status !== "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                            disabled={updating === d.id}
                            onClick={() => updateStatus(d.id, "approved")}
                          >
                            Approve
                          </Button>
                        )}
                        {d.status !== "suspended" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                            disabled={updating === d.id}
                            onClick={() => updateStatus(d.id, "suspended")}
                          >
                            Suspend
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
