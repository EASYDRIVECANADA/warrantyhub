import { useEffect, useState } from "react";
import DashboardLayout, { dealershipNavItems } from "../../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../../../components/ui/dialog";
import { supabase } from "../../../integrations/supabase/client";
import { useDealership } from "../../../hooks/useDealership";
import { useAuth } from "../../../providers/AuthProvider";
import { useToast } from "../../../hooks/use-toast";
import { invokeEdgeFunction } from "../../../lib/supabase/functions";
import { format } from "date-fns";
import { Check, Copy, Plus, Users, Shield, UserCog } from "lucide-react";

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { name: string; phone: string | null };
}

type CreateEmployeeResponse = {
  dealerMemberId: string | null;
  userId: string;
  temporaryPassword: string;
};

type CreatedEmployeeCredentials = {
  email: string;
  temporaryPassword: string;
};

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
}

export default function TeamManagementPage() {
  const { dealershipId, memberRole, loading: dLoading } = useDealership();
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newMember, setNewMember] = useState({ email: "", full_name: "", phone: "", role: "employee" });
  const [submitting, setSubmitting] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedEmployeeCredentials | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const isAdmin = memberRole === "admin";

  useEffect(() => {
    if (!dealershipId) return;

    if (!user) {
      setLoading(false);
      return;
    }

    const fetchMembers = async () => {
      const { data } = await supabase
        .from("dealership_members")
        .select("id, user_id, role, created_at")
        .eq("dealership_id", dealershipId)
        .order("created_at");

      if (data && data.length > 0) {
        const userIds = data.map((m: any) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, display_name, first_name, last_name, phone")
          .in("id", userIds);

        const profileMap: Record<string, any> = {};
        (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

        const enriched = data.map((m: any) => ({
          ...m,
          profile: {
            name:
              profileMap[m.user_id]?.display_name ||
              [profileMap[m.user_id]?.first_name, profileMap[m.user_id]?.last_name].filter(Boolean).join(" ") ||
              profileMap[m.user_id]?.email ||
              "Unknown",
            phone: profileMap[m.user_id]?.phone ?? null,
          },
        }));
        setMembers(enriched);
      }
      setLoading(false);
    };
    fetchMembers();
  }, [dealershipId, user]);

  const handleAddMember = async () => {
    if (!dealershipId || !newMember.email) return;
    setSubmitting(true);
    try {
      const email = newMember.email.trim().toLowerCase();
      const { firstName, lastName } = splitFullName(newMember.full_name);
      if (!firstName) throw new Error("Full name is required");
      if (!lastName) throw new Error("Please enter first and last name");

      const role = newMember.role === "admin" ? "DEALER_ADMIN" : "DEALER_EMPLOYEE";
      const response = await invokeEdgeFunction<CreateEmployeeResponse>("dealer-team-tools", {
        action: "create_employee",
        employee: {
          firstName,
          lastName,
          phone: newMember.phone.trim() || undefined,
          email,
          role,
        },
      });

      toast({ title: "Member Added", description: `${email} has been added to the team.` });
      setCreatedCredentials({ email, temporaryPassword: response.temporaryPassword });
      setPasswordCopied(false);
      setDialogOpen(false);
      setNewMember({ email: "", full_name: "", phone: "", role: "employee" });
      // Refresh members list
      const { data: updatedMembers } = await supabase
        .from("dealership_members")
        .select("id, user_id, role, created_at")
        .eq("dealership_id", dealershipId)
        .order("created_at");
      if (updatedMembers) {
        const userIds = updatedMembers.map((m: any) => m.user_id);
        const { data: profiles } = await supabase.from("profiles").select("id, email, display_name, first_name, last_name, phone").in("id", userIds);
        const profileMap: Record<string, any> = {};
        (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });
        setMembers(updatedMembers.map((m: any) => ({
          ...m,
          profile: {
            name:
              profileMap[m.user_id]?.display_name ||
              [profileMap[m.user_id]?.first_name, profileMap[m.user_id]?.last_name].filter(Boolean).join(" ") ||
              profileMap[m.user_id]?.email ||
              "Unknown",
            phone: profileMap[m.user_id]?.phone ?? null,
          },
        })));
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not add member.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (memberId: string, userId: string, newRole: string) => {
    if (!dealershipId) return;
    try {
      const { error } = await supabase
        .from("dealership_members")
        .update({ role: newRole })
        .eq("id", memberId);

      if (error) throw error;

      // Also update user_roles
      const v2Role = newRole === "admin" ? "dealership_admin" : "dealership_employee";
      const oldRole = newRole === "admin" ? "dealership_employee" : "dealership_admin";

      // Remove old role, add new role
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", oldRole);
      await supabase.from("user_roles").upsert({ user_id: userId, role: v2Role }, { onConflict: "user_id,role" });

      // Update profile role
      await supabase.from("profiles").update({ role: newRole === "admin" ? "DEALER_ADMIN" : "DEALER_EMPLOYEE" }).eq("id", userId);

      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));
      toast({ title: "Role Updated", description: `Member role changed to ${newRole}.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not update role.", variant: "destructive" });
    }
  };

  const adminCount = members.filter((m) => m.role === "admin").length;

  if (dLoading) {
    return (
      <DashboardLayout navItems={dealershipNavItems} title="Team Management">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={dealershipNavItems} title="Team Management">
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{members.length}</p>
                <p className="text-xs text-muted-foreground">Total Members</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Shield className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{adminCount}</p>
                <p className="text-xs text-muted-foreground">Admins</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <UserCog className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{members.length - adminCount}</p>
                <p className="text-xs text-muted-foreground">Employees</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Members Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Team Members</CardTitle>
            {isAdmin && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Member</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Team Member</DialogTitle>
                    <DialogDescription>
                      Create a new employee account and generate a temporary password.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div>
                      <Label>Email</Label>
                      <Input value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} placeholder="team@example.com" />
                    </div>
                    <div>
                      <Label>Full Name</Label>
                      <Input value={newMember.full_name} onChange={(e) => setNewMember({ ...newMember, full_name: e.target.value })} placeholder="John Doe" />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={newMember.phone} onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })} placeholder="(555) 123-4567" />
                    </div>
                    <div>
                      <Label>Role</Label>
                      <Select value={newMember.role} onValueChange={(v) => setNewMember({ ...newMember, role: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full" onClick={handleAddMember} disabled={submitting || !newMember.email}>
                      {submitting ? "Creating..." : "Create Employee"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Joined</TableHead>
                    {isAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">
                              {(m.profile?.name || "?").charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium">{m.profile?.name || "Unknown"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.role === "admin" ? "default" : "secondary"} className="capitalize">{m.role}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.profile?.phone || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(m.created_at), "MMM d, yyyy")}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, m.user_id, v)}>
                            <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="employee">Employee</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={Boolean(createdCredentials)}
          onOpenChange={(open) => {
            if (!open) {
              setCreatedCredentials(null);
              setPasswordCopied(false);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Temporary password created</DialogTitle>
              <DialogDescription>
                This password is shown once. Share it securely with the employee.
              </DialogDescription>
            </DialogHeader>

            {createdCredentials && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <div className="text-xs font-medium text-muted-foreground">Employee</div>
                  <div className="mt-1 text-sm font-medium">{createdCredentials.email}</div>
                </div>

                <div className="rounded-lg border bg-muted/40 p-4">
                  <div className="text-xs font-medium text-muted-foreground">Temporary password</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Input readOnly value={createdCredentials.temporaryPassword} className="font-mono" />
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        void navigator.clipboard.writeText(createdCredentials.temporaryPassword).then(() => {
                          setPasswordCopied(true);
                        });
                      }}
                    >
                      {passwordCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {passwordCopied ? "Copied" : "Copy password"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
