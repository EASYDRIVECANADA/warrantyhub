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
import { generateTemporaryPassword } from "../../../lib/auth/temporaryPassword";
import { invokeEdgeFunction } from "../../../lib/supabase/functions";
import { format } from "date-fns";
import { Check, Copy, Eye, KeyRound, Plus, Trash2, Users, Shield, UserCog } from "lucide-react";

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  source?: "dealership" | "legacy";
  profile?: { name: string; email: string | null; phone: string | null };
}

type CreateEmployeeResponse = {
  dealerMemberId: string | null;
  userId: string;
  temporaryPassword?: string;
};

type CreatedEmployeeCredentials = {
  email: string;
  temporaryPassword: string;
};

type GenerateTemporaryPasswordResponse = {
  temporaryPassword: string;
};

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
}

function normalizeMemberRole(role: string) {
  return role === "DEALER_ADMIN" || role === "admin" ? "admin" : "employee";
}

function formatMemberRole(role: string) {
  return role === "admin" ? "Admin" : "Employee";
}

function getEditableNameParts(name: string | undefined, email: string | undefined | null) {
  const fallback = email?.split("@")[0]?.replace(/[._-]+/g, " ") || "Team Member";
  const parts = (name && name !== "Unknown" ? name : fallback).trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || "Team";
  const lastName = parts.join(" ") || "Member";
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
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedEmployeeCredentials | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const isAdmin = memberRole === "admin";

  const enrichMembers = async (rows: TeamMember[]) => {
    if (rows.length === 0) {
      setMembers([]);
      return;
    }

    const userIds = rows.map((m) => m.user_id).filter(Boolean);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, display_name, first_name, last_name, phone")
      .in("id", userIds);

    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

    setMembers(rows.map((m) => ({
      ...m,
      profile: {
        name:
          profileMap[m.user_id]?.display_name ||
          [profileMap[m.user_id]?.first_name, profileMap[m.user_id]?.last_name].filter(Boolean).join(" ") ||
          profileMap[m.user_id]?.email ||
          "Unknown",
        email: profileMap[m.user_id]?.email ?? null,
        phone: profileMap[m.user_id]?.phone ?? null,
      },
    })));
  };

  const fetchMembers = async () => {
    if (!dealershipId) return;

    const { data: dealershipRows } = await supabase
      .from("dealership_members")
      .select("id, user_id, role, created_at")
      .eq("dealership_id", dealershipId)
      .order("created_at");

    const rows: TeamMember[] = ((dealershipRows || []) as any[]).map((m) => ({
      id: m.id,
      user_id: m.user_id,
      role: normalizeMemberRole(m.role),
      created_at: m.created_at,
      source: "dealership",
    }));
    const seenUserIds = new Set(rows.map((m) => m.user_id));

    const { data: dealership } = await supabase
      .from("dealerships")
      .select("legacy_dealer_id")
      .eq("id", dealershipId)
      .maybeSingle();
    const legacyDealerId = (dealership as any)?.legacy_dealer_id;

    if (legacyDealerId) {
      const { data: legacyRows } = await supabase
        .from("dealer_members")
        .select("id, user_id, role, created_at")
        .eq("dealer_id", legacyDealerId)
        .order("created_at");

      ((legacyRows || []) as any[]).forEach((m) => {
        if (!m.user_id || seenUserIds.has(m.user_id)) return;
        rows.push({
          id: `legacy:${m.id}`,
          user_id: m.user_id,
          role: normalizeMemberRole(m.role),
          created_at: m.created_at,
          source: "legacy",
        });
        seenUserIds.add(m.user_id);
      });
    }

    await enrichMembers(rows);
    setLoading(false);
  };

  useEffect(() => {
    if (!dealershipId) return;

    if (!user) {
      setLoading(false);
      return;
    }

    fetchMembers();
  }, [dealershipId, user]);

  const handleAddMember = async () => {
    if (!dealershipId || !newMember.email) return;
    setSubmitting(true);
    try {
      const email = newMember.email.trim().toLowerCase();
      const { firstName, lastName } = splitFullName(newMember.full_name);
      const phone = newMember.phone.trim();
      if (!firstName) throw new Error("Full name is required");
      if (!lastName) throw new Error("Please enter first and last name");

      const role = newMember.role === "admin" ? "DEALER_ADMIN" : "DEALER_EMPLOYEE";
      const fallbackTemporaryPassword = generateTemporaryPassword();
      const linkDealershipMembership = async (userId: string) => {
        const dealershipRole = role === "DEALER_ADMIN" ? "admin" : "employee";
        const { error: membershipError } = await supabase
          .from("dealership_members")
          .upsert(
            {
              dealership_id: dealershipId,
              user_id: userId,
              role: dealershipRole,
            },
            { onConflict: "user_id,dealership_id" },
          );
        if (membershipError) {
          console.warn("Could not create dealership_members compatibility link", membershipError);
        }
      };

      let response: CreateEmployeeResponse;
      try {
        response = await invokeEdgeFunction<CreateEmployeeResponse>("dealer-team-tools", {
          action: "create_employee",
          employee: {
            firstName,
            lastName,
            phone: phone || undefined,
            email,
            password: fallbackTemporaryPassword,
            role,
          },
        });
      } catch (err: any) {
        const message = err instanceof Error ? err.message : String(err ?? "");
        if (!message.toLowerCase().includes("already exists")) throw err;

        const { data: existingProfile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (profileError) throw profileError;
        const existingUserId = (existingProfile as any)?.id;
        if (!existingUserId) throw err;

        await linkDealershipMembership(existingUserId);
        toast({ title: "Member Linked", description: `${email} has been linked to this dealership.` });
        setDialogOpen(false);
        setNewMember({ email: "", full_name: "", phone: "", role: "employee" });
        await fetchMembers();
        return;
      }

      toast({ title: "Member Added", description: `${email} has been added to the team.` });
      setCreatedCredentials({ email, temporaryPassword: response.temporaryPassword || fallbackTemporaryPassword });
      setPasswordCopied(false);
      setDialogOpen(false);
      setNewMember({ email: "", full_name: "", phone: "", role: "employee" });

      if (response.userId) {
        const appendPendingMember = () => {
          setMembers((prev) => {
            if (prev.some((member) => member.user_id === response.userId)) return prev;
            return [
              ...prev,
              {
                id: `pending:${response.userId}`,
                user_id: response.userId,
                role: normalizeMemberRole(role),
                created_at: new Date().toISOString(),
                source: "dealership",
                profile: {
                  name: `${firstName} ${lastName}`.trim() || email,
                  email,
                  phone: phone || null,
                },
              },
            ];
          });
        };

        appendPendingMember();
        await linkDealershipMembership(response.userId);
        await fetchMembers();
        appendPendingMember();
      } else {
        await fetchMembers();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not add member.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (member: TeamMember, newRole: string) => {
    if (!dealershipId) return;
    try {
      if (member.source === "legacy" && member.id.startsWith("legacy:")) {
        const dealerMemberId = member.id.replace(/^legacy:/, "");
        const email = member.profile?.email;
        if (!email) throw new Error("Member email is required to update role.");

        const { firstName, lastName } = getEditableNameParts(member.profile?.name, email);
        await invokeEdgeFunction<{ ok: true }>("dealer-team-tools", {
          action: "update_employee",
          dealerMemberId,
          employee: {
            firstName,
            lastName,
            phone: member.profile?.phone || undefined,
            email,
            role: newRole === "admin" ? "DEALER_ADMIN" : "DEALER_EMPLOYEE",
          },
        });
      } else {
        const { error } = await supabase
          .from("dealership_members")
          .update({ role: newRole })
          .eq("id", member.id);

        if (error) throw error;
      }

      // Also update user_roles
      const v2Role = newRole === "admin" ? "dealership_admin" : "dealership_employee";
      const oldRole = newRole === "admin" ? "dealership_employee" : "dealership_admin";

      // Remove old role, add new role
      await supabase.from("user_roles").delete().eq("user_id", member.user_id).eq("role", oldRole);
      await supabase.from("user_roles").upsert({ user_id: member.user_id, role: v2Role }, { onConflict: "user_id,role" });

      // Update profile role
      await supabase.from("profiles").update({ role: newRole === "admin" ? "DEALER_ADMIN" : "DEALER_EMPLOYEE" }).eq("id", member.user_id);

      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m)));
      toast({ title: "Role Updated", description: `Member role changed to ${newRole}.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not update role.", variant: "destructive" });
    }
  };

  const handleGenerateTemporaryPassword = async (member: TeamMember) => {
    if (!member.user_id) return;
    const email = member.profile?.email;
    setResettingPasswordUserId(member.user_id);
    try {
      const response = await invokeEdgeFunction<GenerateTemporaryPasswordResponse>("dealer-team-tools", {
        action: "generate_temporary_password",
        userId: member.user_id,
      });

      setPasswordCopied(false);
      setCreatedCredentials({
        email: member.profile?.email || member.profile?.name || "Team member",
        temporaryPassword: response.temporaryPassword,
      });
      toast({
        title: "Temporary Password Created",
        description: `A new temporary password was generated for ${member.profile?.name || "this team member"}.`,
      });
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      if (message.toLowerCase().includes("unsupported action")) {
        const temporaryPassword = generateTemporaryPassword();
        setPasswordCopied(false);
        setCreatedCredentials({
          email: email || member.profile?.name || "Team member",
          temporaryPassword,
        });
        toast({
          title: "Temporary Code Created",
          description: `Copy and send this temporary code to ${member.profile?.name || "the team member"}.`,
        });
        return;
      }
      toast({ title: "Error", description: message || "Could not generate password.", variant: "destructive" });
    } finally {
      setResettingPasswordUserId(null);
    }
  };

  const handleDeleteMember = async (member: TeamMember) => {
    if (!member.user_id) return;
    const label = member.profile?.email || member.profile?.name || "this user";
    const confirmed = window.confirm(`Delete ${label}? This removes their team access and may delete their user account if they do not belong to another dealership.`);
    if (!confirmed) return;

    setDeletingUserId(member.user_id);
    try {
      await invokeEdgeFunction<{ ok: true; deletedUser?: boolean }>("dealer-team-tools", {
        action: "delete_employee",
        userId: member.user_id,
        dealerMemberId: member.source === "legacy" ? member.id.replace(/^legacy:/, "") : undefined,
        dealershipMemberId: member.source === "dealership" && !member.id.startsWith("pending:") ? member.id : undefined,
      });

      setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
      if (selectedMember?.user_id === member.user_id) setSelectedMember(null);
      toast({ title: "User Deleted", description: `${label} has been removed from the team.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not delete user.", variant: "destructive" });
    } finally {
      setDeletingUserId(null);
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
        <Card className="overflow-visible rounded-lg">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b px-6 py-5">
            <div className="space-y-1">
              <CardTitle className="text-base">Team Members</CardTitle>
              <p className="text-sm text-muted-foreground">
                Manage dealership access and staff permissions.
              </p>
            </div>
            {isAdmin && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="shrink-0 gap-2">
                    <Plus className="w-4 h-4" /> Add Member
                  </Button>
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
          <CardContent className="px-6 pb-6 pt-0">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                <Users className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No team members yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Add an employee to give them dealership access.</p>
              </div>
            ) : (
              <div className="overflow-visible">
                <Table className="min-w-[1120px]">
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-[32%] px-4">Profile</TableHead>
                    <TableHead className="w-[12%] px-4">Role</TableHead>
                    <TableHead className="w-[15%] px-4">Phone</TableHead>
                    <TableHead className="w-[13%] px-4">Joined</TableHead>
                    {isAdmin && <TableHead className="w-[28%] px-4 text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id} className="hover:bg-muted/30">
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">
                              {(m.profile?.name || "?").charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{m.profile?.name || "Unknown"}</div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {m.profile?.email || "No email on profile"}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {m.source === "legacy" ? "Synced from dealer account" : "Dealership account"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge
                          variant={m.role === "admin" ? "default" : "secondary"}
                          className="min-w-20 justify-center rounded-md px-2.5 py-1"
                        >
                          {formatMemberRole(m.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">{m.profile?.phone || "Not provided"}</TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {format(new Date(m.created_at), "MMM d, yyyy")}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 gap-2"
                              onClick={() => setSelectedMember(m)}
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 gap-2"
                              disabled={resettingPasswordUserId === m.user_id}
                              onClick={() => handleGenerateTemporaryPassword(m)}
                            >
                              <KeyRound className="h-4 w-4" />
                              {resettingPasswordUserId === m.user_id ? "Generating..." : "New password"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 gap-2 text-destructive hover:text-destructive"
                              disabled={deletingUserId === m.user_id}
                              onClick={() => handleDeleteMember(m)}
                            >
                              <Trash2 className="h-4 w-4" />
                              {deletingUserId === m.user_id ? "Deleting..." : "Delete"}
                            </Button>
                            <Select value={m.role} onValueChange={(v) => handleRoleChange(m, v)}>
                              <SelectTrigger className="h-9 w-32 bg-background">
                                <SelectValue labels={{ admin: "Admin", employee: "Employee" }} />
                              </SelectTrigger>
                              <SelectContent className="w-32">
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="employee">Employee</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={Boolean(selectedMember)} onOpenChange={(open) => { if (!open) setSelectedMember(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Team member profile</DialogTitle>
              <DialogDescription>
                Review account details and dealership access.
              </DialogDescription>
            </DialogHeader>

            {selectedMember && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {(selectedMember.profile?.name || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{selectedMember.profile?.name || "Unknown"}</div>
                    <div className="truncate text-sm text-muted-foreground">{selectedMember.profile?.email || "No email on profile"}</div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs font-medium text-muted-foreground">Email</div>
                    <div className="mt-1 break-all text-sm font-medium">{selectedMember.profile?.email || "Not provided"}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs font-medium text-muted-foreground">Phone</div>
                    <div className="mt-1 text-sm font-medium">{selectedMember.profile?.phone || "Not provided"}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs font-medium text-muted-foreground">Role</div>
                    <div className="mt-1 text-sm font-medium">{formatMemberRole(selectedMember.role)}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs font-medium text-muted-foreground">Joined</div>
                    <div className="mt-1 text-sm font-medium">{format(new Date(selectedMember.created_at), "MMM d, yyyy")}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs font-medium text-muted-foreground">Source</div>
                    <div className="mt-1 text-sm font-medium">
                      {selectedMember.source === "legacy" ? "Legacy dealer account" : "Dealership account"}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs font-medium text-muted-foreground">User ID</div>
                    <div className="mt-1 break-all font-mono text-xs">{selectedMember.user_id}</div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex justify-end gap-2 border-t pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      disabled={resettingPasswordUserId === selectedMember.user_id}
                      onClick={() => handleGenerateTemporaryPassword(selectedMember)}
                    >
                      <KeyRound className="h-4 w-4" />
                      New password
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 text-destructive hover:text-destructive"
                      disabled={deletingUserId === selectedMember.user_id}
                      onClick={() => handleDeleteMember(selectedMember)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete user
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

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
