import { useEffect, useState } from "react";
import DashboardLayout, { adminNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { supabase } from "../../integrations/supabase/client";
import { format } from "date-fns";

interface UserWithRole {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { full_name: string | null; phone: string | null };
}

const roleBadgeClass: Record<string, string> = {
  super_admin: "bg-red-100 text-red-700",
  dealership_admin: "bg-primary/10 text-primary",
  dealership_employee: "bg-blue-100 text-blue-700",
  provider: "bg-green-100 text-green-700",
};

function RoleBadge({ role }: { role: string }) {
  const cls = roleBadgeClass[role] ?? "bg-gray-100 text-gray-700";
  const label = role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function AdminUsersPage2() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("id, user_id, role, created_at")
        .order("created_at", { ascending: false });

      if (!roles || roles.length === 0) {
        setLoading(false);
        return;
      }

      const userIds = roles.map((r: any) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", userIds);

      const profileMap: Record<string, any> = {};
      (profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });

      setUsers(
        roles.map((r: any) => ({
          ...r,
          profile: profileMap[r.user_id] ?? { full_name: null, phone: null },
        }))
      );
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <DashboardLayout navItems={adminNavItems} title="Users">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.profile?.full_name ?? <span className="text-muted-foreground italic">Unknown</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.profile?.phone ?? "—"}</TableCell>
                    <TableCell><RoleBadge role={u.role} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(u.created_at), "MMM d, yyyy")}
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
