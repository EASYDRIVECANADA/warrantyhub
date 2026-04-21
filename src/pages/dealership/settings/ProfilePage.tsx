import { useEffect, useState } from "react";
import DashboardLayout, { dealershipNavItems } from "../../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { supabase } from "../../../integrations/supabase/client";
import { useAuth } from "../../../providers/AuthProvider";
import { useDealership } from "../../../hooks/useDealership";
import { useToast } from "../../../hooks/use-toast";
import { User, Lock, Building2 } from "lucide-react";

export default function DealershipProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { dealershipId, reloadDealership } = useDealership();
  const [profile, setProfile] = useState({ full_name: "", phone: "" });
  const [dealershipInfo, setDealershipInfo] = useState({ name: "", phone: "", address: "", province: "", license_number: "" });
  const [passwords, setPasswords] = useState({ new: "", confirm: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDealership, setSavingDealership] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (data) setProfile({ full_name: (data as any).full_name || "", phone: (data as any).phone || "" });
      await fetchDealershipInfo();
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const fetchDealershipInfo = async () => {
    if (!dealershipId) return;
    // Try V2 dealerships table first, then fall back to dealers
    const { data: v2 } = await supabase
      .from("dealerships")
      .select("id, name, phone, address, province, license_number")
      .eq("id", dealershipId)
      .maybeSingle();
    if (v2) {
      setDealershipInfo({
        name: (v2 as any).name || "",
        phone: (v2 as any).phone || "",
        address: (v2 as any).address || "",
        province: (v2 as any).province || "",
        license_number: (v2 as any).license_number || "",
      });
      return;
    }
    // Fallback: get from dealerships via legacy_dealer_id
    const { data: membership } = await supabase
      .from("dealership_members")
      .select("dealership_id")
      .eq("user_id", user?.id)
      .limit(1)
      .maybeSingle();
    if ((membership as any)?.dealership_id) {
      const { data: ds } = await supabase
        .from("dealerships")
        .select("id, name, phone, address, province, license_number")
        .eq("id", (membership as any).dealership_id)
        .maybeSingle();
      if (ds) {
        setDealershipInfo({
          name: (ds as any).name || "",
          phone: (ds as any).phone || "",
          address: (ds as any).address || "",
          province: (ds as any).province || "",
          license_number: (ds as any).license_number || "",
        });
      }
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: profile.full_name, phone: profile.phone })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile Updated", description: "Your profile has been saved." });
    }
  };

  const handleSaveDealership = async () => {
    if (!dealershipId) return;
    setSavingDealership(true);
    const { error } = await supabase
      .from("dealerships")
      .update({
        name: dealershipInfo.name,
        phone: dealershipInfo.phone,
        address: dealershipInfo.address,
        province: dealershipInfo.province,
        license_number: dealershipInfo.license_number,
      })
      .eq("id", dealershipId);
    setSavingDealership(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Dealership Updated", description: "Dealership info has been saved." });
      reloadDealership?.();
    }
  };

  const handleChangePassword = async () => {
    if (passwords.new !== passwords.confirm) {
      toast({ title: "Error", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    if (passwords.new.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.new });
    setChangingPassword(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password Updated", description: "Your password has been changed." });
      setPasswords({ new: "", confirm: "" });
    }
  };

  if (loading) {
    return (
      <DashboardLayout navItems={dealershipNavItems} title="Profile">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={dealershipNavItems} title="Profile">
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-5 h-5" /> Profile Information
            </CardTitle>
            <CardDescription>Update your name and contact details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed here.</p>
            </div>
            <div>
              <Label>Full Name</Label>
              <Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="(555) 123-4567" />
            </div>
            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {dealershipId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-5 h-5" /> Dealership Information
              </CardTitle>
              <CardDescription>Update your dealership details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Dealership Name</Label>
                <Input value={dealershipInfo.name} onChange={(e) => setDealershipInfo({ ...dealershipInfo, name: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={dealershipInfo.phone} onChange={(e) => setDealershipInfo({ ...dealershipInfo, phone: e.target.value })} placeholder="(555) 123-4567" />
              </div>
              <div>
                <Label>Address</Label>
                <Input value={dealershipInfo.address} onChange={(e) => setDealershipInfo({ ...dealershipInfo, address: e.target.value })} placeholder="123 Main St" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Province</Label>
                  <Input value={dealershipInfo.province} onChange={(e) => setDealershipInfo({ ...dealershipInfo, province: e.target.value })} placeholder="ON" />
                </div>
                <div>
                  <Label>License Number</Label>
                  <Input value={dealershipInfo.license_number} onChange={(e) => setDealershipInfo({ ...dealershipInfo, license_number: e.target.value })} />
                </div>
              </div>
              <Button onClick={handleSaveDealership} disabled={savingDealership}>
                {savingDealership ? "Saving..." : "Save Dealership"}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-5 h-5" /> Change Password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>New Password</Label>
              <Input type="password" value={passwords.new} onChange={(e) => setPasswords({ ...passwords, new: e.target.value })} />
            </div>
            <div>
              <Label>Confirm Password</Label>
              <Input type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} />
            </div>
            <Button variant="outline" onClick={handleChangePassword} disabled={changingPassword}>
              {changingPassword ? "Changing..." : "Change Password"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
