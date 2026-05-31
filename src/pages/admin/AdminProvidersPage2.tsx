import { useCallback, useEffect, useState } from "react";
import { PageShell } from "../../components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { supabase } from "../../integrations/supabase/client";
import { useToast } from "../../hooks/use-toast";
import { invokeEdgeFunction } from "../../lib/supabase/functions";
import { format } from "date-fns";
import { Check, Copy, Plus, Users } from "lucide-react";

interface Provider {
  id: string;
  company_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  regions_served: string[] | null;
  status: string;
  created_at: string;
}

interface ProviderMember {
  id: string;
  user_id: string;
  role: "admin" | "member";
  created_at: string;
  name: string;
  email: string;
}

type CreatedProviderCredentials = {
  email: string;
  temporaryPassword: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
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
  const [providerMembers, setProviderMembers] = useState<ProviderMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [creatingProvider, setCreatingProvider] = useState(false);
  const [creatingMember, setCreatingMember] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedProviderCredentials | null>(null);
  const [newProvider, setNewProvider] = useState({
    companyName: "",
    adminFirstName: "",
    adminLastName: "",
    adminEmail: "",
  });
  const [newMember, setNewMember] = useState({
    fullName: "",
    email: "",
    role: "member",
  });

  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? null;

  const fetchProviders = useCallback(async () => {
    const { data } = await supabase
      .from("providers")
      .select("id, company_name, contact_email, contact_phone, regions_served, status, created_at")
      .order("created_at", { ascending: false });
    setProviders(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  const fetchProviderMembers = useCallback(async (providerId: string) => {
    setMembersLoading(true);
    try {
      const { data, error } = await supabase
        .from("provider_members")
        .select("id, user_id, role, created_at")
        .eq("provider_id", providerId);
      if (error) throw error;

      const memberRows = (data ?? []) as any[];
      const userIds = memberRows.map((m) => m.user_id).filter(Boolean);
      let profileMap: Record<string, any> = {};

      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, display_name, first_name, last_name, email")
          .in("id", userIds);
        if (profilesError) throw profilesError;
        profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));
      }

      setProviderMembers(
        memberRows.map((m) => {
          const profile = profileMap[m.user_id] ?? {};
          const name =
            profile.display_name ||
            [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
            profile.email ||
            "Unknown";

          return {
            id: m.id,
            user_id: m.user_id,
            role: m.role,
            created_at: m.created_at,
            name,
            email: profile.email ?? "",
          };
        }),
      );
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not load provider members.", variant: "destructive" });
      setProviderMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [toast]);

  const handleOpenProviderTeam = (provider: Provider) => {
    setSelectedProviderId(provider.id);
    void fetchProviderMembers(provider.id);
  };

  const handleCreateProviderAccount = async () => {
    const companyName = newProvider.companyName.trim();
    const firstName = newProvider.adminFirstName.trim();
    const lastName = newProvider.adminLastName.trim();
    const email = normalizeEmail(newProvider.adminEmail);

    if (!companyName || !firstName || !lastName || !email) {
      toast({ title: "Missing details", description: "Company name and admin contact are required.", variant: "destructive" });
      return;
    }

    setCreatingProvider(true);
    try {
      const response = await invokeEdgeFunction<{ providerId: string; userId: string; temporaryPassword: string }>(
        "company-access-tools",
        {
          action: "create_provider_account",
          provider: {
            companyName,
            contactEmail: email,
            status: "approved",
          },
          member: {
            firstName,
            lastName,
            email,
            phone: undefined,
            role: "admin",
          },
        },
      );

      setCreatedCredentials({ email, temporaryPassword: response.temporaryPassword });
      setPasswordCopied(false);
      setNewProvider({ companyName: "", adminFirstName: "", adminLastName: "", adminEmail: "" });
      setCreateDialogOpen(false);
      toast({ title: "Provider Created", description: `${companyName} can now sign in with the temporary password.` });
      await fetchProviders();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not create provider account.", variant: "destructive" });
    } finally {
      setCreatingProvider(false);
    }
  };

  const handleCreateProviderMember = async () => {
    if (!selectedProvider) return;
    const { firstName, lastName } = splitFullName(newMember.fullName);
    const email = normalizeEmail(newMember.email);

    if (!firstName || !lastName || !email) {
      toast({ title: "Missing details", description: "Full name and email are required.", variant: "destructive" });
      return;
    }

    setCreatingMember(true);
    try {
      const response = await invokeEdgeFunction<{ providerMemberId?: string | null; userId: string; temporaryPassword: string }>(
        "company-access-tools",
        {
          action: "create_company_member",
          companyType: "provider",
          companyId: selectedProvider.id,
          member: {
            firstName,
            lastName,
            email,
            phone: undefined,
            role: newMember.role,
          },
        },
      );

      setCreatedCredentials({ email, temporaryPassword: response.temporaryPassword });
      setPasswordCopied(false);
      setNewMember({ fullName: "", email: "", role: "member" });
      setMemberDialogOpen(false);
      toast({ title: "Member Added", description: `${email} can now sign in with the temporary password.` });
      await fetchProviderMembers(selectedProvider.id);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not create provider member.", variant: "destructive" });
    } finally {
      setCreatingMember(false);
    }
  };

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
    <>
      <PageShell
        title="Providers"
        subtitle="Create provider companies and initial provider admin accounts"
        badge="Admin"
      >
      <Card className="rounded-2xl bg-card/80 backdrop-blur-sm shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">All Providers</CardTitle>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Create Provider Account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Provider Account</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="provider-company-name">Company Name</Label>
                  <Input
                    id="provider-company-name"
                    value={newProvider.companyName}
                    onChange={(e) => setNewProvider((prev) => ({ ...prev, companyName: e.target.value }))}
                    placeholder="Apex Warranty"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="provider-admin-first-name">Admin First Name</Label>
                    <Input
                      id="provider-admin-first-name"
                      value={newProvider.adminFirstName}
                      onChange={(e) => setNewProvider((prev) => ({ ...prev, adminFirstName: e.target.value }))}
                      placeholder="Pat"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-admin-last-name">Admin Last Name</Label>
                    <Input
                      id="provider-admin-last-name"
                      value={newProvider.adminLastName}
                      onChange={(e) => setNewProvider((prev) => ({ ...prev, adminLastName: e.target.value }))}
                      placeholder="Provider"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider-admin-email">Admin Email</Label>
                  <Input
                    id="provider-admin-email"
                    type="email"
                    value={newProvider.adminEmail}
                    onChange={(e) => setNewProvider((prev) => ({ ...prev, adminEmail: e.target.value }))}
                    placeholder="admin@provider.com"
                  />
                </div>
                <Button className="w-full" onClick={handleCreateProviderAccount} disabled={creatingProvider}>
                  {creatingProvider ? "Creating..." : "Create Account"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={() => handleOpenProviderTeam(p)}
                        >
                          <Users className="h-3.5 w-3.5" />
                          Team
                        </Button>
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

      {selectedProvider ? (
        <Card className="mt-6 rounded-2xl bg-card/80 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Provider Team</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{selectedProvider.company_name}</p>
            </div>
            <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Provider Member</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="provider-member-full-name">Full Name</Label>
                    <Input
                      id="provider-member-full-name"
                      value={newMember.fullName}
                      onChange={(e) => setNewMember((prev) => ({ ...prev, fullName: e.target.value }))}
                      placeholder="Pat Provider"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-member-email">Email</Label>
                    <Input
                      id="provider-member-email"
                      type="email"
                      value={newMember.email}
                      onChange={(e) => setNewMember((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="employee@provider.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-member-role">Role</Label>
                    <select
                      id="provider-member-role"
                      value={newMember.role}
                      onChange={(e) => setNewMember((prev) => ({ ...prev, role: e.target.value }))}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <Button className="w-full" onClick={handleCreateProviderMember} disabled={creatingMember}>
                    {creatingMember ? "Creating..." : "Create Member"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {membersLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : providerMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No provider members found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providerMembers.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.email || "—"}</TableCell>
                      <TableCell className="text-sm capitalize">{m.role}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(m.created_at), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
      </PageShell>

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
          </DialogHeader>
          {createdCredentials && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="text-xs font-medium text-muted-foreground">Provider login</div>
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
    </>
  );
}
