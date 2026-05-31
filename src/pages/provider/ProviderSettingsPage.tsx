import { useState, useEffect } from "react";
import DashboardLayout, { providerNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useToast } from "../../hooks/use-toast";
import { useAuth } from "../../providers/AuthProvider";
import { supabase } from "../../integrations/supabase/client";
import { Building2, Users, Shield, Plus, Save, UserCog, KeyRound, Trash2, Check, Copy } from "lucide-react";
import { invokeEdgeFunction } from "../../lib/supabase/functions";
import { markTemporaryPasswordEmail } from "../../lib/auth/temporaryPasswordChange";

interface TeamMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
}

type CreatedMemberCredentials = {
  email: string;
  temporaryPassword: string;
};

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
}

function profileDisplayName(profile: any) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.email ||
    "Unknown"
  );
}

export default function ProviderSettingsPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [providerRole, setProviderRole] = useState<"admin" | "member" | null>(null);
  const [company, setCompany] = useState({
    name: "",
    description: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    regions: [] as string[],
  });
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", email: "", role: "member" });
  const [saving, setSaving] = useState(false);
  const [, setLoading] = useState(true);
  const [submittingMember, setSubmittingMember] = useState(false);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedMemberCredentials | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const isProviderAdmin = providerRole === "admin" || (user as any)?.providerRole === "admin";

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Get provider membership
      const { data: membership } = await supabase
        .from("provider_members")
        .select("provider_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!membership) { setLoading(false); return; }
      const pid = (membership as any).provider_id;
      setProviderRole(((membership as any).role ?? "member") as "admin" | "member");
      setProviderId(pid);

      // Load provider company info
      const { data: provider } = await supabase
        .from("providers")
        .select("id, company_name, description, contact_email, contact_phone, address, regions_served")
        .eq("id", pid)
        .maybeSingle();

      if (provider) {
        setCompany({
          name: (provider as any).company_name || "",
          description: (provider as any).description || "",
          contactEmail: (provider as any).contact_email || "",
          contactPhone: (provider as any).contact_phone || "",
          address: (provider as any).address || "",
          regions: Array.isArray((provider as any).regions_served) ? (provider as any).regions_served : [],
        });
      }

      // Load team members
      const { data: members } = await supabase
        .from("provider_members")
        .select("id, user_id, role, created_at")
        .eq("provider_id", pid);

      if (members && members.length > 0) {
        const userIds = members.map((m: any) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, first_name, last_name, email")
          .in("id", userIds);
        const profileMap: Record<string, any> = {};
        (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

        setTeam(members.map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          name: profileDisplayName(profileMap[m.user_id]),
          email: profileMap[m.user_id]?.email || "",
          role: m.role,
          joinedAt: m.created_at,
        })));
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const handleSaveProfile = async () => {
    if (!providerId || !isProviderAdmin) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("providers")
        .update({
          company_name: company.name,
          description: company.description,
          contact_email: company.contactEmail,
          contact_phone: company.contactPhone,
          address: company.address,
          regions_served: company.regions,
        })
        .eq("id", providerId);
      if (error) throw error;
      toast({ title: "Profile Saved", description: "Company profile has been updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not save profile.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const refreshTeam = async (pid: string) => {
    const { data: updatedMembers } = await supabase.from("provider_members").select("id, user_id, role, created_at").eq("provider_id", pid);
    if (updatedMembers) {
      const userIds = updatedMembers.map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, first_name, last_name, email")
        .in("id", userIds);
      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });
      setTeam(updatedMembers.map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        name: profileDisplayName(profileMap[m.user_id]),
        email: profileMap[m.user_id]?.email || "",
        role: m.role,
        joinedAt: m.created_at,
      })));
    }
  };

  const handleAddMember = async () => {
    if (!providerId || !newMember.email || !isProviderAdmin) return;
    setSubmittingMember(true);
    try {
      const { firstName, lastName } = splitFullName(newMember.name);
      const email = newMember.email.trim().toLowerCase();
      if (!firstName) throw new Error("Full name is required");
      if (!lastName) throw new Error("Please enter first and last name");

      const response = await invokeEdgeFunction<{ userId: string; temporaryPassword: string }>("company-access-tools", {
        action: "create_company_member",
        companyType: "provider",
        companyId: providerId,
        member: {
          firstName,
          lastName,
          email,
          phone: undefined,
          role: newMember.role,
        },
      });

      toast({ title: "Member Added", description: `${email} has been added to the team.` });
      markTemporaryPasswordEmail(email);
      setCreatedCredentials({ email, temporaryPassword: response.temporaryPassword });
      setPasswordCopied(false);
      setDialogOpen(false);
      setNewMember({ name: "", email: "", role: "member" });
      await refreshTeam(providerId);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not add member.", variant: "destructive" });
    } finally {
      setSubmittingMember(false);
    }
  };

  const handleRoleChange = async (memberId: string, _userId: string, role: string) => {
    if (!providerId || !isProviderAdmin) return;
    try {
      await invokeEdgeFunction("company-access-tools", {
        action: "update_company_member_role",
        companyType: "provider",
        companyId: providerId,
        memberId,
        role,
      });
      setTeam((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
      toast({ title: "Role Updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not update role.", variant: "destructive" });
    }
  };

  const handleGenerateTemporaryPassword = async (member: TeamMember) => {
    if (!providerId || !isProviderAdmin) return;
    setResettingPasswordUserId(member.user_id);
    try {
      const response = await invokeEdgeFunction<{ temporaryPassword: string }>("company-access-tools", {
        action: "generate_temporary_password",
        companyType: "provider",
        companyId: providerId,
        userId: member.user_id,
      });
      markTemporaryPasswordEmail(member.email);
      setCreatedCredentials({ email: member.email || member.name, temporaryPassword: response.temporaryPassword });
      setPasswordCopied(false);
      if (member.user_id === user?.id) {
        await refreshUser();
      }
      toast({ title: "Temporary Password Created" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not generate password.", variant: "destructive" });
    } finally {
      setResettingPasswordUserId(null);
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    if (!providerId || !isProviderAdmin) return;
    if (!window.confirm(`Remove ${member.email || member.name} from this provider?`)) return;
    setDeletingUserId(member.user_id);
    try {
      await invokeEdgeFunction("company-access-tools", {
        action: "remove_company_member",
        companyType: "provider",
        companyId: providerId,
        memberId: member.id,
        userId: member.user_id,
      });
      setTeam((prev) => prev.filter((m) => m.id !== member.id));
      toast({ title: "Member Removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not remove member.", variant: "destructive" });
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <DashboardLayout navItems={providerNavItems} title="Settings">
      <div className="max-w-4xl mx-auto">
        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile" className="gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Company Profile
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-1.5">
              <Users className="w-3.5 h-3.5" /> Team
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader><CardTitle>Company Profile</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Company Name</Label>
                    <Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Contact Email</Label>
                    <Input type="email" value={company.contactEmail} onChange={(e) => setCompany({ ...company, contactEmail: e.target.value })} />
                  </div>
                  <div>
                    <Label>Contact Phone</Label>
                    <Input value={company.contactPhone} onChange={(e) => setCompany({ ...company, contactPhone: e.target.value })} />
                  </div>
                  <div>
                    <Label>Address</Label>
                    <Input value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={company.description} onChange={(e) => setCompany({ ...company, description: e.target.value })} className="min-h-[100px]" />
                </div>
                <div>
                  <Label>Regions Served</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {company.regions.map((r, i) => (
                      <Badge key={i} variant="secondary">{r}</Badge>
                    ))}
                    {isProviderAdmin && (
                      <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => {
                        const region = prompt("Enter region name:");
                        if (region) setCompany({ ...company, regions: [...company.regions, region] });
                      }}>
                        <Plus className="w-3 h-3 mr-1" /> Add
                      </Badge>
                    )}
                  </div>
                </div>
                <Button onClick={handleSaveProfile} disabled={saving || !isProviderAdmin}>
                  <Save className="w-4 h-4 mr-1" />
                  {saving ? "Saving..." : "Save Profile"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team">
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Users className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">{team.length}</p>
                      <p className="text-xs text-muted-foreground">Total Members</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Shield className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="text-2xl font-bold">{team.filter((m) => m.role === "admin").length}</p>
                      <p className="text-xs text-muted-foreground">Admins</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <UserCog className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold">{team.filter((m) => m.role === "member").length}</p>
                      <p className="text-xs text-muted-foreground">Members</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Team Members</CardTitle>
                  {isProviderAdmin && (
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Member</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
                        <div className="space-y-4 mt-2">
                          <div>
                            <Label>Full Name</Label>
                            <Input value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} placeholder="John Doe" />
                          </div>
                          <div>
                            <Label>Email</Label>
                            <Input value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} placeholder="john@company.com" />
                          </div>
                          <div>
                            <Label>Role</Label>
                            <Select value={newMember.role} onValueChange={(v) => setNewMember({ ...newMember, role: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button className="w-full" onClick={handleAddMember} disabled={submittingMember || !newMember.email}>
                            {submittingMember ? "Creating..." : "Create Member"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Joined</TableHead>
                        {isProviderAdmin && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {team.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-bold text-primary">{m.name.charAt(0)}</span>
                              </div>
                              {m.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                          <TableCell>
                            <Badge variant={m.role === "admin" ? "default" : "secondary"} className="capitalize">{m.role}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{m.joinedAt}</TableCell>
                          {isProviderAdmin && (
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1"
                                  disabled={resettingPasswordUserId === m.user_id}
                                  onClick={() => handleGenerateTemporaryPassword(m)}
                                >
                                  <KeyRound className="h-3.5 w-3.5" />
                                  Password
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1 text-destructive hover:text-destructive"
                                  disabled={deletingUserId === m.user_id}
                                  onClick={() => handleRemoveMember(m)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Remove
                                </Button>
                                <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, m.user_id, v)}>
                                  <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="member">Member</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

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
            <DialogHeader><DialogTitle>Temporary password created</DialogTitle></DialogHeader>
            {createdCredentials && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <div className="text-xs font-medium text-muted-foreground">Member</div>
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
