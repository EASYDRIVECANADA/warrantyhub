import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LogOut, Mail, Shield, Store, User, CreditCard } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getAppMode } from "../lib/runtime";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { saveLocalProviderLogo } from "../lib/providers/localProviders";
import { getSupabaseClient } from "../lib/supabase/client";
import { alertMissing, confirmProceed, sanitizeLettersOnly, sanitizeWordsOnly } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

function isAllowedLogoUpload(file: File) {
  if (file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp")) return true;
  return false;
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function ProfilePage() {
  const { user, signOut } = useAuth();
  const mode = useMemo(() => getAppMode(), []);
  const navigate = useNavigate();

  const providersApi = useMemo(() => getProvidersApi(), []);
  const qc = useQueryClient();

  const showProviderEditor = user?.role === "PROVIDER";
  const hasHydratedProviderProfile = useRef(false);

  const myProviderProfileQuery = useQuery({
    queryKey: ["my-provider-profile"],
    queryFn: () => providersApi.getMyProfile(),
    enabled: showProviderEditor,
  });

  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");

  const saveProviderProfileMutation = useMutation({
    mutationFn: async () => {
      return providersApi.updateMyProfile({ displayName, companyName });
    },
    onSuccess: async (next) => {
      setDisplayName(next.displayName ?? "");
      setCompanyName(next.companyName ?? "");
      await qc.invalidateQueries({ queryKey: ["my-provider-profile"] });
    },
  });

  useEffect(() => {
    if (!showProviderEditor) return;
    const p = myProviderProfileQuery.data as ProviderPublic | null | undefined;
    if (!p) return;
    if (hasHydratedProviderProfile.current) return;
    hasHydratedProviderProfile.current = true;
    setDisplayName((p.displayName ?? "").toString());
    setCompanyName((p.companyName ?? "").toString());
  }, [myProviderProfileQuery.data, showProviderEditor]);

  const [file, setFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!showProviderEditor) return;
    const profileLogo = (myProviderProfileQuery.data as any)?.logoUrl as string | undefined;
    if (previewUrl) return;
    if (profileLogo) setPreviewUrl(profileLogo);
  }, [myProviderProfileQuery.data, previewUrl, showProviderEditor]);

  const uploadLogoMutation = useMutation({
    mutationFn: async (input: { file: File }) => {
      if (mode === "local") {
        const profile = await providersApi.getMyProfile();
        const pid = (profile?.id ?? "").trim();
        if (!pid) throw new Error("Not authenticated");
        const logoKeyUrl = await saveLocalProviderLogo({ providerId: pid, file: input.file });
        await providersApi.updateMyProfile({ logoUrl: logoKeyUrl });
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const safeName = sanitizeFilename(input.file.name);
      const uuid = crypto.randomUUID();

      const tryProviderLogosBucket = async () => {
        const objectName = `${userId}/${uuid}-${safeName}`;
        const uploadRes = await supabase.storage.from("provider-logos").upload(objectName, input.file, {
          upsert: true,
          contentType: input.file.type || undefined,
        });
        if (uploadRes.error) throw uploadRes.error;
        return supabase.storage.from("provider-logos").getPublicUrl(objectName).data.publicUrl;
      };

      const tryProductDocumentsBucket = async () => {
        const objectName = `provider-logos/${userId}/${uuid}-${safeName}`;
        const uploadRes = await supabase.storage.from("product-documents").upload(objectName, input.file, {
          upsert: true,
          contentType: input.file.type || undefined,
        });
        if (uploadRes.error) throw uploadRes.error;
        return supabase.storage.from("product-documents").getPublicUrl(objectName).data.publicUrl;
      };

      let publicUrl: string;
      try {
        publicUrl = await tryProviderLogosBucket();
      } catch {
        publicUrl = await tryProductDocumentsBucket();
      }

      await providersApi.updateMyProfile({ logoUrl: publicUrl });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-provider-profile"] });
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: async () => {
      await providersApi.updateMyProfile({ logoUrl: null });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["my-provider-profile"] });
      setPreviewUrl(null);
      setFile(null);
      const input = document.getElementById("provider-profile-logo") as HTMLInputElement | null;
      if (input) input.value = "";
    },
  });

  const providerBusy = saveProviderProfileMutation.isPending || uploadLogoMutation.isPending || removeLogoMutation.isPending;

  return (
    <PageShell title="">
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/8 via-transparent to-yellow-400/8 blur-2xl" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-5">
            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-5 border-b bg-gradient-to-r from-blue-600/8 via-transparent to-yellow-400/8">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold">Account</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Your profile information</div>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white text-2xl font-bold mb-3">
                    {user?.email?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                  <div className="text-sm font-semibold truncate max-w-full">{user?.email ?? "—"}</div>
                  <div className="mt-1">
                    <span className="inline-flex items-center rounded-full border bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 border-blue-200">
                      {user?.role ?? "—"}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div className="text-xs text-muted-foreground truncate flex-1">{user?.email ?? "—"}</div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <div className="text-xs text-muted-foreground truncate flex-1">
                      {user?.role === "DEALER_ADMIN" || user?.role === "DEALER_EMPLOYEE" ? user?.companyName ?? user?.dealerId ?? "—" : "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div className="text-xs text-muted-foreground flex-1">
                      {mode === "supabase" ? "Cloud Authentication" : "Local Mode"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-5 border-b bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/10 text-red-600">
                    <LogOut className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold">Sign Out</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Sign out of your account</div>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <Button
                  variant="outline"
                  className="w-full hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                  onClick={() => {
                    void (async () => {
                      await signOut();
                      navigate("/find-insurance", { replace: true });
                    })();
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-5">
            {showProviderEditor ? (
              <>
                <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
                  <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/8 via-transparent to-yellow-400/8">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-base font-semibold">Provider Profile</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Manage how your brand appears to dealerships.</div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          void (async () => {
                            if (!(await confirmProceed("Save provider profile?"))) return;
                            saveProviderProfileMutation.mutate();
                          })();
                        }}
                        disabled={providerBusy}
                      >
                        Save Changes
                      </Button>
                    </div>
                  </div>

                  <div className="p-5 space-y-5">
                    {myProviderProfileQuery.isLoading ? <div className="text-sm text-muted-foreground text-center py-4">Loading…</div> : null}
                    {myProviderProfileQuery.isError ? (
                      <div className="text-sm text-destructive py-4">
                        {(() => {
                          const e = myProviderProfileQuery.error as any;
                          const msg = typeof e?.message === "string" ? e.message : "Failed to load provider profile.";
                          return msg;
                        })()}
                      </div>
                    ) : null}
                    {saveProviderProfileMutation.isError ? (
                      <div className="text-sm text-destructive py-4">
                        {(() => {
                          const e = saveProviderProfileMutation.error as any;
                          const msg = typeof e?.message === "string" ? e.message : "Failed to save provider profile.";
                          return msg;
                        })()}
                      </div>
                    ) : null}

                    <div className="rounded-xl border bg-background/60 p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold">Company Information</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">Display Name</div>
                          <Input
                            value={displayName}
                            onChange={(e) => setDisplayName(sanitizeLettersOnly(e.target.value))}
                            placeholder="Example: Jay"
                            disabled={providerBusy}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">Company Name</div>
                          <Input
                            value={companyName}
                            onChange={(e) => setCompanyName(sanitizeWordsOnly(e.target.value))}
                            placeholder="Example: Bridge Warranty"
                            disabled={providerBusy}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-background/60 p-5">
                      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold">Company Logo</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              void (async () => {
                                if (!(await confirmProceed("Remove logo?"))) return;
                                try {
                                  await removeLogoMutation.mutateAsync();
                                } catch (e) {
                                  const anyE = e as any;
                                  const msg = typeof anyE?.message === "string" ? anyE.message : "Failed to remove logo";
                                  setLogoError(msg);
                                }
                              })();
                            }}
                            disabled={providerBusy || (!previewUrl && !(myProviderProfileQuery.data as any)?.logoUrl)}
                          >
                            Remove
                          </Button>
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              void (async () => {
                                setLogoError(null);
                                if (!file) return alertMissing("Choose a file to upload.");
                                if (!isAllowedLogoUpload(file)) return alertMissing("Only image files are allowed (PNG, JPG, WEBP).");
                                try {
                                  await uploadLogoMutation.mutateAsync({ file });
                                  setFile(null);
                                  const input = document.getElementById("provider-profile-logo") as HTMLInputElement | null;
                                  if (input) input.value = "";
                                } catch (e) {
                                  const anyE = e as any;
                                  const msg = typeof anyE?.message === "string" ? anyE.message : "Failed to upload";
                                  const code = typeof anyE?.code === "string" ? anyE.code : null;
                                  const status =
                                    typeof anyE?.statusCode === "number"
                                      ? anyE.statusCode
                                      : typeof anyE?.status === "number"
                                        ? anyE.status
                                        : null;
                                  const parts = [msg, code ? `code=${code}` : null, status !== null ? `status=${status}` : null].filter(Boolean);
                                  setLogoError(parts.length > 0 ? parts.join(" | ") : msg);
                                }
                              })();
                            }}
                            disabled={providerBusy}
                          >
                            Upload Logo
                          </Button>
                        </div>
                      </div>

                      {logoError ? (
                        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                          <p className="text-sm text-destructive">{logoError}</p>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                        <div className="space-y-3">
                          <input
                            id="provider-profile-logo"
                            type="file"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              setFile(f);
                              if (!f) return;
                              if (!isAllowedLogoUpload(f)) return;
                              const url = URL.createObjectURL(f);
                              setPreviewUrl(url);
                            }}
                            className="sr-only"
                            accept="image/*"
                            disabled={providerBusy}
                          />

                          <label
                            htmlFor="provider-profile-logo"
                            className={
                              "group flex items-center justify-between gap-3 rounded-xl border-2 border-dashed bg-background/40 px-4 py-4 transition-all cursor-pointer " +
                              "hover:border-blue-400 hover:bg-blue-50/50 focus-within:ring-2 focus-within:ring-blue-600/30 " +
                              (providerBusy ? "opacity-60 cursor-not-allowed" : "cursor-pointer")
                            }
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium">Choose a logo file</div>
                              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                {file?.name ? file.name : "PNG / JPG / WEBP (max 3MB)"}
                              </div>
                            </div>
                            <div className="shrink-0 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground group-hover:bg-muted/60">
                              Browse
                            </div>
                          </label>
                        </div>

                        <div className="rounded-xl border bg-muted/20 p-4">
                          <div className="text-xs font-medium text-muted-foreground mb-3">Preview</div>
                          <div className="flex items-center gap-4">
                            <div className="h-14 w-14 rounded-xl border-2 border-dashed bg-white overflow-hidden flex items-center justify-center">
                              {previewUrl ? (
                                <img src={previewUrl} alt="Provider logo" className="h-full w-full object-contain" />
                              ) : (
                                <Building2 className="h-6 w-6 text-muted-foreground/40" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{(companyName || displayName || "Your company").trim()}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">Appears in search and product pages</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
                <div className="px-6 py-5 border-b bg-gradient-to-r from-blue-600/8 via-transparent to-yellow-400/8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-base font-semibold">Account Settings</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Manage your account preferences.</div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="rounded-xl border bg-background/60 p-6">
                    <div className="flex flex-col items-center text-center">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white text-xl font-bold mb-4">
                        {user?.email?.charAt(0).toUpperCase() ?? "?"}
                      </div>
                      <h3 className="text-base font-semibold">{user?.email ?? "—"}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {user?.role === "DEALER_ADMIN" || user?.role === "DEALER_EMPLOYEE" ? user?.companyName ?? "—" : "—"}
                      </p>
                      <div className="mt-3">
                        <span className="inline-flex items-center rounded-full border bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 border-blue-200">
                          {user?.role ?? "—"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-6 pt-6 border-t space-y-3">
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-muted-foreground">Authentication</span>
                        <span className="text-sm font-medium">
                          {mode === "supabase" ? "Cloud (Supabase)" : "Local Mode"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-muted-foreground">Account ID</span>
                        <span className="text-sm font-medium font-mono truncate max-w-[200px]">{user?.id ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
