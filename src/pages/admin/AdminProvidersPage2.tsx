import { useEffect, useState } from "react";
import DashboardLayout, { adminNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { supabase } from "../../integrations/supabase/client";
import { useToast } from "../../hooks/use-toast";
import { format } from "date-fns";

interface Provider {
  id: string;
  company_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  regions_served: string[] | null;
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

export default function AdminProvidersPage2() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("providers")
        .select("id, company_name, contact_email, contact_phone, regions_served, status, created_at")
        .order("created_at", { ascending: false });
      setProviders(data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    const { error } = await supabase.from("providers").update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
      toast({ title: "Status Updated", description: `Provider marked as ${status}.` });
    }
    setUpdating(null);
  };

  return (
    <DashboardLayout navItems={adminNavItems} title="Providers">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Providers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No providers found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Regions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.company_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.contact_email ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.contact_phone ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.regions_served?.join(", ") ?? "—"}
                    </TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(p.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {p.status !== "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                            disabled={updating === p.id}
                            onClick={() => updateStatus(p.id, "approved")}
                          >
                            Approve
                          </Button>
                        )}
                        {p.status !== "suspended" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                            disabled={updating === p.id}
                            onClick={() => updateStatus(p.id, "suspended")}
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
