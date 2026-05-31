import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../../components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { supabase } from "../../integrations/supabase/client";
import { useToast } from "../../hooks/use-toast";
import { invokeEdgeFunction } from "../../lib/supabase/functions";
import { markTemporaryPasswordEmail } from "../../lib/auth/temporaryPasswordChange";
import { format } from "date-fns";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  Copy,
  KeyRound,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";

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

type TeamFeedback = {
  kind: "success" | "error";
  title: string;
  description?: string;
  email?: string;
  temporaryPassword?: string;
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

function roleBadgeClass(role: string) {
  if (role === "admin") return "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20";
  return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20";
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
  const [creatingProvider, setCreatingProvider] = useState(false);
  const [creatingMember, setCreatingMember] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedProviderCredentials | null>(null);
  const [teamFeedback, setTeamFeedback] = useState<TeamFeedback | null>(null);
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
  const adminCount = providerMembers.filter((m) => m.role === "admin").length;
  const memberCount = providerMembers.filter((m) => m.role !== "admin").length;
  const activeCount = providerMembers.length;
  const regionCount = selectedProvider?.regions_served?.length ?? 0;
  const regionOptions = useMemo(() => {
    return Array.from(
      new Set(
        providers
          .flatMap((p) => p.regions_served ?? [])
          .map((region) => region.trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [providers]);

  const filteredProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers.filter((provider) => {
      const searchable = [
        provider.company_name,
        provider.contact_email ?? "",
        provider.contact_phone ?? "",
        provider.id,
        ...(provider.regions_served ?? []),
      ].join(" ").toLowerCase();
      const matchesSearch = !q || searchable.includes(q);
      const matchesStatus = statusFilter === "all" || provider.status === statusFilter;
      const matchesRegion = regionFilter === "all" || (provider.regions_served ?? []).includes(regionFilter);
      return matchesSearch && matchesStatus && matchesRegion;
    });
  }, [providers, regionFilter, search, statusFilter]);

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

  const upsertVisibleProviderMember = useCallback((member: ProviderMember) => {
    setProviderMembers((prev) => {
      const existingIndex = prev.findIndex((m) => m.id === member.id || m.user_id === member.user_id);
      if (existingIndex === -1) return [member, ...prev];

      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...member };
      return next;
    });
  }, []);

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
    setTeamFeedback(null);
    setSelectedProviderId(provider.id);
    void fetchProviderMembers(provider.id);
  };

  const handleProviderPatch = async (providerId: string, patch: Partial<Pick<Provider, "company_name" | "contact_email" | "contact_phone" | "status">>) => {
    setUpdating(providerId);
    const { error } = await supabase.from("providers").update(patch).eq("id", providerId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setProviders((prev) => prev.map((p) => (p.id === providerId ? { ...p, ...patch } : p)));
      toast({ title: "Provider Updated" });
    }
    setUpdating(null);
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
      const response = await invokeEdgeFunction<{ providerId: string; providerMemberId?: string | null; userId: string; temporaryPassword: string }>(
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

      const createdAt = new Date().toISOString();
      const providerId = response.providerId;
      markTemporaryPasswordEmail(email);
      setCreatedCredentials({ email, temporaryPassword: response.temporaryPassword });
      setPasswordCopied(false);
      setNewProvider({ companyName: "", adminFirstName: "", adminLastName: "", adminEmail: "" });
      setCreateDialogOpen(false);
      setProviders((prev) => [
        {
          id: providerId,
          company_name: companyName,
          contact_email: email,
          contact_phone: null,
          regions_served: [],
          status: "approved",
          created_at: createdAt,
        },
        ...prev.filter((p) => p.id !== providerId),
      ]);
      setProviderMembers([
        {
          id: response.providerMemberId ?? `provider-admin-${response.userId}`,
          user_id: response.userId,
          role: "admin",
          created_at: createdAt,
          name: `${firstName} ${lastName}`.trim(),
          email,
        },
      ]);
      setTeamFeedback({
        kind: "success",
        title: "Temporary password ready",
        description: `${email} was added as the provider admin.`,
        email,
        temporaryPassword: response.temporaryPassword,
      });
      setSelectedProviderId(providerId);
      toast({ title: "Provider Created", description: `${companyName} can now sign in with the temporary password.` });
    } catch (err: any) {
      setTeamFeedback({
        kind: "error",
        title: "Could not create provider",
        description: err.message || "Could not create provider account.",
      });
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
    setTeamFeedback(null);
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

      markTemporaryPasswordEmail(email);
      upsertVisibleProviderMember({
        id: response.providerMemberId ?? `provider-member-${response.userId}`,
        user_id: response.userId,
        role: newMember.role as "admin" | "member",
        created_at: new Date().toISOString(),
        name: `${firstName} ${lastName}`.trim(),
        email,
      });
      setCreatedCredentials({ email, temporaryPassword: response.temporaryPassword });
      setTeamFeedback({
        kind: "success",
        title: "Temporary password ready",
        description: `${email} was added to ${selectedProvider.company_name}.`,
        email,
        temporaryPassword: response.temporaryPassword,
      });
      setPasswordCopied(false);
      setNewMember({ fullName: "", email: "", role: "member" });
      toast({ title: "Member Added", description: `${email} can now sign in with the temporary password.` });
    } catch (err: any) {
      setTeamFeedback({
        kind: "error",
        title: "Could not add member",
        description: err.message || "Could not create provider member.",
      });
      toast({ title: "Error", description: err.message || "Could not create provider member.", variant: "destructive" });
    } finally {
      setCreatingMember(false);
    }
  };

  const handleRoleChange = async (member: ProviderMember, role: string) => {
    if (!selectedProvider) return;
    try {
      await invokeEdgeFunction("company-access-tools", {
        action: "update_company_member_role",
        companyType: "provider",
        companyId: selectedProvider.id,
        memberId: member.id,
        role,
      });
      setProviderMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: role as "admin" | "member" } : m)));
      setTeamFeedback({
        kind: "success",
        title: "Role updated",
        description: `${member.email || member.name} is now ${role === "admin" ? "an admin" : "a member"}.`,
      });
      toast({ title: "Role Updated" });
    } catch (err: any) {
      setTeamFeedback({
        kind: "error",
        title: "Could not update role",
        description: err.message || "Could not update role.",
      });
      toast({ title: "Error", description: err.message || "Could not update role.", variant: "destructive" });
    }
  };

  const handleGenerateTemporaryPassword = async (member: ProviderMember) => {
    if (!selectedProvider) return;
    try {
      const response = await invokeEdgeFunction<{ temporaryPassword: string }>("company-access-tools", {
        action: "generate_temporary_password",
        companyType: "provider",
        companyId: selectedProvider.id,
        userId: member.user_id,
      });
      markTemporaryPasswordEmail(member.email);
      setCreatedCredentials({ email: member.email || member.name, temporaryPassword: response.temporaryPassword });
      setTeamFeedback({
        kind: "success",
        title: "Temporary password ready",
        description: `Password reset for ${member.email || member.name}.`,
        email: member.email || member.name,
        temporaryPassword: response.temporaryPassword,
      });
      setPasswordCopied(false);
      toast({ title: "Temporary Password Created" });
    } catch (err: any) {
      setTeamFeedback({
        kind: "error",
        title: "Could not reset password",
        description: err.message || "Could not generate password.",
      });
      toast({ title: "Error", description: err.message || "Could not generate password.", variant: "destructive" });
    }
  };

  const handleRemoveMember = async (member: ProviderMember) => {
    if (!selectedProvider) return;
    if (!window.confirm(`Remove ${member.email || member.name} from this provider?`)) return;
    try {
      await invokeEdgeFunction("company-access-tools", {
        action: "remove_company_member",
        companyType: "provider",
        companyId: selectedProvider.id,
        memberId: member.id,
        userId: member.user_id,
      });
      setProviderMembers((prev) => prev.filter((m) => m.id !== member.id));
      setTeamFeedback({
        kind: "success",
        title: "Member removed",
        description: `${member.email || member.name} was removed from this provider.`,
      });
      toast({ title: "Member Removed" });
    } catch (err: any) {
      setTeamFeedback({
        kind: "error",
        title: "Could not remove member",
        description: err.message || "Could not remove member.",
      });
      toast({ title: "Error", description: err.message || "Could not remove member.", variant: "destructive" });
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await handleProviderPatch(id, { status });
  };

  const busy = creatingProvider || creatingMember || Boolean(updating);

  return (
    <>
      <PageShell
        title="Providers"
        subtitle="Manage provider companies and team access"
        badge="Admin"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-2" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Provider Account
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void fetchProviders()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      >
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
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
                  disabled={creatingProvider}
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
                    disabled={creatingProvider}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider-admin-last-name">Admin Last Name</Label>
                  <Input
                    id="provider-admin-last-name"
                    value={newProvider.adminLastName}
                    onChange={(e) => setNewProvider((prev) => ({ ...prev, adminLastName: e.target.value }))}
                    placeholder="Provider"
                    disabled={creatingProvider}
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
                  disabled={creatingProvider}
                />
              </div>
              <Button className="w-full" onClick={handleCreateProviderAccount} disabled={creatingProvider}>
                {creatingProvider ? "Creating..." : "Create Account"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {selectedProvider ? (
          <div className="space-y-6">
            <Button variant="ghost" size="sm" onClick={() => setSelectedProviderId(null)} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to providers
            </Button>

            <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b bg-gradient-to-r from-blue-500/5 via-transparent to-transparent">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">{selectedProvider.company_name}</h2>
                      <p className="text-sm text-muted-foreground">Provider ID: {selectedProvider.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selectedProvider.status} />
                    {selectedProvider.status !== "approved" ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => updateStatus(selectedProvider.id, "approved")}>
                        Approve
                      </Button>
                    ) : null}
                    {selectedProvider.status !== "suspended" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        disabled={busy}
                        onClick={() => updateStatus(selectedProvider.id, "suspended")}
                      >
                        Suspend
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="rounded-xl border bg-gradient-to-br from-violet-500/5 to-transparent p-5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Shield className="w-4 h-4" />
                      Admins
                    </div>
                    <div className="text-3xl font-bold mt-2">{adminCount}</div>
                    <div className="text-xs text-muted-foreground mt-1">Provider administrators</div>
                  </div>
                  <div className="rounded-xl border bg-gradient-to-br from-blue-500/5 to-transparent p-5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      Members
                    </div>
                    <div className="text-3xl font-bold mt-2">{memberCount}</div>
                    <div className="text-xs text-muted-foreground mt-1">Team members</div>
                  </div>
                  <div className="rounded-xl border bg-gradient-to-br from-emerald-500/5 to-transparent p-5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <UserCog className="w-4 h-4" />
                      Active
                    </div>
                    <div className="text-3xl font-bold mt-2">{activeCount}</div>
                    <div className="text-xs text-muted-foreground mt-1">Listed provider users</div>
                  </div>
                  <div className="rounded-xl border bg-gradient-to-br from-amber-500/5 to-transparent p-5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      Regions
                    </div>
                    <div className="text-3xl font-bold mt-2">{regionCount}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {selectedProvider.regions_served?.join(", ") || "No regions listed"}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Provider Settings</h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground" htmlFor="provider-detail-name">Provider Name</Label>
                        <Input
                          id="provider-detail-name"
                          defaultValue={selectedProvider.company_name}
                          className="mt-1 bg-background/70"
                          disabled={busy}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (!next || next === selectedProvider.company_name) return;
                            void handleProviderPatch(selectedProvider.id, { company_name: next });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground" htmlFor="provider-detail-email">Contact Email</Label>
                        <Input
                          id="provider-detail-email"
                          defaultValue={selectedProvider.contact_email ?? ""}
                          className="mt-1 bg-background/70"
                          disabled={busy}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next === (selectedProvider.contact_email ?? "")) return;
                            void handleProviderPatch(selectedProvider.id, { contact_email: next || null });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground" htmlFor="provider-detail-phone">Phone</Label>
                        <Input
                          id="provider-detail-phone"
                          defaultValue={selectedProvider.contact_phone ?? ""}
                          className="mt-1 bg-background/70"
                          disabled={busy}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next === (selectedProvider.contact_phone ?? "")) return;
                            void handleProviderPatch(selectedProvider.id, { contact_phone: next || null });
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Provider Details</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">Primary Email</div>
                          <div className="text-sm font-medium">{selectedProvider.contact_email ?? "—"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">Joined</div>
                          <div className="text-sm font-medium">{format(new Date(selectedProvider.created_at), "MMM d, yyyy")}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b bg-gradient-to-r from-blue-500/5 via-transparent to-transparent">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Team Members</h2>
                    <p className="text-sm text-muted-foreground">Manage members and administrators for this provider</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-6 p-4 rounded-xl border bg-gradient-to-r from-violet-500/5 via-transparent to-transparent">
                  <h3 className="text-sm font-semibold mb-3">Add Team Member</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-4">
                      <Label className="text-xs text-muted-foreground" htmlFor="provider-member-full-name">Member full name</Label>
                      <Input
                        id="provider-member-full-name"
                        value={newMember.fullName}
                        onChange={(e) => setNewMember((prev) => ({ ...prev, fullName: e.target.value }))}
                        className="mt-1 bg-background/70"
                        placeholder="Pat Provider"
                        disabled={busy}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <Label className="text-xs text-muted-foreground" htmlFor="provider-member-email">Member email</Label>
                      <Input
                        id="provider-member-email"
                        type="email"
                        value={newMember.email}
                        onChange={(e) => setNewMember((prev) => ({ ...prev, email: e.target.value }))}
                        className="mt-1 bg-background/70"
                        placeholder="employee@provider.com"
                        disabled={busy}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs text-muted-foreground" htmlFor="provider-member-role">Role</Label>
                      <select
                        id="provider-member-role"
                        value={newMember.role}
                        disabled={busy}
                        onChange={(e) => setNewMember((prev) => ({ ...prev, role: e.target.value }))}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <Button className="w-full gap-2" onClick={handleCreateProviderMember} disabled={busy || !newMember.email.trim()}>
                        <Plus className="w-4 h-4" />
                        Add Member
                      </Button>
                    </div>
                  </div>
                </div>

                {teamFeedback ? (
                  <div
                    role={teamFeedback.kind === "error" ? "alert" : "status"}
                    className={`mb-6 rounded-xl border p-4 ${
                      teamFeedback.kind === "error"
                        ? "border-red-200 bg-red-50 text-red-900"
                        : "border-green-200 bg-green-50 text-green-900"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{teamFeedback.title}</div>
                        {teamFeedback.description ? <div className="mt-1 text-sm opacity-80">{teamFeedback.description}</div> : null}
                        {teamFeedback.email ? <div className="mt-2 text-xs font-medium break-all">Login: {teamFeedback.email}</div> : null}
                        {teamFeedback.temporaryPassword ? (
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="rounded-md border bg-white/80 px-3 py-2 font-mono text-sm break-all">
                              {teamFeedback.temporaryPassword}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-fit bg-white/80"
                              onClick={() => {
                                void navigator.clipboard.writeText(teamFeedback.temporaryPassword ?? "");
                              }}
                            >
                              Copy password
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-fit"
                        onClick={() => setTeamFeedback(null)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ) : null}

                {membersLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : providerMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No provider members found.</p>
                ) : (
                  <div className="rounded-xl border overflow-hidden divide-y">
                    {providerMembers.map((m) => (
                      <div key={m.id} className="p-4 sm:p-5 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="p-2.5 rounded-xl bg-muted/50 text-muted-foreground">
                              <Mail className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-medium text-sm break-all">{m.email || m.name}</span>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium capitalize ${roleBadgeClass(m.role)}`}>
                                  {m.role}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                                <span>Display: {m.name}</span>
                                <span>User ID: {m.user_id.slice(0, 8)}...</span>
                                <span>Joined {format(new Date(m.created_at), "MMM d, yyyy")}</span>
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                            disabled={busy}
                            onClick={() => void handleRemoveMember(m)}
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove
                          </Button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[184px_184px] gap-3 items-end">
                          <div>
                            <Label className="text-xs text-muted-foreground" htmlFor={`provider-role-${m.id}`}>Role</Label>
                            <select
                              id={`provider-role-${m.id}`}
                              value={m.role}
                              disabled={busy}
                              onChange={(e) => void handleRoleChange(m, e.target.value)}
                              className="mt-1 h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-2"
                            disabled={busy}
                            onClick={() => void handleGenerateTemporaryPassword(m)}
                          >
                            <KeyRound className="w-4 h-4" />
                            Reset Password
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <Card className="rounded-2xl bg-card/80 backdrop-blur-sm shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-base">All Providers ({providers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1fr)_160px_180px]">
                <div>
                  <Label className="text-xs text-muted-foreground" htmlFor="provider-search">Search providers</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="provider-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name, email, region, or ID..."
                      className="pl-10 bg-background/70"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground" htmlFor="provider-status-filter">Status filter</Label>
                  <select
                    id="provider-status-filter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="approved">Approved</option>
                    <option value="pending">Pending</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground" htmlFor="provider-region-filter">Region filter</Label>
                  <select
                    id="provider-region-filter"
                    value={regionFilter}
                    onChange={(e) => setRegionFilter(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                  >
                    <option value="all">All regions</option>
                    {regionOptions.map((region) => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : providers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No providers found.</p>
              ) : filteredProviders.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-sm font-medium">No providers match your filters</div>
                  <div className="mt-1 text-sm text-muted-foreground">Try a different search, status, or region.</div>
                </div>
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
                    {filteredProviders.map((p) => (
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
                              Manage Team
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
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!loading && providers.length > 0 ? (
                <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                  Showing {filteredProviders.length} of {providers.length} providers
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}
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
                <div className="mt-1 text-sm font-medium break-all">{createdCredentials.email}</div>
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
